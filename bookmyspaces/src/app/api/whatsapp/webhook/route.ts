// src/app/api/whatsapp/webhook/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Receive → log → upsert lead → upsert conversation → activity log
// Phase 2 (later): AI reply
// Phase 3 (later): Send WhatsApp reply
//
// Column sources (verified against all SQL migrations 001–007):
//
// leads:          id, name, phone, source, status, notes, inquiry_summary,
//                 last_contacted_at, whatsapp_opted_in, whatsapp_last_message_at
//
// conversations:  id, session_id, channel ('website'|'whatsapp'), lead_id,
//                 messages (JSONB []), is_active, updated_at
//                 (channel and lead_id ARE real columns — confirmed in 001)
//
// activity_logs:  id, lead_id, action, description, performed_by,
//                 metadata (JSONB), channel
//                 (channel added in 002; description is the text column, NOT details)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// ─── GET: Meta webhook verification ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[WhatsApp Webhook] ✅ GET verification successful");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[WhatsApp Webhook] ❌ GET verification failed", { mode, token });
  return new NextResponse("Forbidden", { status: 403 });
}

// ─── POST: Incoming WhatsApp events ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Log full payload — useful during development
    console.log(
      "[WhatsApp Webhook] 📨 Full payload:",
      JSON.stringify(body, null, 2)
    );

    // Safely walk the WhatsApp Cloud API envelope
    const entry  = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value  = change?.value;

    // ── Delivery / read / sent status callbacks — not inbound messages ────────
    if (value?.statuses?.length) {
      const s = value.statuses[0];
      console.log("[WhatsApp Webhook] 🔔 Status update (no action needed):", {
        messageId : s?.id,
        status    : s?.status,
        recipient : s?.recipient_id,
        timestamp : s?.timestamp,
      });
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    // ── Inbound message guard ─────────────────────────────────────────────────
    const message = value?.messages?.[0];
    if (!message) {
      console.log("[WhatsApp Webhook] ℹ️  No message in payload — returning 200");
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    // ── Extract message fields ────────────────────────────────────────────────
    const senderPhone : string = message.from                         ?? "unknown";
    const messageId   : string = message.id                           ?? "unknown";
    const rawTs       : string = message.timestamp                    ?? "";
    const messageText : string = message.text?.body                   ?? "";
    const senderName  : string = value?.contacts?.[0]?.profile?.name ?? "";
    const messageType : string = message.type                         ?? "unknown";

    // WhatsApp timestamps are Unix seconds → convert to ISO string
    const messageTimestamp = rawTs
      ? new Date(parseInt(rawTs, 10) * 1000).toISOString()
      : new Date().toISOString();

    console.log("[WhatsApp Webhook] 💬 Inbound message:", {
      senderPhone,
      senderName       : senderName  || "(no profile name)",
      messageText      : messageText || `[non-text type: ${messageType}]`,
      messageId,
      messageTimestamp,
    });

    // ── Persist to Supabase — never let this block Meta getting 200 ───────────
    await saveToSupabase({
      senderPhone,
      senderName,
      messageText,
      messageId,
      messageTimestamp,
      messageType,
    });

  } catch (err) {
    // Top-level catch — still return 200 so Meta never retries indefinitely
    console.error("[WhatsApp Webhook] 🔥 Unexpected error in POST handler:", err);
  }

  // Always return 200 to Meta
  return NextResponse.json({ status: "ok" }, { status: 200 });
}

// ─── Persistence helper ───────────────────────────────────────────────────────

interface InboundMessage {
  senderPhone      : string;
  senderName       : string;
  messageText      : string;
  messageId        : string;
  messageTimestamp : string;
  messageType      : string;
}

async function saveToSupabase(msg: InboundMessage): Promise<void> {
  const { senderPhone, senderName, messageText, messageId, messageTimestamp, messageType } = msg;

  // Wrap everything — a DB failure must never propagate to the POST handler
  try {
    const db = getSupabaseAdmin();

    // ── STEP 1: Find or create lead ───────────────────────────────────────────
    // Columns used: id, name, phone, source, status, notes, inquiry_summary,
    //               last_contacted_at, whatsapp_opted_in, whatsapp_last_message_at
    // (all confirmed present in leads table across migrations 001 + 002 + 005)

    let leadId: string | null = null;

    const { data: existingLead, error: leadLookupErr } = await db
      .from("leads")
      .select("id, name, phone, status")
      .eq("phone", senderPhone)
      .maybeSingle();

    if (leadLookupErr) {
      console.error("[WhatsApp Webhook] ❌ Lead lookup error:", leadLookupErr.message);
    }

    if (existingLead) {
      leadId = existingLead.id;
      console.log("[WhatsApp Webhook] ✅ Existing lead found:", {
        leadId,
        name   : existingLead.name   ?? "(no name)",
        phone  : existingLead.phone,
        status : existingLead.status,
      });

      // Update timestamps and optionally backfill name
      const { error: leadUpdateErr } = await db
        .from("leads")
        .update({
          last_contacted_at        : messageTimestamp,
          whatsapp_last_message_at : messageTimestamp,
          // Only set name if lead has none and WhatsApp profile provided one
          ...(senderName && !existingLead.name ? { name: senderName } : {}),
        })
        .eq("id", leadId);

      if (leadUpdateErr) {
        console.error("[WhatsApp Webhook] ❌ Lead update error:", leadUpdateErr.message);
      }

    } else {
      // No existing lead — create one
      const { data: newLead, error: leadCreateErr } = await db
        .from("leads")
        .insert({
          phone                    : senderPhone,
          name                     : senderName || null,
          source                   : "whatsapp",          // CHECK constraint: 'whatsapp' ✓
          status                   : "new_inquiry",        // CHECK constraint: 'new_inquiry' ✓
          whatsapp_opted_in        : true,
          whatsapp_last_message_at : messageTimestamp,
          last_contacted_at        : messageTimestamp,
          notes                    : messageText
            ? `First WhatsApp message: "${messageText}"`
            : "WhatsApp contact — no text in first message",
          inquiry_summary          : messageText || null,
        })
        .select("id")
        .single();

      if (leadCreateErr) {
        console.error("[WhatsApp Webhook] ❌ Lead create error:", leadCreateErr.message);
      } else {
        leadId = newLead?.id ?? null;
        console.log("[WhatsApp Webhook] 🆕 New lead created:", {
          leadId,
          phone : senderPhone,
          name  : senderName || "(no name)",
        });
      }
    }

    // ── STEP 2: Upsert conversation thread ────────────────────────────────────
    // Columns used: id, session_id, channel, lead_id, messages (JSONB),
    //               is_active, updated_at
    //
    // session_id is UNIQUE — one thread per WhatsApp number.
    // channel = 'whatsapp' matches the CHECK constraint in 001.
    // lead_id and messages are confirmed real columns (001_initial_schema.sql).
    // is_active is a real column (001_initial_schema.sql).

    const sessionId = `whatsapp_${senderPhone}`;

    const { data: existingConv, error: convLookupErr } = await db
      .from("conversations")
      .select("id, messages")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (convLookupErr) {
      console.error("[WhatsApp Webhook] ❌ Conversation lookup error:", convLookupErr.message);
    }

    // Message entry shape: {role, content, timestamp, meta}
    // Matches the shape used by the website chatbot in this codebase
    const newEntry = {
      role      : "user",
      content   : messageText || `[${messageType} message]`,
      timestamp : messageTimestamp,
      meta      : {
        whatsapp_message_id : messageId,
        message_type        : messageType,
      },
    };

    if (existingConv) {
      const prior: unknown[] = Array.isArray(existingConv.messages)
        ? existingConv.messages
        : [];

      const { error: convUpdateErr } = await db
        .from("conversations")
        .update({
          messages   : [...prior, newEntry],
          updated_at : new Date().toISOString(),
          // Re-link lead if we have one (handles case where lead was created just now)
          ...(leadId ? { lead_id: leadId } : {}),
        })
        .eq("id", existingConv.id);

      if (convUpdateErr) {
        console.error("[WhatsApp Webhook] ❌ Conversation update error:", convUpdateErr.message);
      } else {
        console.log("[WhatsApp Webhook] 💾 Message appended to conversation:", existingConv.id);
      }

    } else {
      const { data: newConv, error: convCreateErr } = await db
        .from("conversations")
        .insert({
          session_id : sessionId,
          channel    : "whatsapp",     // CHECK('website'|'whatsapp') — confirmed ✓
          lead_id    : leadId,
          messages   : [newEntry],
          is_active  : true,
        })
        .select("id")
        .single();

      if (convCreateErr) {
        console.error("[WhatsApp Webhook] ❌ Conversation create error:", convCreateErr.message);
      } else {
        console.log("[WhatsApp Webhook] 💾 New conversation created:", newConv?.id);
      }
    }

    // ── STEP 3: Activity log ──────────────────────────────────────────────────
    // Columns used: lead_id, action, description, performed_by, metadata, channel
    //
    // description is the correct text column (NOT 'details') — confirmed in 001.
    // metadata is JSONB — confirmed in 001.
    // channel was added to activity_logs in 002 — confirmed in 002 + 005.
    // performed_by has DEFAULT 'system' — confirmed in 001.

    if (leadId) {
      const shortText = messageText.length > 120
        ? `${messageText.slice(0, 120)}…`
        : messageText;

      const { error: logErr } = await db
        .from("activity_logs")
        .insert({
          lead_id      : leadId,
          action       : "whatsapp_message_received",
          description  : messageText
            ? `WhatsApp message: "${shortText}"`
            : `WhatsApp ${messageType} message received`,
          performed_by : "system",
          channel      : "whatsapp",
          metadata     : {
            whatsapp_message_id : messageId,
            message_type        : messageType,
            timestamp           : messageTimestamp,
          },
        });

      if (logErr) {
        console.error("[WhatsApp Webhook] ❌ Activity log error:", logErr.message);
      } else {
        console.log("[WhatsApp Webhook] 📋 Activity logged for lead:", leadId);
      }
    }

  } catch (dbErr) {
    // Catch-all — DB errors must never reach the POST handler
    console.error("[WhatsApp Webhook] 🔥 saveToSupabase unexpected error:", dbErr);
  }
}
