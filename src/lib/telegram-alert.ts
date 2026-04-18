type AlertContext = Record<string, unknown>;

function toErrorString(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function toStack(error: unknown): string {
  if (error instanceof Error && error.stack) {
    return error.stack;
  }
  return "N/A";
}

function toContextString(context?: AlertContext): string {
  if (!context) return "{}";
  try {
    return JSON.stringify(context, null, 2);
  } catch {
    return String(context);
  }
}

function buildMessage(input: {
  source: string;
  message: string;
  error?: unknown;
  context?: AlertContext;
}): string {
  const now = new Date().toISOString();
  const errorText = toErrorString(input.error);
  const stack = toStack(input.error);
  const contextText = toContextString(input.context);
  const lines = [
    "GitScore Error Alert",
    `time: ${now}`,
    `source: ${input.source}`,
    `message: ${input.message}`,
    `error: ${errorText}`,
    `context: ${contextText}`,
    `stack: ${stack}`,
  ];
  return lines.join("\n");
}

export type TelegramAlertInput = {
  source: string;
  message: string;
  error?: unknown;
  context?: AlertContext;
};

export class TelegramAlertCollector {
  private items: TelegramAlertInput[] = [];

  add(input: TelegramAlertInput): void {
    this.items.push(input);
  }

  get size(): number {
    return this.items.length;
  }

  async flush(requestContext?: AlertContext): Promise<void> {
    if (this.items.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const entries = this.items
      .map((item, idx) => {
        const errorText = toErrorString(item.error);
        const contextText = toContextString(item.context);
        return [
          `#${idx + 1}`,
          `source: ${item.source}`,
          `message: ${item.message}`,
          `error: ${errorText}`,
          `context: ${contextText}`,
        ].join("\n");
      })
      .join("\n\n");

    const text = [
      "GitScore Error Batch",
      `time: ${now}`,
      `events: ${this.items.length}`,
      `request_context: ${toContextString(requestContext)}`,
      entries,
    ]
      .join("\n")
      .slice(0, 3900);

    this.items = [];
    await sendRawTelegramText(text);
  }
}

async function sendRawTelegramText(text: string): Promise<void> {
  const token = process.env.TG_BOT_TOKEN;
  const channelId = process.env.TG_CHANNEL_ID;

  if (!token || !channelId) {
    return;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: channelId,
          text,
          disable_web_page_preview: true,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      console.error("[TELEGRAM_ALERT] Failed", {
        status: response.status,
        body,
      });
    }
  } catch (error) {
    console.error("[TELEGRAM_ALERT] Network failure", error);
  }
}

export async function sendTelegramAlert(input: {
  source: string;
  message: string;
  error?: unknown;
  context?: AlertContext;
}): Promise<void> {
  const text = buildMessage(input).slice(0, 3900);
  await sendRawTelegramText(text);
}
