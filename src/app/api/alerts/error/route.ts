import { NextRequest, NextResponse } from "next/server";
import { sendTelegramAlert } from "@/lib/telegram-alert";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      source?: string;
      message?: string;
      digest?: string;
      stack?: string;
      url?: string;
      userAgent?: string;
    };

    await sendTelegramAlert({
      source: body.source || "CLIENT_ERROR",
      message: body.message || "Client-side error captured",
      error: body.stack || body.message,
      context: {
        digest: body.digest,
        url: body.url,
        userAgent: body.userAgent,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 400 },
    );
  }
}
