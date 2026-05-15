import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  return NextResponse.json({
    mode,
    token,
    challenge,
    envToken: process.env.META_VERIFY_TOKEN,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log(
      "WhatsApp Webhook:",
      JSON.stringify(body, null, 2)
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Webhook Error:", error);

    return NextResponse.json(
      {
        success: false,
      },
      {
        status: 500,
      }
    );
  }
}