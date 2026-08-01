import { NextResponse } from "next/server";
import { normalizeUsername, TARGET_REPO } from "@/lib/github";
import { sendTelegramAlert } from "@/lib/telegram-alert";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { deleteCachedData } from "@/lib/redis";

export const runtime = "edge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getD1Binding(): any {
  if (process.env.DB) return process.env.DB;
  try {
    const ctx = getRequestContext();
    const env = ctx?.env as { DB?: unknown } | undefined;
    return env?.DB ?? null;
  } catch {
    return null;
  }
}

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
  if (!WEBHOOK_SECRET) {
    console.error("[Webhook] GITHUB_WEBHOOK_SECRET is not configured. Failing closed.");
    return NextResponse.json({ error: "Webhook configuration error" }, { status: 500 });
  }

  const isValid = await verifySignature(WEBHOOK_SECRET, bodyText, signatureHeader);
  if (!isValid) {
    console.warn("[Webhook] Invalid signature received");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parse payload
  let payload: unknown;
  try {
    payload = JSON.parse(bodyText);
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid payload shape" }, { status: 400 });
  }

  const typedPayload = payload as {
    action?: string;
    sender?: {
      login?: string;
    };
    repository?: {
      full_name?: string;
    };
  };

  console.log(`[Webhook] Event: ${eventHeader}, Action: ${typedPayload.action}`);

  // 3. Handle 'star' event (created / deleted actions)
  if (eventHeader === "star") {
    // Verify repository matches TARGET_REPO
    if (typedPayload.repository?.full_name?.toLowerCase() !== TARGET_REPO.toLowerCase()) {
      console.warn(`[Webhook] Ignored event for unrelated repository: ${typedPayload.repository?.full_name}`);
      return NextResponse.json({ error: "Unrelated repository" }, { status: 400 });
    }

    const sender = typedPayload.sender?.login;
    if (!sender) {
      return NextResponse.json({ error: "Missing sender login" }, { status: 400 });
    }

    const normalized = normalizeUsername(sender);

    const db = getD1Binding();
    if (db) {
      try {
        if (typedPayload.action === "created") {
          await db.prepare(
            "INSERT OR IGNORE INTO stargazers (username) VALUES (?)"
          )
            .bind(normalized)
            .run();
          
          console.log(`[Webhook] Successfully saved stargazer: ${normalized}`);
          
          await sendTelegramAlert({
            source: "WEBHOOK_STAR_ADD",
            message: `⭐️ User starred the repo and synced to D1: ${normalized}`,
            context: { username: normalized },
          });
        } else if (typedPayload.action === "deleted") {
          await db.prepare(
            "DELETE FROM stargazers WHERE username = ?"
          )
            .bind(normalized)
            .run();

          // Revoke Redis star caches immediately on unstar
          await deleteCachedData(`star_verified:${normalized}`).catch(() => null);
          await deleteCachedData(`repo:stargazers:${TARGET_REPO}`).catch(() => null);
          
          console.log(`[Webhook] Successfully removed stargazer: ${normalized}`);
          
          await sendTelegramAlert({
            source: "WEBHOOK_STAR_REMOVE",
            message: `🗑️ User unstarred the repo and removed from D1: ${normalized}`,
            context: { username: normalized },
          });
        }
      } catch (dbErr) {
        console.error(`[Webhook] Failed to update stargazer (${typedPayload.action}) in D1:`, dbErr);
        await sendTelegramAlert({
          source: "WEBHOOK_STAR_ERROR",
          message: `Failed to update stargazer (${typedPayload.action}) in D1`,
          error: dbErr,
          context: { username: normalized },
        });
        return NextResponse.json({ error: "Database operation failed" }, { status: 500 });
      }
    } else {
      console.error("[Webhook] D1 Database binding DB is not available in environment");
      return NextResponse.json({ error: "Database binding missing" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
