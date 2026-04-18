"use server";

import { headers } from "next/headers";
import { sendTelegramAlert } from "@/lib/telegram-alert";

type ClientAlertInput = {
  source?: string;
  message?: string;
  digest?: string;
  stack?: string;
  url?: string;
  userAgent?: string;
};

const ALERT_WINDOW_MS = 60_000;
const ALERT_MAX_PER_WINDOW = 8;
const alertWindowStore = new Map<string, { count: number; resetAt: number }>();

function getRequesterKey(clientHeaders: Headers): string {
  const forwardedFor =
    clientHeaders.get("x-forwarded-for") ||
    clientHeaders.get("x-real-ip") ||
    "unknown";
  const ip = forwardedFor.split(",")[0]?.trim() || "unknown";
  const ua = clientHeaders.get("user-agent") || "unknown";
  return `${ip}:${ua.slice(0, 60)}`;
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

function isLimited(key: string): boolean {
  const now = Date.now();

  for (const [storedKey, storedState] of alertWindowStore) {
    if (storedState.resetAt <= now) {
      alertWindowStore.delete(storedKey);
    }
  }

  const state = alertWindowStore.get(key);

  if (!state || state.resetAt <= now) {
    alertWindowStore.set(key, {
      count: 1,
      resetAt: now + ALERT_WINDOW_MS,
    });
    return false;
  }

  if (state.count >= ALERT_MAX_PER_WINDOW) {
    return true;
  }

  state.count += 1;
  alertWindowStore.set(key, state);
  return false;
}

function sanitizeValue(
  value: string | undefined,
  max = 600,
): string | undefined {
  if (!value) return undefined;
  return value.trim().slice(0, max);
}

export async function reportClientError(
  input: ClientAlertInput,
): Promise<void> {
  const clientHeaders = await headers();
  const requesterKey = getRequesterKey(clientHeaders);
  if (isLimited(requesterKey)) {
    const hashedKey = await hashKey(requesterKey);
    console.warn("[CLIENT_ERROR_ALERT] Rate limited", {
      fingerprint: hashedKey,
      source: input.source || "CLIENT_ERROR",
    });
    return;
  }

  const source = sanitizeValue(input.source, 80) || "CLIENT_ERROR";
  const message =
    sanitizeValue(input.message, 400) || "Client-side error captured";
  const digest = sanitizeValue(input.digest, 160);
  const stack = sanitizeValue(input.stack, 1200);
  const url = sanitizeValue(input.url, 500);
  const userAgent = sanitizeValue(input.userAgent, 400);

  try {
    await sendTelegramAlert({
      source,
      message,
      error: stack || message,
      context: {
        digest,
        url,
        userAgent,
      },
    });
  } catch (err) {
    console.error("[CLIENT_ERROR_ALERT] Failed to send alert", err);
  }
}
