// src/app/api/whatsapp/webhook/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 ✅  Receive → log → upsert lead → upsert conversation → activity log
// Phase A ✅  Generate AI reply → append as assistant role (NOT sent to WhatsApp yet)
// Phase B     Send WhatsApp reply via Meta API (next phase)
//
// ── Live Supabase schema (verified via information_schema) ───────────────────
// leads safe columns:
//   id, name, phone, source, status, notes,
//   last_contacted_at, whatsapp_opted_in, session_id, created_at, updated_at
//   ✗ inquiry_summary        — does not exist
//   ✗ whatsapp_last_message_at — does not exist
//
// conversations safe columns:
//   id, session_id, source, phone, name, channel, status,
//   lead_id, messages (jsonb), is_active, created_at, updated_at
//
// activity_logs safe columns:
//   id, lead_id, action, description, channel,
//   metadata (jsonb), details (jsonb), created_at
//   ✗ performed_by — NOT in live schema, do not use
//
// ── AI engine ────────────────────────────────────────────────────────────────
// Primary:  Anthropic Claude (ANTHROPIC_API_KEY)
// Models:   tried in order — first success wins, each failure logged individually
// Fallback: null returned when all models fail — webhook always returns 200
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase";

// Tried left-to-right. First success wins.
// All IDs are explicit dated strings — no aliases, no env var dependency.
const ANTHROPIC_MODELS: string[] = [
  "claude-sonnet-4-5-20250929",   // newest
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-20250219",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-haiku-20240307",      // oldest — widest availability
];

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
    // ── STEP A: Parse payload ─────────────────────────────────────────────────
    const body = await req.json();
    console.log("[WhatsApp Webhook] STEP A — payload parsed");
    console.log("[WhatsApp Webhook] 📨 Full payload:", JSON.stringify(body, null, 2));

    const entry  = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value  = change?.value;

    // Early exit: status callback (delivery receipt, read receipt) — not a message
    if (value?.statuses?.length) {
      const s = value.statuses[0];
      console.log("[WhatsApp Webhook] 🔔 Status update — returning 200:", {
        messageId : s?.id,
        status    : s?.status,
        recipient : s?.recipient_id,
      });
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    // Early exit: no message object at all
    const message = value?.messages?.[0];
    if (!message) {
      console.log("[WhatsApp Webhook] ℹ️  No message in payload — returning 200");
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    // ── STEP B: Extract fields ────────────────────────────────────────────────
    const senderPhone : string = message.from                         ?? "";
    const messageId   : string = message.id                           ?? "";
    const rawTs       : string = message.timestamp                    ?? "";
    const messageText : string = message.text?.body                   ?? "";
    const senderName  : string = value?.contacts?.[0]?.profile?.name ?? "";
    const messageType : string = message.type                         ?? "unknown";

    // Early exit: missing sender phone (cannot link to lead or conversation)
    if (!senderPhone) {
      console.log("[WhatsApp Webhook] ❌ STEP B — sender phone missing, cannot process");
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    // Early exit: non-text message type (image, audio, sticker, etc.)
    if (messageType !== "text" || !messageText.trim()) {
      console.log("[WhatsApp Webhook] ⏭️  STEP B — non-text message type:", messageType, "— returning 200");
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    const messageTimestamp = rawTs
      ? new Date(parseInt(rawTs, 10) * 1000).toISOString()
      : new Date().toISOString();

    console.log("[WhatsApp Webhook] STEP B — inbound text extracted:", {
      senderPhone,
      senderName       : senderName || "(no profile name)",
      messageText,
      messageId,
      messageTimestamp,
    });

    // Hand off to the full persistence + AI pipeline
    await runPipeline({
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

  // Always 200 — no exceptions
  console.log("[WhatsApp Webhook] STEP Z — webhook completed, returning 200");
  return NextResponse.json({ status: "ok" }, { status: 200 });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface InboundMessage {
  senderPhone      : string;
  senderName       : string;
  messageText      : string;
  messageId        : string;
  messageTimestamp : string;
  messageType      : string;
}

interface ConvMessage {
  role      : string;
  content   : string;
  timestamp : string;
  meta?     : Record<string, unknown>;
}

function logDbErr(label: string, err: {
  message?: string;
  code?   : string;
  details?: string;
  hint?   : string;
} | null) {
  if (!err) return;
  console.error(`[WhatsApp Webhook] ❌ ${label}:`, {
    message : err.message,
    code    : err.code,
    details : err.details,
    hint    : err.hint,
  });
}

// ─── Full pipeline: C → D → E → F → G → H ───────────────────────────────────
async function runPipeline(msg: InboundMessage): Promise<void> {
  const { senderPhone, senderName, messageText, messageId, messageTimestamp, messageType } = msg;

  try {
    const db        = getSupabaseAdmin();
    const sessionId = `whatsapp_${senderPhone}`;

    // ── STEP C: Lead upsert ───────────────────────────────────────────────────
    console.log("[WhatsApp Webhook] STEP C — lead upsert started for phone:", senderPhone);
    let leadId: string | null = null;

    const { data: existingLead, error: leadLookupErr } = await db
      .from("leads")
      .select("id, name, phone, status, notes")
      .eq("phone", senderPhone)
      .maybeSingle();

    if (leadLookupErr) {
      logDbErr("STEP C lead lookup", leadLookupErr);
    }

    if (existingLead) {
      leadId = existingLead.id;
      console.log("[WhatsApp Webhook] STEP C — existing lead found:", {
        leadId,
        name   : existingLead.name   ?? "(no name)",
        status : existingLead.status,
      });

      const updatePayload: Record<string, unknown> = {
        last_contacted_at : messageTimestamp,
        whatsapp_opted_in : true,
        notes             : `${existingLead.notes ? existingLead.notes + "\n\n" : ""}[WhatsApp ${messageTimestamp}]: ${messageText}`,
      };
      if (senderName && !existingLead.name) updatePayload.name = senderName;

      const { error: leadUpdateErr } = await db
        .from("leads")
        .update(updatePayload)
        .eq("id", leadId);

      if (leadUpdateErr) logDbErr("STEP C lead update", leadUpdateErr);
      else console.log("[WhatsApp Webhook] STEP C — lead updated:", leadId);

    } else {
      // No existing lead — create one
      const { data: newLead, error: leadCreateErr } = await db
        .from("leads")
        .insert({
          session_id        : sessionId,
          phone             : senderPhone,
          name              : senderName || null,
          source            : "whatsapp",
          status            : "new",
          notes             : `First WhatsApp message: "${messageText}"`,
          last_contacted_at : messageTimestamp,
          whatsapp_opted_in : true,
        })
        .select("id")
        .single();

      if (leadCreateErr) {
        logDbErr("STEP C lead create", leadCreateErr);
        // leadId stays null — pipeline continues without it
      } else {
        leadId = newLead?.id ?? null;
        console.log("[WhatsApp Webhook] STEP C — new lead created:", { leadId, senderPhone });
      }
    }

    console.log("[WhatsApp Webhook] STEP C — lead upsert completed. leadId:", leadId);

    // ── STEP D: Conversation lookup ───────────────────────────────────────────
    console.log("[WhatsApp Webhook] STEP D — conversation lookup started. sessionId:", sessionId);

    const { data: existingConv, error: convLookupErr } = await db
      .from("conversations")
      .select("id, messages")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (convLookupErr) logDbErr("STEP D conversation lookup", convLookupErr);

    // KEY FIX: convId is set immediately from existingConv — not inside a success branch.
    // This ensures STEP G (AI) is not skipped even if the PATCH below has issues.
    let convId: string | null = existingConv?.id ?? null;
    const priorMessages: ConvMessage[] = Array.isArray(existingConv?.messages)
      ? (existingConv!.messages as ConvMessage[])
      : [];

    console.log("[WhatsApp Webhook] STEP D — conversation lookup completed:", {
      convId,
      existingMessageCount: priorMessages.length,
    });

    // ── STEP E: Append user message to conversation ───────────────────────────
    console.log("[WhatsApp Webhook] STEP E — user message append started");

    const userEntry: ConvMessage = {
      role      : "user",
      content   : messageText,
      timestamp : messageTimestamp,
      meta      : {
        whatsapp_message_id : messageId,
        message_type        : messageType,
      },
    };

    if (existingConv && convId) {
      // Append to existing conversation
      const { error: convUpdateErr } = await db
        .from("conversations")
        .update({
          source     : "whatsapp",
          phone      : senderPhone,
          channel    : "whatsapp",
          is_active  : true,
          status     : "active",
          messages   : [...priorMessages, userEntry],
          updated_at : new Date().toISOString(),
          ...(leadId ? { lead_id: leadId } : {}),
          ...(senderName ? { name: senderName } : {}),
        })
        .eq("id", convId);

      if (convUpdateErr) {
        logDbErr("STEP E conversation update", convUpdateErr);
      } else {
        console.log("[WhatsApp Webhook] STEP E — user message appended to conversation:", convId);
      }

    } else {
      // Create new conversation
      const { data: newConv, error: convCreateErr } = await db
        .from("conversations")
        .insert({
          session_id : sessionId,
          source     : "whatsapp",
          phone      : senderPhone,
          name       : senderName || null,
          channel    : "whatsapp",
          status     : "active",
          is_active  : true,
          messages   : [userEntry],
          ...(leadId ? { lead_id: leadId } : {}),
        })
        .select("id")
        .single();

      if (convCreateErr) {
        logDbErr("STEP E conversation create", convCreateErr);
      } else {
        convId = newConv?.id ?? null;
        console.log("[WhatsApp Webhook] STEP E — new conversation created:", convId);
      }
    }

    console.log("[WhatsApp Webhook] STEP E — user message append completed. convId:", convId);

    // ── STEP F: Activity log ──────────────────────────────────────────────────
    // Only written when we have a lead to attach it to.
    // Does NOT use performed_by — that column does not exist in the live DB.
    if (leadId) {
      console.log("[WhatsApp Webhook] STEP F — activity log started");

      const shortText = messageText.length > 120
        ? `${messageText.slice(0, 120)}…`
        : messageText;

      const { error: logErr } = await db
        .from("activity_logs")
        .insert({
          lead_id     : leadId,
          action      : "whatsapp_message_received",
          description : `WhatsApp message from ${senderPhone}: "${shortText}"`,
          channel     : "whatsapp",
          metadata    : {
            whatsapp_message_id : messageId,
            sender_phone        : senderPhone,
            message_type        : messageType,
            timestamp           : messageTimestamp,
          },
          details     : {
            message_text : messageText,
            sender_name  : senderName || null,
          },
        });

      if (logErr) logDbErr("STEP F activity log", logErr);
      else console.log("[WhatsApp Webhook] STEP F — activity log completed for lead:", leadId);
    } else {
      console.log("[WhatsApp Webhook] STEP F — skipped (no leadId)");
    }

    // ── STEP G: Generate AI reply ─────────────────────────────────────────────
    // Only requires messageText (already validated non-empty in POST handler).
    // convId may be null if both conversation lookup and create failed —
    // in that case we generate the reply but skip saving it.
    console.log("[WhatsApp Webhook] STEP G — AI generation started for:", senderPhone);

    const aiReply = await generateAIReply({
      messageText,
      senderName,
      senderPhone,
      conversationHistory : priorMessages,
      db,
    });

    if (!aiReply) {
      console.log("[WhatsApp Webhook] STEP G — AI generation returned null, skipping save");
      return;
    }

    console.log(
      "[WhatsApp Webhook] STEP G — AI reply generated:",
      aiReply.slice(0, 120) + (aiReply.length > 120 ? "…" : "")
    );

    // ── STEP H: Save assistant reply to conversation ──────────────────────────
    if (!convId) {
      console.log("[WhatsApp Webhook] STEP H — skipped (convId is null, cannot save assistant reply)");
      return;
    }

    console.log("[WhatsApp Webhook] STEP H — saving assistant reply to conversation:", convId);

    // Re-fetch latest messages to get the freshest state (user msg was saved in STEP E)
    const { data: latestConv, error: latestConvErr } = await db
      .from("conversations")
      .select("messages")
      .eq("id", convId)
      .single();

    if (latestConvErr) {
      logDbErr("STEP H conversation fetch", latestConvErr);
      return;
    }

    const latestMessages: ConvMessage[] = Array.isArray(latestConv?.messages)
      ? (latestConv.messages as ConvMessage[])
      : [];

    // ── Duplicate-send guard ──────────────────────────────────────────────────
    // If the most recent assistant message was already sent, skip to avoid
    // double-messaging the user (e.g. on Meta retry or Vercel re-invocation).
    const lastMsg = latestMessages[latestMessages.length - 1];
    if (
      lastMsg?.role === "assistant" &&
      lastMsg?.meta?.sent_to_whatsapp === true
    ) {
      console.log("[WhatsApp Webhook] ⏭️  WhatsApp send skipped — already sent");
      return;
    }

    const assistantEntry: ConvMessage = {
      role      : "assistant",
      content   : aiReply,
      timestamp : new Date().toISOString(),
      meta      : {
        generated_for    : "whatsapp",
        sent_to_whatsapp : false,   // updated below after send attempt
      },
    };

    const { error: aiSaveErr } = await db
      .from("conversations")
      .update({
        messages   : [...latestMessages, assistantEntry],
        updated_at : new Date().toISOString(),
      })
      .eq("id", convId);

    if (aiSaveErr) {
      logDbErr("STEP H assistant reply save", aiSaveErr);
      return;   // don't attempt send if we couldn't save the record
    }

    console.log("[WhatsApp Webhook] STEP H — assistant reply saved to conversation:", convId);

    // ── Phase B: Send reply via Meta WhatsApp Cloud API ───────────────────────
    const sendResult = await sendWhatsAppTextMessage(senderPhone, aiReply);

    // Re-fetch again so we patch the exact messages array now on disk
    const { data: postSendConv, error: postSendFetchErr } = await db
      .from("conversations")
      .select("messages")
      .eq("id", convId)
      .single();

    if (postSendFetchErr) {
      logDbErr("STEP H post-send conversation fetch", postSendFetchErr);
      return;
    }

    const postSendMessages: ConvMessage[] = Array.isArray(postSendConv?.messages)
      ? (postSendConv.messages as ConvMessage[])
      : [];

    // Find the assistant entry we just appended (last item) and patch its meta
    const patchedMessages = postSendMessages.map((m, idx) => {
      if (idx !== postSendMessages.length - 1 || m.role !== "assistant") return m;
      return {
        ...m,
        meta: sendResult.success
          ? {
              ...m.meta,
              sent_to_whatsapp    : true,
              whatsapp_sent_at    : new Date().toISOString(),
              whatsapp_message_id : sendResult.messageId ?? null,
            }
          : {
              ...m.meta,
              sent_to_whatsapp     : false,
              whatsapp_send_error  : sendResult.error ?? "unknown_send_error",
            },
      };
    });

    const { error: metaUpdateErr } = await db
      .from("conversations")
      .update({
        messages   : patchedMessages,
        updated_at : new Date().toISOString(),
      })
      .eq("id", convId);

    if (metaUpdateErr) {
      logDbErr("STEP H send-status meta update", metaUpdateErr);
      // non-fatal — message was already sent; just metadata didn't update
    } else {
      console.log(
        "[WhatsApp Webhook] STEP H — send metadata updated. sent_to_whatsapp:",
        sendResult.success
      );
    }

  } catch (err) {
    console.error("[WhatsApp Webhook] 🔥 runPipeline unexpected error:", err);
  }
}

// ─── AI Reply Generator ───────────────────────────────────────────────────────
interface GenerateReplyParams {
  messageText         : string;
  senderName          : string;
  senderPhone         : string;
  conversationHistory : ConvMessage[];
  db                  : ReturnType<typeof getSupabaseAdmin>;
}

async function generateAIReply(params: GenerateReplyParams): Promise<string | null> {
  const { messageText, senderName, conversationHistory, db } = params;

  try {
    // ── Validate API key first ────────────────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[WhatsApp Webhook] ❌ ANTHROPIC_API_KEY missing");
      return null;
    }

    // ── RAG: knowledge_chunks full-text search ────────────────────────────────
    let knowledgeContext = "";
    try {
      const searchTerms = messageText.split(" ").slice(0, 6).join(" | ");
      const { data: chunks } = await db
        .from("knowledge_chunks")
        .select("content, category")
        .textSearch("content", searchTerms, { type: "websearch", config: "english" })
        .limit(4);

      if (chunks && chunks.length > 0) {
        knowledgeContext = chunks
          .map((c: { content: string; category: string }) => `[${c.category}]: ${c.content}`)
          .join("\n\n");
        console.log("[WhatsApp Webhook] 📚 RAG context loaded:", chunks.length, "chunks");
      } else {
        console.log("[WhatsApp Webhook] 📚 RAG — no matching chunks found");
      }
    } catch (ragErr) {
      console.warn("[WhatsApp Webhook] ⚠️  RAG fetch failed (continuing without):", ragErr);
    }

    // ── Build conversation history (last 6 turns) ─────────────────────────────
    const claudeMessages: Anthropic.MessageParam[] = conversationHistory
      .slice(-6)
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({
        role    : m.role as "user" | "assistant",
        content : m.content,
      }));

    claudeMessages.push({ role: "user", content: messageText });

    // ── System prompt ─────────────────────────────────────────────────────────
    const systemPrompt = `You are Aria, the AI assistant for BookMySpaces — a premium venue booking platform in Kolkata, India.

You represent:
- BookMySpaces.in — platform
- Skyline Serenity — venue near Kolkata Airport (contact: 9830509991 / 9123005489)
- Monurama Homestay — venue in Mukundapur, EM Bypass (contact: 9051459463 / 7003853624)

You are responding to a WhatsApp inquiry${senderName ? ` from ${senderName}` : ""}.

Your role:
- Warmly greet and assist the customer
- Answer questions about venues, packages, pricing, availability, events
- Collect key details: event type, date, guest count, budget
- Be concise — WhatsApp messages should be short and conversational (2–4 lines max)
- If you do not know something specific, offer to connect them with the team
- Always be professional, warm, and helpful
- Reply in the same language the customer uses (Hindi / Bengali / English)
- Do NOT make up specific prices or availability — offer to check

${knowledgeContext ? `Relevant knowledge from our database:\n${knowledgeContext}` : ""}

Keep your reply short, friendly, and practical. This is WhatsApp — not email.`;

    // ── Call Anthropic — try each model in order, first success wins ─────────
    const anthropic = new Anthropic({ apiKey });

    for (const model of ANTHROPIC_MODELS) {
      try {
        console.log("[WhatsApp Webhook] 🤖 Trying Anthropic model:", model);

        const response = await anthropic.messages.create({
          model,
          max_tokens : 300,
          system     : systemPrompt,
          messages   : claudeMessages,
        });

        const aiText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map(b => b.text)
          .join("")
          .trim();

        if (!aiText) {
          console.warn("[WhatsApp Webhook] ⚠️  Anthropic model returned empty content:", model);
          continue;  // try next model
        }

        console.log("[WhatsApp Webhook] ✅ Anthropic model succeeded:", model);
        return aiText;

      } catch (modelErr: unknown) {
        const e = modelErr as Record<string, unknown>;
        // Log every field the Anthropic SDK can surface so the failure is
        // fully diagnosable in Vercel logs without any extra tooling.
        console.error("[WhatsApp Webhook] ❌ Anthropic model failed:", {
          model,
          status     : e?.status               ?? "unknown",
          statusCode : e?.statusCode            ?? "unknown",
          message    : e?.message               ?? String(modelErr),
          errorType  : (e?.error as Record<string, unknown>)?.type ?? e?.type ?? null,
          response   : e?.response              ?? null,
          body       : e?.body                  ?? null,
        });
        // continue to next model
      }
    }

    // All models exhausted
    console.error("[WhatsApp Webhook] ❌ All Anthropic models failed — likely API key/account/model access issue");
    return null;  // never throw — webhook always returns 200

  } catch (err: unknown) {
    // Outer catch: unexpected error outside the model loop (RAG, key check, etc.)
    const anyErr = err as Record<string, unknown>;
    console.error("[WhatsApp Webhook] ❌ generateAIReply unexpected error:", {
      message  : anyErr?.message ?? String(err),
      response : anyErr?.response ?? anyErr?.body ?? null,
    });
    return null;
  }
}

// ─── Meta WhatsApp Cloud API — send outbound text message ────────────────────
// Env vars required:
//   WHATSAPP_ACCESS_TOKEN      — permanent or temporary system user token
//   WHATSAPP_PHONE_NUMBER_ID   — numeric ID from Meta Business dashboard
//
// Returns { success, messageId? } on success or { success: false, error } on failure.
// Never throws — all errors are caught and returned as structured values.
// The access token is never logged.

interface SendResult {
  success    : boolean;
  messageId ?: string;
  error     ?: string;
}

async function sendWhatsAppTextMessage(
  toPhone : string,
  body    : string
): Promise<SendResult> {
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // Guard: missing env vars
  if (!accessToken || !phoneNumberId) {
    console.warn(
      "[WhatsApp Webhook] ⚠️  WhatsApp send skipped — missing env vars:",
      {
        WHATSAPP_ACCESS_TOKEN    : accessToken   ? "set" : "MISSING",
        WHATSAPP_PHONE_NUMBER_ID : phoneNumberId ? "set" : "MISSING",
      }
    );
    return { success: false, error: "missing_whatsapp_env" };
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  console.log("[WhatsApp Webhook] 📤 WhatsApp send started:", { toPhone });

  try {
    const res = await fetch(url, {
      method  : "POST",
      headers : {
        "Authorization" : `Bearer ${accessToken}`,   // token never appears in logs
        "Content-Type"  : "application/json",
      },
      body: JSON.stringify({
        messaging_product : "whatsapp",
        to                : toPhone,
        type              : "text",
        text              : {
          preview_url : false,
          body,
        },
      }),
    });

    // Parse response body regardless of status so we can log it on failure
    let responseJson: Record<string, unknown> = {};
    try {
      responseJson = await res.json();
    } catch {
      // non-JSON body — leave responseJson empty
    }

    if (!res.ok) {
      console.error("[WhatsApp Webhook] ❌ WhatsApp send failed:", {
        toPhone,
        httpStatus   : res.status,
        responseBody : responseJson,
      });
      return {
        success : false,
        error   : `http_${res.status}`,
      };
    }

    // Success — extract wamid from messages[0].id
    const messages = responseJson?.messages as Array<{ id?: string }> | undefined;
    const messageId = messages?.[0]?.id ?? undefined;

    console.log("[WhatsApp Webhook] ✅ WhatsApp send success:", { toPhone, messageId });
    return { success: true, messageId };

  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    console.error("[WhatsApp Webhook] ❌ WhatsApp send failed (network/fetch error):", {
      toPhone,
      message : e?.message ?? String(err),
    });
    return {
      success : false,
      error   : e?.message ? String(e.message) : "fetch_error",
    };
  }
}
