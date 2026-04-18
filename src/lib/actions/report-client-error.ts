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

function getRequesterKey(
  clientHeaders: Headers,
  input: ClientAlertInput,
): string {
  const forwardedFor =
    clientHeaders.get("x-forwarded-for") ||
    clientHeaders.get("x-real-ip") ||
    "unknown";
  const ip = forwardedFor.split(",")[0]?.trim() || "unknown";
  const ua = clientHeaders.get("user-agent") || input.userAgent || "unknown";
  const digest = input.digest || "no-digest";
  return `${ip}:${ua.slice(0, 60)}:${digest.slice(0, 40)}`;
}

function isLimited(key: string): boolean {
  const now = Date.now();
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
  const requesterKey = getRequesterKey(clientHeaders, input);
  if (isLimited(requesterKey)) {
    console.warn("[CLIENT_ERROR_ALERT] Rate limited", {
      requesterKey,
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
}
