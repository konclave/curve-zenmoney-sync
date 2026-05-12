import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadServerlessConfig } from "./config";

const required: Record<string, string> = {
  ZENMONEY_ACCESS_TOKEN: "zen-token",
  ZENMONEY_DEFAULT_ACCOUNT_ID: "acc-uuid",
  TELEGRAM_BOT_TOKEN: "bot-token",
  TELEGRAM_CHAT_ID: "12345",
};

describe("loadServerlessConfig", () => {
  beforeEach(() => {
    Object.entries(required).forEach(([key, value]) => {
      process.env[key] = value;
    });
  });

  afterEach(() => {
    Object.keys(required).forEach((key) => {
      delete process.env[key];
    });
    delete process.env.CURVE_SENDER_EMAIL;
  });

  it("loads all required config from env vars", () => {
    const config = loadServerlessConfig();

    expect(config.zenmoney.accessToken).toBe("zen-token");
    expect(config.zenmoney.defaultAccountId).toBe("acc-uuid");
    expect(config.telegram.botToken).toBe("bot-token");
    expect(config.telegram.chatId).toBe("12345");
  });

  it("sets curveSenderEmails to an empty array when CURVE_SENDER_EMAIL is not set", () => {
    const config = loadServerlessConfig();

    expect(config.curveSenderEmails).toEqual([]);
  });

  it("uses CURVE_SENDER_EMAIL from env when set to a single email", () => {
    process.env.CURVE_SENDER_EMAIL = "custom@example.com";

    const config = loadServerlessConfig();

    expect(config.curveSenderEmails).toEqual(["custom@example.com"]);
  });

  it("parses multiple comma-separated emails from CURVE_SENDER_EMAIL", () => {
    process.env.CURVE_SENDER_EMAIL =
      "one@example.com, two@example.com , three@example.com";

    const config = loadServerlessConfig();

    expect(config.curveSenderEmails).toEqual([
      "one@example.com",
      "two@example.com",
      "three@example.com",
    ]);
  });

  it.each(Object.keys(required))("throws if %s is missing", (key) => {
    delete process.env[key];

    expect(() => loadServerlessConfig()).toThrow(key);
  });
});
