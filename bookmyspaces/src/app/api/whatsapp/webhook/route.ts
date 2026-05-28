// src/app/api/whatsapp/webhook/route.ts
//
// DEBUGGING VERSION — logs every byte of the verification handshake.
// Safe to deploy to Vercel. Remove the verbose logs after verification passes.

import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

// ─────────────────────────────────────────────────────────────────────────────
// GET  — Meta webhook verification
//
// Meta sends exactly:
//   GET /api/whatsapp/webhook
//     ?hub.mode=subscribe
//     &hub.verify_token=<your token>
//     &hub.challenge=<random string>
//
// You MUST respond with:
//   Status  : 200
//   Body    : <hub.challenge> as plain text — the EXACT string, nothing else
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  // ── Log every incoming detail so you can see what Meta actually sends ──────
  console.log("[WA Webhook GET] ===== VERIFICATION REQUEST =====");
  console.log("[WA Webhook GET] Full URL:", request.url);
  console.log("[WA Webhook GET] Method:", request.method);
  console.log("[WA Webhook GET] Headers:", Object.fromEntries(request.headers.entries()));

  const { searchParams } = new URL(request.url);

  // Log ALL query params so you can catch unexpected encoding
  console.log("[WA Webhook GET] All query params:");
  searchParams.forEach((value, key) => {
    console.log(`  [${key}] = [${value}]  (length: ${value.length})`);
  });

  // Note: the param names literally contain dots — "hub.mode" not "hub_mode"
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  console.log("[WA Webhook GET] Parsed values:", {
    mode,
    challenge,
    tokenFromMeta: token,
    tokenLength: token?.length ?? 0,
  });

  // ── Load verify token from env ─────────────────────────────────────────────
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
console.log("[WA Webhook GET] ENV TOKEN DIRECT =", JSON.stringify(verifyToken));

  if (!verifyToken) {
    console.error(
      "[WA Webhook GET] ❌ WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set.",
      "Go to Vercel → Project → Settings → Environment Variables.",
      "Make sure it is set for the correct environment (Production/Preview/Development).",
      "After adding, REDEPLOY — Vercel does not hot-reload env changes."
    );
    return new NextResponse("Server configuration error", { status: 500 });
  }

  // ── Defensive: strip whitespace/newlines that sneak in via .env or Vercel UI
  const cleanVerifyToken = verifyToken.trim();
  const cleanTokenFromMeta = (token ?? "").trim();

  console.log("[WA Webhook GET] Token comparison:", {
    envTokenRaw:       JSON.stringify(verifyToken),         // shows hidden whitespace
    envTokenCleaned:   JSON.stringify(cleanVerifyToken),
    metaTokenRaw:      JSON.stringify(token),
    metaTokenCleaned:  JSON.stringify(cleanTokenFromMeta),
    lengthEnv:         cleanVerifyToken.length,
    lengthMeta:        cleanTokenFromMeta.length,
    match:             cleanVerifyToken === cleanTokenFromMeta,
  });

  // ── Verify ─────────────────────────────────────────────────────────────────
  if (mode === "subscribe" && cleanVerifyToken === cleanTokenFromMeta) {
    if (!challenge) {
      console.error("[WA Webhook GET] ❌ hub.challenge is missing from Meta request");
      return new NextResponse("Bad Request: missing challenge", { status: 400 });
    }

    console.log("[WA Webhook GET] ✅ Verification PASSED. Returning challenge:", challenge);

    // Return the challenge as plain text with explicit Content-Type.
    // IMPORTANT: return the string EXACTLY — no JSON wrapping, no quotes, no newline.
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  // ── Failure diagnostics ────────────────────────────────────────────────────
  console.warn("[WA Webhook GET] ❌ Verification FAILED.");
  console.warn("[WA Webhook GET] Reason checklist:");
  console.warn("  mode === 'subscribe'?", mode === "subscribe", `(got: ${JSON.stringify(mode)})`);
  console.warn("  token matches?", cleanVerifyToken === cleanTokenFromMeta);
  console.warn(
    "  If tokens look identical but still fail, check for non-printable characters.",
    "Run: console.log([...verifyToken].map(c => c.charCodeAt(0)))"
  );

  return new NextResponse("Forbidden", { status: 403 });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Incoming messages & status updates from Meta
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  console.log("[WA Webhook POST] ===== INCOMING PAYLOAD =====");

  let body: WhatsAppWebhookPayload;
  try {
    body = await request.json();
    console.log("[WA Webhook POST] Raw payload:", JSON.stringify(body, null, 2));
  } catch (err) {
    console.error("[WA Webhook POST] ❌ Failed to parse JSON body:", err);
    return new NextResponse("Bad Request", { status: 400 });
  }

  if (body.object !== "whatsapp_business_account") {
    console.warn("[WA Webhook POST] Unexpected object type:", body.object);
    return new NextResponse("OK", { status: 200 });
  }

  try {
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages") continue;

        const value = change.value;

        // Status updates
        for (const status of value.statuses ?? []) {
          console.log("[WA Webhook POST] Status update:", {
            messageId: status.id,
            status: status.status,
            recipient: status.recipient_id,
            timestamp: new Date(Number(status.timestamp) * 1000).toISOString(),
            errors: status.errors ?? null,
          });
        }

        // Incoming messages
        for (const message of value.messages ?? []) {
          const contact = value.contacts?.find((c) => c.wa_id === message.from);
          const senderName = contact?.profile?.name ?? "Unknown";

          console.log("[WA Webhook POST] Incoming message:", {
            from: message.from,
            senderName,
            messageId: message.id,
            type: message.type,
            timestamp: new Date(Number(message.timestamp) * 1000).toISOString(),
            text: message.type === "text" ? message.text?.body : undefined,
          });

          await handleIncomingMessage(message, senderName);
        }
      }
    }
  } catch (err) {
    // Always 200 to Meta — if you return 5xx, Meta will retry for 72 hours
    console.error("[WA Webhook POST] ❌ Error processing payload:", err);
  }

  return new NextResponse("OK", { status: 200 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Message dispatcher
// ─────────────────────────────────────────────────────────────────────────────
async function handleIncomingMessage(message: WhatsAppMessage, senderName: string) {
  const from = message.from;

  try {
    if (message.type === "text") {
      const text = message.text?.body ?? "";
      console.log(`[WA Webhook] Text from ${senderName} (${from}): "${text}"`);
      const reply = buildAutoReply(text, senderName);
      console.log(`[WA Webhook] Sending reply to ${from}: "${reply}"`);
      await sendWhatsAppMessage(from, reply);
      console.log(`[WA Webhook] ✅ Reply sent to ${from}`);
    } else {
      console.log(`[WA Webhook] Unhandled message type: ${message.type} from ${from}`);
    }
  } catch (err) {
    console.error(`[WA Webhook] ❌ Error handling message from ${from}:`, err);
  }
}

function buildAutoReply(text: string, name: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("book") || lower.includes("availability")) {
    return `Hi ${name}! 👋 Please share your check-in/out dates, number of guests, and property preference (Skyline Serenity or MonuRama) and we'll confirm availability right away!`;
  }
  if (lower.includes("price") || lower.includes("rate")) {
    return `Hi ${name}! Rooms start from ₹1,500/night including breakfast. Share your dates for a precise quote!`;
  }
  if (lower.includes("cancel")) {
    return `Hi ${name}! For cancellations see https://www.bookmyspaces.in/cancellation.html or call +91 90514 59463.`;
  }
  return `Hi ${name}! 👋 Thanks for reaching out to Book My Space. Our team will respond shortly. Call us at +91 90514 59463 or visit www.bookmyspaces.in`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}

interface WhatsAppStatusUpdate {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
}

interface WhatsAppValue {
  messaging_product: "whatsapp";
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatusUpdate[];
}

interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{ value: WhatsAppValue; field: string }>;
  }>;
}