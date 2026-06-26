import { describe, it, expect } from "vitest";
import { sendTelegramAlert } from "../telegram-alert";

describe("telegram-alert integration tests", () => {
  it("sends a real Telegram message using real env vars", async () => {
    const token = process.env.TG_BOT_TOKEN;
    const channelId = process.env.TG_CHANNEL_ID;

    if (!token || !channelId) {
      console.warn("Skipping integration test: Telegram credentials not configured in environment");
      return;
    }

    console.log("Sending real Telegram integration test alert...", { channelId });

    // Perform a real network call using active environment credentials
    await expect(
      sendTelegramAlert({
        source: "INTEGRATION_TEST",
        message: "🔔 This is a real integration test alert sent from the Vitest suite!",
        context: { env: "local_testing", timestamp: new Date().toISOString() },
      })
    ).resolves.not.toThrow();
  });
});
