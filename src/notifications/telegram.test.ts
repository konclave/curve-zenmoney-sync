import { describe, it, expect, vi, beforeEach } from "vitest";
import { TelegramNotifier } from "./telegram";

const config = { botToken: "test-bot-token", chatId: "123" };

describe("TelegramNotifier", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("sends warn message with ⚠️ prefix to correct URL", async () => {
    const notifier = new TelegramNotifier(config);
    await notifier.warn("Rate limited");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-bot-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: "123",
          text: "⚠️ curve-zenmoney-sync\n\nRate limited",
        }),
      }),
    );
  });

  it("sends error message with 🚨 prefix", async () => {
    const notifier = new TelegramNotifier(config);
    await notifier.error("Transaction lost");
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: "123",
          text: "🚨 curve-zenmoney-sync\n\nTransaction lost",
        }),
      }),
    );
  });

  it("logs warn notifications to stdout before sending Telegram", async () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const notifier = new TelegramNotifier(config, logger as never);

    await notifier.warn("Rate limited");

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "notification.telegram.warn",
        telegram_notification: true,
      }),
      "Rate limited",
    );
  });

  it("does not throw if fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const notifier = new TelegramNotifier(config);
    await expect(notifier.error("test")).resolves.not.toThrow();
  });
});
