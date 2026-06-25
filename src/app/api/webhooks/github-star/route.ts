import { NextResponse } from "next/server";
import { normalizeUsername } from "@/lib/github";
import { sendTelegramAlert } from "@/lib/telegram-alert";

export const runtime = "edge";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

function hexToBuffer(hex: string): ArrayBuffer {
  const len = hex.length / 2;
  const view = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    view[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return view.buffer;
}

async function verifySignature(secret: string, bodyText: string, signatureHeader: string): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const signatureHex = signatureHeader.substring(7);
  const signatureBuffer = hexToBuffer(signatureHex);

  const encoder = new TextEncoder();
  const secretKeyData = encoder.encode(secret);
  const bodyData = encoder.encode(bodyText);

  const key = await crypto.subtle.importKey(
    "raw",
    secretKeyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  return await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBuffer,
    bodyData
  );
}

export async function POST(request: Request) {
  const signatureHeader = request.headers.get("x-hub-signature-256") || "";
  const eventHeader = request.headers.get("x-github-event") || "";

  let bodyText = "";
  try {
    bodyText = await request.text();
  } catch (err) {
    return NextResponse.json({ error: "Failed to read request body" }, { status: 400 });
  }

  // 1. Verify HMAC Signature
  if (WEBHOOK_SECRET) {
    const isValid = await verifySignature(WEBHOOK_SECRET, bodyText, signatureHeader);
    if (!isValid) {
      console.warn("[Webhook] Invalid signature received");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn("[Webhook] GITHUB_WEBHOOK_SECRET is not configured. Skipping signature verification.");
  }

  // 2. Parse payload
  let payload: any;
  try {
    payload = JSON.parse(bodyText);
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  console.log(`[Webhook] Event: ${eventHeader}, Action: ${payload.action}`);

  // 3. Handle 'watch' event with 'started' action
  if (eventHeader === "watch" && payload.action === "started") {
    const sender = payload.sender?.login;
    if (!sender) {
      return NextResponse.json({ error: "Missing sender login" }, { status: 400 });
    }

    const normalized = normalizeUsername(sender);

    if (process.env.DB) {
      try {
        await process.env.DB.prepare(
          "INSERT OR IGNORE INTO stargazers (username) VALUES (?)"
        )
          .bind(normalized)
          .run();
        
        console.log(`[Webhook] Successfully saved stargazer: ${normalized}`);
        
        void sendTelegramAlert({
          source: "WEBHOOK_STAR",
          message: `⭐️ User starred the repo and synced to D1: ${normalized}`,
          context: { username: normalized },
        }).catch(() => null);

      } catch (dbErr) {
        console.error("[Webhook] Failed to insert stargazer in D1:", dbErr);
        void sendTelegramAlert({
          source: "WEBHOOK_STAR_ERROR",
          message: "Failed to save stargazer in D1",
          error: dbErr,
          context: { username: normalized },
        }).catch(() => null);
        return NextResponse.json({ error: "Database insertion failed" }, { status: 500 });
      }
    } else {
      console.error("[Webhook] D1 Database binding DB is not available in environment");
      return NextResponse.json({ error: "Database binding missing" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
