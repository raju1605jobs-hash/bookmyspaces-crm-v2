// src/app/api/whatsapp/webhook/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 ✅  Receive → log → upsert lead → upsert conversation → activity log
// Phase A ✅  Generate AI reply → append as assistant role (NOT sent to WhatsApp yet)
// Phase B     Send WhatsApp reply via Meta API (next phase)
//
// ── Live Supabase schema (verified via information_schema) ───────────────────
// leads:         session_id, phone, name, source, status, notes,
//                last_contacted_at, whatsapp_opted_in
//                ✗ inquiry_summary — does not exist
//                ✗ whatsapp_last_message_at — does not exist
//
// conversations: id, session_id, source, phone, name, status, channel,
//                lead_id, messages (jsonb), is_active, updated_at
//
// activity_logs: lead_id, action, description, performed_by, channel,
//                metadata (jsonb), details (jsonb)
//
// ── AI engine ────────────────────────────────────────────────────────────────
// Primary:  Anthropic Claude  (ANTHROPIC_API_KEY)
// Model:    process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022" (configurable)
// Fallback: returns null on any failure — webhook still returns 200
// RAG:      knowledge_chunks queried via Supabase full-text search
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase";

// Model is configurable via Vercel env var ANTHROPIC_MODEL.
// Fallback: claude-3-5-haiku-20241022 (widely available, fast, cost-efficient).
// To override: set ANTHROPIC_MODEL=claude-3-opus-20240229 in Vercel env vars.
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";

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

    console.log(
      "[WhatsApp Webhook] 📨 Full payload:",
      JSON.stringify(body, null, 2)
    );

    const entry  = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value  = change?.value;

    // ── Status callbacks — not inbound messages ───────────────────────────────
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

    // Persist + generate AI reply — isolated so DB/AI failures never block 200
    await handleInboundMessage({
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

  return NextResponse.json({ status: "ok" }, { status: 200 });
}

// ─── Supabase error logger ────────────────────────────────────────────────────
function logSupabaseError(label: string, err: {
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

// ─── Types ────────────────────────────────────────────────────────────────────
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

// ─── Main handler — persist then generate AI reply ────────────────────────────
async function handleInboundMessage(msg: InboundMessage): Promise<void> {
  const {
    senderPhone,
    senderName,
    messageText,
    messageId,
    messageTimestamp,
    messageType,
  } = msg;

  try {
    const db        = getSupabaseAdmin();
    const sessionId = `whatsapp_${senderPhone}`;

    // ── STEP 1: Lead — find or create ─────────────────────────────────────────
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

      const updatePayload: Record<string, unknown> = {
        last_contacted_at : messageTimestamp,
        whatsapp_opted_in : true,
        notes: messageText
          ? `${existingLead.notes ? existingLead.notes + "\n\n" : ""}[WhatsApp ${messageTimestamp}]: ${messageText}`
          : existingLead.notes,
      };
      if (senderName && !existingLead.name) updatePayload.name = senderName;

      const { error: leadUpdateErr } = await db
        .from("leads")
        .update(updatePayload)
        .eq("id", leadId);

      if (leadUpdateErr) logSupabaseError("Lead update", leadUpdateErr);

    } else {
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
      } else {
        leadId = newLead?.id ?? null;
        console.log("[WhatsApp Webhook] 🆕 New lead created:", {
          leadId,
          phone : senderPhone,
          name  : senderName || "(no name)",
        });
      }
    }

    // ── STEP 2: Conversation — find or create, append user message ────────────
    const { data: existingConv, error: convLookupErr } = await db
      .from("conversations")
      .select("id, messages")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (convLookupErr) logSupabaseError("Conversation lookup", convLookupErr);

    const userEntry: ConvMessage = {
      role      : "user",
      content   : messageText || `[${messageType} message]`,
      timestamp : messageTimestamp,
      meta      : {
        whatsapp_message_id : messageId,
        message_type        : messageType,
      },
    };

    let convId          : string | null   = null;
    let priorMessages   : ConvMessage[]   = [];

    if (existingConv) {
      priorMessages = Array.isArray(existingConv.messages)
        ? (existingConv.messages as ConvMessage[])
        : [];

      const { error: convUpdateErr } = await db
        .from("conversations")
        .update({
          source     : "whatsapp",
          phone      : senderPhone,
          ...(senderName ? { name: senderName } : {}),
          channel    : "whatsapp",
          ...(leadId ? { lead_id: leadId } : {}),
          messages   : [...priorMessages, userEntry],
          is_active  : true,
          status     : "active",
          updated_at : new Date().toISOString(),
        })
        .eq("id", existingConv.id);

      if (convUpdateErr) {
        logSupabaseError("Conversation update (user msg)", convUpdateErr);
      } else {
        convId = existingConv.id;
        console.log("[WhatsApp Webhook] 💾 User message appended to conversation:", convId);
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
          messages   : [userEntry],
          is_active  : true,
        })
        .select("id")
        .single();

      if (convCreateErr) {
        logSupabaseError("Conversation create", convCreateErr);
      } else {
        convId = newConv?.id ?? null;
        console.log("[WhatsApp Webhook] 💾 New conversation created:", convId);
      }
    }

    // ── STEP 3: Activity log ──────────────────────────────────────────────────
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

      if (logErr) logSupabaseError("Activity log", logErr);
      else console.log("[WhatsApp Webhook] 📋 Activity logged for lead:", leadId);
    }

    // ── STEP 4: Generate AI reply ─────────────────────────────────────────────
    if (!messageText.trim()) {
      console.log("[WhatsApp Webhook] ⏭️  No text message — skipping AI reply generation");
      return;
    }

    if (!convId) {
      console.log("[WhatsApp Webhook] ⚠️  No conversation ID — skipping AI reply generation");
      return;
    }

    console.log("[WhatsApp Webhook] 🤖 AI reply generation started for:", senderPhone);

    const aiReply = await generateAIReply({
      messageText,
      senderName,
      senderPhone,
      conversationHistory : priorMessages,
      db,
    });

    if (!aiReply) {
      console.log("[WhatsApp Webhook] ⚠️  AI reply was empty or failed — not saving");
      return;
    }

    console.log(
      "[WhatsApp Webhook] 🤖 AI reply generated:",
      aiReply.slice(0, 120) + (aiReply.length > 120 ? "…" : "")
    );

    // ── STEP 5: Append AI reply to conversation ───────────────────────────────
    // Re-fetch latest messages so we don't overwrite anything written between
    // Step 2 and now (defensive against concurrent requests)
    const { data: latestConv, error: latestConvErr } = await db
      .from("conversations")
      .select("messages")
      .eq("id", convId)
      .single();

    if (latestConvErr) {
      logSupabaseError("Conversation fetch before AI append", latestConvErr);
      return;
    }

    const latestMessages: ConvMessage[] = Array.isArray(latestConv?.messages)
      ? (latestConv.messages as ConvMessage[])
      : [];

    const assistantEntry: ConvMessage = {
      role      : "assistant",
      content   : aiReply,
      timestamp : new Date().toISOString(),
      meta      : {
        generated_for    : "whatsapp",
        sent_to_whatsapp : false,   // Phase B will flip this to true when sending
      },
    };

    const { error: aiAppendErr } = await db
      .from("conversations")
      .update({
        messages   : [...latestMessages, assistantEntry],
        updated_at : new Date().toISOString(),
      })
      .eq("id", convId);

    if (aiAppendErr) {
      logSupabaseError("AI reply append to conversation", aiAppendErr);
    } else {
      console.log("[WhatsApp Webhook] ✅ AI reply saved to conversation:", convId);
    }

  } catch (err) {
    console.error("[WhatsApp Webhook] 🔥 handleInboundMessage unexpected error:", err);
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
    // ── RAG: fetch relevant knowledge chunks via full-text search ─────────────
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
      }
    } catch (ragErr) {
      console.warn("[WhatsApp Webhook] ⚠️  RAG fetch failed (continuing without context):", ragErr);
    }

    // ── Build conversation history (last 6 turns) ─────────────────────────────
    const recentHistory = conversationHistory.slice(-6);
    const claudeMessages: Anthropic.MessageParam[] = recentHistory
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
- If you don't know something specific, offer to connect them with the team
- Always be professional, warm, and helpful
- Reply in the same language the customer uses (Hindi/Bengali/English)
- Do NOT make up specific prices or availability — offer to check

${knowledgeContext ? `Relevant knowledge from our database:\n${knowledgeContext}` : ""}

Keep your reply short, friendly, and practical. This is WhatsApp — not email.`;

    // ── Validate API key ──────────────────────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[WhatsApp Webhook] ❌ Anthropic AI error: ANTHROPIC_API_KEY is not set");
      return null;
    }

    // ── Call Anthropic Claude ─────────────────────────────────────────────────
    const anthropic = new Anthropic({ apiKey });

    console.log("[WhatsApp Webhook] 🤖 Calling Anthropic model:", ANTHROPIC_MODEL);

    const response = await anthropic.messages.create({
      model      : ANTHROPIC_MODEL,
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
      console.warn("[WhatsApp Webhook] ⚠️  Anthropic returned empty content");
      return null;
    }

    return aiText;

  } catch (err: unknown) {
    // ── Detailed Anthropic error logging ──────────────────────────────────────
    // Every field the Anthropic SDK can return is logged individually so the
    // root cause is immediately visible in Vercel logs — no guessing needed.
    const anyErr = err as Record<string, unknown>;
    console.error("[WhatsApp Webhook] ❌ Anthropic AI error:", {
      model      : ANTHROPIC_MODEL,
      status     : anyErr?.status     ?? "unknown",
      statusCode : anyErr?.statusCode ?? "unknown",
      message    : anyErr?.message    ?? String(err),
      error      : anyErr?.error      ?? null,
      response   : anyErr?.response   ?? null,
      body       : anyErr?.body       ?? null,
    });
    return null;   // Never throw — webhook must always complete with 200
  }
}
