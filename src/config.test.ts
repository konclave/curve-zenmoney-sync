import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "./config";

const required: Record<string, string> = {
  ZENMONEY_ACCESS_TOKEN: "zen-token",
  ZENMONEY_DEFAULT_ACCOUNT_ID: "acc-uuid",
  CLOUDMAILIN_CREDENTIALS: "webhook-token",
  TELEGRAM_BOT_TOKEN: "bot-token",
  TELEGRAM_CHAT_ID: "12345",
};

describe("loadConfig", () => {
  beforeEach(() => {
    Object.entries(required).forEach(([k, v]) => {
      process.env[k] = v;
    });
  });

  afterEach(() => {
    Object.keys(required).forEach((k) => {
      delete process.env[k];
    });
    delete process.env.PORT;
    delete process.env.CURVE_SENDER_EMAIL;
  });

  it("loads all required config from env vars", () => {
    const config = loadConfig();
    expect(config.zenmoney.accessToken).toBe("zen-token");
    expect(config.zenmoney.defaultAccountId).toBe("acc-uuid");
    expect(config.cloudmailinToken).toBe("webhook-token");
    expect(config.telegram.botToken).toBe("bot-token");
    expect(config.telegram.chatId).toBe("12345");
  });

  it("uses default port 3000 when PORT is not set", () => {
    const config = loadConfig();
    expect(config.port).toBe(3000);
  });

  it("parses PORT from env when set", () => {
    process.env.PORT = "8080";
    const config = loadConfig();
    expect(config.port).toBe(8080);
  });

  it("uses default curveSenderEmails when not set", () => {
    const config = loadConfig();
    expect(config.curveSenderEmails).toEqual(["support@imaginecurve.com"]);
  });

  it("uses CURVE_SENDER_EMAIL from env when set", () => {
    process.env.CURVE_SENDER_EMAIL = "custom@example.com";
    const config = loadConfig();
    expect(config.curveSenderEmails).toEqual(["custom@example.com"]);
  });

  it("parses multiple comma-separated emails from CURVE_SENDER_EMAIL", () => {
    process.env.CURVE_SENDER_EMAIL =
      "one@example.com, two@example.com , three@example.com";
    const config = loadConfig();
    expect(config.curveSenderEmails).toEqual([
      "one@example.com",
      "two@example.com",
      "three@example.com",
    ]);
  });

  it.each(Object.keys(required))("throws if %s is missing", (key) => {
    delete process.env[key];
    expect(() => loadConfig()).toThrow(key);
  });
});
