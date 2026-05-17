// src/app/api/whatsapp/webhook/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Receive → log → upsert lead → upsert conversation → activity log
// Phase 2 (later): AI reply
// Phase 3 (later): Send WhatsApp reply
//
// COLUMN INVENTORY — verified against live Supabase schema cache error and
// all SQL migration files (001–007). Only confirmed-safe columns are used.
//
// leads (used here):
//   name, phone, source, status, notes,
//   last_contacted_at, whatsapp_opted_in, whatsapp_last_message_at
//   *** inquiry_summary intentionally omitted — NOT in live DB schema cache ***
//
// conversations (used here):
//   session_id, channel, lead_id, messages (JSONB), is_active, updated_at
//
// activity_logs (used here):
//   lead_id, action, description, performed_by, metadata (JSONB), channel
//   *** column is 'metadata' NOT 'details' — confirmed in 001_initial_schema ***
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// ─── GET: Meta webhook verification ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const mode        = searchParams.get("hub.mode");
  const token       = searchParams.get("hub.verify_token");
  const challenge   = searchParams.get("hub.challenge");
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

    // Log full raw payload for debugging in Vercel logs
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

    // ── Guard: no inbound message ─────────────────────────────────────────────
    const message = value?.messages?.[0];
    if (!message) {
      console.log("[WhatsApp Webhook] ℹ️  No message in payload — returning 200");
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    // ── Extract inbound message fields ────────────────────────────────────────
    const senderPhone : string = message.from                         ?? "unknown";
    const messageId   : string = message.id                           ?? "unknown";
    const rawTs       : string = message.timestamp                    ?? "";
    const messageText : string = message.text?.body                   ?? "";
    const senderName  : string = value?.contacts?.[0]?.profile?.name ?? "";
    const messageType : string = message.type                         ?? "unknown";

    // WhatsApp timestamps are Unix seconds — convert to ISO string
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

    // Persist — isolated so DB failures never block the 200 response to Meta
    await saveToSupabase({ senderPhone, senderName, messageText, messageId, messageTimestamp, messageType });

  } catch (err) {
    // Top-level safety net — still 200 so Meta never retries indefinitely
    console.error("[WhatsApp Webhook] 🔥 Unexpected error in POST handler:", err);
  }

  // Always return 200 to Meta
  return NextResponse.json({ status: "ok" }, { status: 200 });
}

// ─── Persistence ──────────────────────────────────────────────────────────────

interface InboundMessage {
  senderPhone      : string;
  senderName       : string;
  messageText      : string;
  messageId        : string;
  messageTimestamp : string;
  messageType      : string;
}

async function saveToSupabase(msg: InboundMessage): Promise<void> {
  const {
    senderPhone,
    senderName,
    messageText,
    messageId,
    messageTimestamp,
    messageType,
  } = msg;

  try {
    const db = getSupabaseAdmin();

    // ── STEP 1: Find or create lead ───────────────────────────────────────────
    //
    // Columns written on CREATE:
    //   phone, name, source, status, notes,
    //   whatsapp_opted_in, whatsapp_last_message_at, last_contacted_at
    //
    // Columns written on UPDATE:
    //   whatsapp_last_message_at, last_contacted_at, name (only if blank)
    //
    // Columns intentionally NOT used:
    //   inquiry_summary — confirmed absent from live DB schema cache
    //   campaign_tags   — not relevant at inbound time
    //   tags, lead_score, event_*, budget, venue — not available yet
    // ─────────────────────────────────────────────────────────────────────────

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
      // ── Lead exists ───────────────────────────────────────────────────────
      leadId = existingLead.id;
      console.log("[WhatsApp Webhook] ✅ Existing lead found:", {
        leadId,
        name   : existingLead.name   ?? "(no name)",
        phone  : existingLead.phone,
        status : existingLead.status,
      });

      const { error: leadUpdateErr } = await db
        .from("leads")
        .update({
          whatsapp_last_message_at : messageTimestamp,
          last_contacted_at        : messageTimestamp,
          // Backfill name only if the lead has none and WhatsApp profile provided one
          ...(senderName && !existingLead.name ? { name: senderName } : {}),
        })
        .eq("id", leadId);

      if (leadUpdateErr) {
        console.error("[WhatsApp Webhook] ❌ Lead update error:", leadUpdateErr.message);
      }

    } else {
      // ── No lead — create new ──────────────────────────────────────────────
      //
      // notes holds the first message text (inquiry_summary is NOT used —
      // it is absent from the live DB even though it appears in migration 001,
      // meaning that migration was never applied to production).
      //
      // source CHECK constraint: 'whatsapp' is a valid value ✓
      // status CHECK constraint: 'new_inquiry' is a valid value ✓
      // ─────────────────────────────────────────────────────────────────────

      const { data: newLead, error: leadCreateErr } = await db
        .from("leads")
        .insert({
          phone                    : senderPhone,
          name                     : senderName || null,
          source                   : "whatsapp",
          status                   : "new_inquiry",
          whatsapp_opted_in        : true,
          whatsapp_last_message_at : messageTimestamp,
          last_contacted_at        : messageTimestamp,
          notes                    : messageText
            ? `First WhatsApp message: "${messageText}"`
            : "WhatsApp contact — no text in first message",
        })
        .select("id")
        .single();

      if (leadCreateErr) {
        console.error("[WhatsApp Webhook] ❌ Lead create error:", leadCreateErr.message);
        // Continue — still attempt to save conversation even without a leadId
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
    //
    // session_id = whatsapp_{phone} — one thread per number, UNIQUE in DB.
    // Columns used: session_id, channel, lead_id, messages, is_active, updated_at
    // All confirmed present in 001_initial_schema.sql.
    // ─────────────────────────────────────────────────────────────────────────

    const sessionId = `whatsapp_${senderPhone}`;

    const { data: existingConv, error: convLookupErr } = await db
      .from("conversations")
      .select("id, messages")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (convLookupErr) {
      console.error("[WhatsApp Webhook] ❌ Conversation lookup error:", convLookupErr.message);
    }

    // Message entry — matches {role, content, timestamp} shape used by website chatbot
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
      // Append to existing JSONB messages array
      const prior: unknown[] = Array.isArray(existingConv.messages)
        ? existingConv.messages
        : [];

      const { error: convUpdateErr } = await db
        .from("conversations")
        .update({
          messages   : [...prior, newEntry],
          updated_at : new Date().toISOString(),
          // Re-link lead in case it was just created this request
          ...(leadId ? { lead_id: leadId } : {}),
        })
        .eq("id", existingConv.id);

      if (convUpdateErr) {
        console.error("[WhatsApp Webhook] ❌ Conversation update error:", convUpdateErr.message);
      } else {
        console.log("[WhatsApp Webhook] 💾 Message appended to conversation:", existingConv.id);
      }

    } else {
      // Create a fresh conversation thread for this contact
      const { data: newConv, error: convCreateErr } = await db
        .from("conversations")
        .insert({
          session_id : sessionId,
          channel    : "whatsapp",    // CHECK('website'|'whatsapp') ✓
          lead_id    : leadId,        // nullable FK — fine if null
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
    //
    // Columns used: lead_id, action, description, performed_by, metadata, channel
    //
    // 'description' is the correct TEXT column — confirmed in 001_initial_schema.
    // 'metadata' is the correct JSONB column — confirmed in 001_initial_schema.
    // 'channel' was added in 002_phase2_whatsapp — confirmed present.
    // 'details' does NOT exist in this schema — not used.
    //
    // Only written if we have a leadId to attach the log to.
    // ─────────────────────────────────────────────────────────────────────────

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
    // Catch-all — DB errors must never propagate to the POST handler
    console.error("[WhatsApp Webhook] 🔥 saveToSupabase unexpected error:", dbErr);
  }
}
