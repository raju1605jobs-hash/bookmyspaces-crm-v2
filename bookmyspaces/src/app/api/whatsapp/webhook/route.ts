// app/api/whatsapp/webhook/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Receive WhatsApp message → upsert lead → append to conversation
// Phase 2 (later): AI reply
// Phase 3 (later): Send WhatsApp reply
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

// ─── POST: Incoming WhatsApp messages & status updates ────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Full payload log for debugging
    console.log("[WhatsApp Webhook] 📨 Full incoming payload:", JSON.stringify(body, null, 2));

    // 2. Safely navigate the WhatsApp Cloud API payload structure
    const entry  = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value  = change?.value;

    // ── Status updates (delivered / read / sent) — not inbound messages ───────
    if (value?.statuses?.length) {
      const s = value.statuses[0];
      console.log("[WhatsApp Webhook] 🔔 Status update (not a message):", {
        messageId : s?.id,
        status    : s?.status,
        recipient : s?.recipient_id,
        timestamp : s?.timestamp,
      });
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    // ── Inbound message check ─────────────────────────────────────────────────
    const message = value?.messages?.[0];

    if (!message) {
      console.log("[WhatsApp Webhook] ℹ️ No WhatsApp message found in payload");
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    // 3. Extract fields
    const senderPhone    : string = message.from                         ?? "unknown";
    const messageId      : string = message.id                           ?? "unknown";
    const rawTimestamp   : string = message.timestamp                    ?? "";
    const messageText    : string = message.text?.body                   ?? "";
    const senderName     : string = value?.contacts?.[0]?.profile?.name ?? "";
    const messageType    : string = message.type                         ?? "unknown";

    // Convert Unix timestamp → ISO string (Meta sends seconds, not milliseconds)
    const messageTimestamp = rawTimestamp
      ? new Date(parseInt(rawTimestamp, 10) * 1000).toISOString()
      : new Date().toISOString();

    console.log("[WhatsApp Webhook] 💬 Message received:", {
      senderPhone,
      senderName       : senderName  || "(no profile name)",
      messageText      : messageText || `[non-text: ${messageType}]`,
      messageId,
      messageTimestamp,
    });

    // 4. Save to Supabase — wrapped in its own try/catch so a DB error
    //    NEVER causes a 500 back to Meta (which would trigger retries).
    await saveToSupabase({
      senderPhone,
      senderName,
      messageText,
      messageId,
      messageTimestamp,
      messageType,
    });

    // 5. Always return 200 quickly to Meta
    return NextResponse.json({ status: "ok" }, { status: 200 });

  } catch (err) {
    // Top-level safety net — still return 200 so Meta doesn't retry infinitely
    console.error("[WhatsApp Webhook] 🔥 Unexpected top-level error:", err);
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
}

// ─── Supabase persistence ─────────────────────────────────────────────────────

interface MessagePayload {
  senderPhone      : string;
  senderName       : string;
  messageText      : string;
  messageId        : string;
  messageTimestamp : string;
  messageType      : string;
}

async function saveToSupabase(payload: MessagePayload): Promise<void> {
  const {
    senderPhone,
    senderName,
    messageText,
    messageId,
    messageTimestamp,
    messageType,
  } = payload;

  try {
    const supabase = getSupabaseAdmin();

    // ── STEP A: Find or create lead ──────────────────────────────────────────
    let leadId: string | null = null;

    // Look up existing lead by phone (uses idx_leads_phone / idx_leads_phone_dedup)
    const { data: existingLead, error: lookupError } = await supabase
      .from("leads")
      .select("id, name, phone, status")
      .eq("phone", senderPhone)
      .maybeSingle();

    if (lookupError) {
      console.error("[WhatsApp Webhook] ❌ Supabase error — lead lookup:", lookupError.message);
    }

    if (existingLead) {
      // Lead exists — link and update contact timestamps
      leadId = existingLead.id;
      console.log("[WhatsApp Webhook] ✅ Lead found:", {
        leadId,
        name   : existingLead.name   || "(no name)",
        phone  : existingLead.phone,
        status : existingLead.status,
      });

      const { error: updateError } = await supabase
        .from("leads")
        .update({
          whatsapp_last_message_at : messageTimestamp,
          last_contacted_at        : messageTimestamp,
          // Backfill name from WhatsApp profile if we don't have one yet
          ...(senderName && !existingLead.name ? { name: senderName } : {}),
        })
        .eq("id", leadId);

      if (updateError) {
        console.error("[WhatsApp Webhook] ❌ Supabase error — updating lead:", updateError.message);
      }

    } else {
      // No lead found — create one with source = "whatsapp"
      const { data: newLead, error: createError } = await supabase
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
          inquiry_summary          : messageText || null,
        })
        .select("id")
        .single();

      if (createError) {
        console.error("[WhatsApp Webhook] ❌ Supabase error — creating lead:", createError.message);
      } else {
        leadId = newLead?.id ?? null;
        console.log("[WhatsApp Webhook] 🆕 Lead created:", {
          leadId,
          senderPhone,
          senderName : senderName || "(no name)",
        });
      }
    }

    // ── STEP B: Upsert conversation thread ───────────────────────────────────
    // One persistent conversation per WhatsApp number: whatsapp_{phone}
    const sessionId = `whatsapp_${senderPhone}`;

    const { data: existingConv, error: convLookupError } = await supabase
      .from("conversations")
      .select("id, messages")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (convLookupError) {
      console.error("[WhatsApp Webhook] ❌ Supabase error — conversation lookup:", convLookupError.message);
    }

    // Message entry shape matches {role, content, timestamp} used by website chatbot
    const newMessageEntry = {
      role      : "user",
      content   : messageText || `[${messageType} message]`,
      timestamp : messageTimestamp,
      meta      : {
        whatsapp_message_id : messageId,
        message_type        : messageType,
      },
    };

    if (existingConv) {
      // Append to existing messages JSONB array
      const currentMessages: unknown[] = Array.isArray(existingConv.messages)
        ? existingConv.messages
        : [];

      const { error: convUpdateError } = await supabase
        .from("conversations")
        .update({
          messages   : [...currentMessages, newMessageEntry],
          updated_at : new Date().toISOString(),
          // Link lead if not already linked
          ...(leadId ? { lead_id: leadId } : {}),
        })
        .eq("id", existingConv.id);

      if (convUpdateError) {
        console.error("[WhatsApp Webhook] ❌ Supabase error — updating conversation:", convUpdateError.message);
      } else {
        console.log("[WhatsApp Webhook] 💾 Message saved to conversation:", existingConv.id);
      }

    } else {
      // Create fresh conversation thread for this contact
      const { data: newConv, error: convCreateError } = await supabase
        .from("conversations")
        .insert({
          session_id : sessionId,
          channel    : "whatsapp",
          lead_id    : leadId,
          messages   : [newMessageEntry],
          is_active  : true,
        })
        .select("id")
        .single();

      if (convCreateError) {
        console.error("[WhatsApp Webhook] ❌ Supabase error — creating conversation:", convCreateError.message);
      } else {
        console.log("[WhatsApp Webhook] 💾 New conversation created:", newConv?.id);
      }
    }

    // ── STEP C: Activity log ─────────────────────────────────────────────────
    // Only written if we have a lead to attach it to
    if (leadId) {
      const shortText = messageText.length > 120
        ? messageText.slice(0, 120) + "…"
        : messageText;

      const { error: logError } = await supabase
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

      if (logError) {
        console.error("[WhatsApp Webhook] ❌ Supabase error — activity log:", logError.message);
      } else {
        console.log("[WhatsApp Webhook] 📋 Activity logged for lead:", leadId);
      }
    }

  } catch (dbErr) {
    // Never let DB errors bubble up — Meta must always receive 200
    console.error("[WhatsApp Webhook] 🔥 saveToSupabase unexpected error:", dbErr);
  }
}
