// src/app/api/whatsapp/webhook/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Receive → log → upsert lead → upsert conversation → activity log
// Phase 2 (later): AI reply
// Phase 3 (later): Send WhatsApp reply
//
// ALL columns written here are taken directly from the live Supabase
// information_schema query. Nothing is assumed from migration files.
//
// ── leads (columns used) ────────────────────────────────────────────────────
//   session_id, phone, name, source, status, notes,
//   last_contacted_at, whatsapp_opted_in
//   NOT USED: inquiry_summary (does not exist), whatsapp_last_message_at (does not exist)
//
// ── conversations (columns used) ────────────────────────────────────────────
//   session_id, source, phone, name, status, channel,
//   lead_id, messages (jsonb), is_active, updated_at
//
// ── activity_logs (columns used) ────────────────────────────────────────────
//   lead_id, action, description, performed_by, channel,
//   metadata (jsonb), details (jsonb)
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

    // Log full raw payload for Vercel debugging
    console.log(
      "[WhatsApp Webhook] 📨 Full payload:",
      JSON.stringify(body, null, 2)
    );

    // Walk the WhatsApp Cloud API envelope
    const entry  = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value  = change?.value;

    // ── Status callbacks (delivered / read / sent) — not inbound messages ────
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

    // ── Extract message fields ────────────────────────────────────────────────
    const senderPhone : string = message.from                         ?? "unknown";
    const messageId   : string = message.id                           ?? "unknown";
    const rawTs       : string = message.timestamp                    ?? "";
    const messageText : string = message.text?.body                   ?? "";
    const senderName  : string = value?.contacts?.[0]?.profile?.name ?? "";
    const messageType : string = message.type                         ?? "unknown";

    // WhatsApp timestamps are Unix seconds — convert to ISO
    const messageTimestamp = rawTs
      ? new Date(parseInt(rawTs, 10) * 1000).toISOString()
      : new Date().toISOString();

    console.log("[WhatsApp Webhook] 💬 Inbound message:", {
      senderPhone,
      senderName       : senderName  || "(no profile name)",
      messageText      : messageText || `[non-text: ${messageType}]`,
      messageId,
      messageTimestamp,
    });

    // Persist — fully isolated; DB failure must never block Meta's 200
    await saveToSupabase({
      senderPhone,
      senderName,
      messageText,
      messageId,
      messageTimestamp,
      messageType,
    });

  } catch (err) {
    console.error("[WhatsApp Webhook] 🔥 Unexpected error in POST handler:", err);
  }

  // Always 200 to Meta — no exceptions
  return NextResponse.json({ status: "ok" }, { status: 200 });
}

// ─── Supabase error logger ────────────────────────────────────────────────────
// Logs every field Supabase returns on error so nothing is hidden.
function logSupabaseError(label: string, err: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
} | null) {
  if (!err) return;
  console.error(`[WhatsApp Webhook] ❌ ${label}:`, {
    message : err.message,
    code    : err.code,
    details : err.details,
    hint    : err.hint,
  });
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
    const sessionId = `whatsapp_${senderPhone}`;

    // ── STEP 1: Lead — find or create ─────────────────────────────────────────
    //
    // Columns on INSERT:
    //   session_id, phone, name, source, status,
    //   notes, last_contacted_at, whatsapp_opted_in
    //
    // Columns on UPDATE:
    //   last_contacted_at, whatsapp_opted_in, notes
    //   + name only when existing name is null/empty and senderName is available
    //
    // Explicitly NOT written:
    //   inquiry_summary       — does not exist in live DB
    //   whatsapp_last_message_at — does not exist in live DB
    // ─────────────────────────────────────────────────────────────────────────

    let leadId: string | null = null;

    const { data: existingLead, error: leadLookupErr } = await db
      .from("leads")
      .select("id, name, phone, status, notes")
      .eq("phone", senderPhone)
      .maybeSingle();

    if (leadLookupErr) logSupabaseError("Lead lookup", leadLookupErr);

    if (existingLead) {
      leadId = existingLead.id;
      console.log("[WhatsApp Webhook] ✅ Existing lead found:", {
        leadId,
        name   : existingLead.name   ?? "(no name)",
        phone  : existingLead.phone,
        status : existingLead.status,
      });

      // Build update payload — only confirmed live columns
      const updatePayload: Record<string, unknown> = {
        last_contacted_at : messageTimestamp,
        whatsapp_opted_in : true,
        // Append latest message to notes (keeps history visible in CRM)
        notes: messageText
          ? `${existingLead.notes ? existingLead.notes + "\n\n" : ""}[WhatsApp ${messageTimestamp}]: ${messageText}`
          : existingLead.notes,
      };

      // Backfill name only when blank
      if (senderName && !existingLead.name) {
        updatePayload.name = senderName;
      }

      const { error: leadUpdateErr } = await db
        .from("leads")
        .update(updatePayload)
        .eq("id", leadId);

      if (leadUpdateErr) logSupabaseError("Lead update", leadUpdateErr);

    } else {
      // Create new lead — status value "new" matches live DB CHECK constraint
      const { data: newLead, error: leadCreateErr } = await db
        .from("leads")
        .insert({
          session_id        : sessionId,
          phone             : senderPhone,
          name              : senderName || null,
          source            : "whatsapp",
          status            : "new",
          notes             : messageText
            ? `First WhatsApp message: "${messageText}"`
            : "WhatsApp contact — no text in first message",
          last_contacted_at : messageTimestamp,
          whatsapp_opted_in : true,
        })
        .select("id")
        .single();

      if (leadCreateErr) {
        logSupabaseError("Lead create", leadCreateErr);
        // Continue — attempt conversation save even without a leadId
      } else {
        leadId = newLead?.id ?? null;
        console.log("[WhatsApp Webhook] 🆕 New lead created:", {
          leadId,
          phone : senderPhone,
          name  : senderName || "(no name)",
        });
      }
    }

    // ── STEP 2: Conversation — find or create ─────────────────────────────────
    //
    // session_id is unique — one thread per WhatsApp number.
    //
    // Columns on INSERT:
    //   session_id, source, phone, name, status, channel,
    //   lead_id, messages (jsonb), is_active
    //
    // Columns on UPDATE:
    //   source, phone, name, channel, lead_id,
    //   messages (append), is_active, status, updated_at
    //
    // All columns confirmed present in live information_schema.
    // ─────────────────────────────────────────────────────────────────────────

    const { data: existingConv, error: convLookupErr } = await db
      .from("conversations")
      .select("id, messages")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (convLookupErr) logSupabaseError("Conversation lookup", convLookupErr);

    // Message entry shape consistent with website chatbot in this codebase
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
          source     : "whatsapp",
          phone      : senderPhone,
          ...(senderName ? { name: senderName } : {}),
          channel    : "whatsapp",
          ...(leadId ? { lead_id: leadId } : {}),
          messages   : [...prior, newEntry],
          is_active  : true,
          status     : "active",
          updated_at : new Date().toISOString(),
        })
        .eq("id", existingConv.id);

      if (convUpdateErr) {
        logSupabaseError("Conversation update", convUpdateErr);
      } else {
        console.log("[WhatsApp Webhook] 💾 Message appended to conversation:", existingConv.id);
      }

    } else {
      const { data: newConv, error: convCreateErr } = await db
        .from("conversations")
        .insert({
          session_id : sessionId,
          source     : "whatsapp",
          phone      : senderPhone,
          name       : senderName || null,
          status     : "active",
          channel    : "whatsapp",
          lead_id    : leadId,
          messages   : [newEntry],
          is_active  : true,
        })
        .select("id")
        .single();

      if (convCreateErr) {
        logSupabaseError("Conversation create", convCreateErr);
      } else {
        console.log("[WhatsApp Webhook] 💾 New conversation created:", newConv?.id);
      }
    }

    // ── STEP 3: Activity log ──────────────────────────────────────────────────
    //
    // Columns used (all confirmed in live information_schema):
    //   lead_id, action, description, performed_by, channel
    //   metadata (jsonb) — for structured context (messageId, phone, type)
    //   details  (jsonb) — for message content
    //
    // Both 'metadata' and 'details' are confirmed jsonb columns in live DB.
    // Only written when we have a leadId.
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
            ? `WhatsApp message from ${senderPhone}: "${shortText}"`
            : `WhatsApp ${messageType} message received from ${senderPhone}`,
          performed_by : "system",
          channel      : "whatsapp",
          metadata     : {
            whatsapp_message_id : messageId,
            sender_phone        : senderPhone,
            message_type        : messageType,
            timestamp           : messageTimestamp,
          },
          details      : {
            message_text : messageText || null,
            sender_name  : senderName  || null,
          },
        });

      if (logErr) {
        logSupabaseError("Activity log", logErr);
      } else {
        console.log("[WhatsApp Webhook] 📋 Activity logged for lead:", leadId);
      }
    }

  } catch (dbErr) {
    // Never let this bubble up to the POST handler
    console.error("[WhatsApp Webhook] 🔥 saveToSupabase unexpected error:", dbErr);
  }
}
