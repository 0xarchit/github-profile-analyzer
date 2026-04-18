"use server";

import { sendTelegramAlert } from "@/lib/telegram-alert";

type ClientAlertInput = {
  source?: string;
  message?: string;
  digest?: string;
  stack?: string;
  url?: string;
  userAgent?: string;
};

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
