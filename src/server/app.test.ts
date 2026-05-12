// src/server/app.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildApp } from "./app";
import { createZenMoneyTransaction } from "../zenmoney/index";
import { TelegramNotifier } from "../notifications/telegram";
import { createAppLogger } from "../logging/logger";

vi.mock("../zenmoney/index", () => ({
  createZenMoneyTransaction: vi.fn().mockResolvedValue({
    success: true,
    transactionId: "tx-123",
    message: "Transaction created successfully in ZenMoney",
    details: { warnings: [] },
  }),
  getCurrencyCode: (symbol: string) => ({ "€": "EUR", $: "USD" })[symbol] ?? symbol,
}));

vi.mock("../notifications/telegram", () => ({
  TelegramNotifier: vi.fn().mockImplementation(function TelegramNotifierMock() {
    return {
      warn: vi.fn().mockResolvedValue(undefined),
      error: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

const config = {
  port: 3000,
  cloudmailinToken: "test-token",
  cloudmailinFormat: "json" as const,
  curveSenderEmails: ["support@imaginecurve.com"],
  zenmoney: { accessToken: "zen-token", defaultAccountId: "acc-id" },
  telegram: { botToken: "bot-token", chatId: "123" },
};

function buildMultipartBody(fields: Record<string, string>, boundary: string): Buffer {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(fields)) {
    lines.push(`--${boundary}`);
    lines.push(`Content-Disposition: form-data; name="${name}"`);
    lines.push("");
    lines.push(value);
  }
  lines.push(`--${boundary}--`);
  return Buffer.from(lines.join("\r\n"));
}

const curveHtml = readFileSync(
  join(__dirname, "../email/parser/fixtures/curve-receipt.html"),
  "utf-8",
);

const validPayload = {
  envelope: { from: "support@imaginecurve.com", to: "target@cloudmailin.net" },
  headers: { subject: "Curve Receipt: Purchase at Starbucks on 23 April 2026 for €8.09" },
  plain: "",
  html: curveHtml,
};

function createLogDestination(logLines: string[]) {
  return {
    write(line: string) {
      logLines.push(line);
    },
  };
}

describe("unknown routes", () => {
  it("drops the connection without responding", async () => {
    const app = buildApp(config);
    await expect(app.inject({ method: "GET", url: "/unknown" })).rejects.toBeDefined();
  });
});

describe("GET /health", () => {
  it("returns 200 with { status: ok }", async () => {
    const app = buildApp(config);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});

const validAuthHeader = `Basic ${Buffer.from(config.cloudmailinToken).toString("base64")}`;

describe("POST /webhook", () => {
  let app: ReturnType<typeof buildApp>;
  let telegramInstance: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let logLines: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    logLines = [];
    app = buildApp(config, createAppLogger(createLogDestination(logLines)));
    telegramInstance = vi.mocked(TelegramNotifier).mock.results[0].value;
  });

  it("returns 401 for missing authorization header", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: validPayload,
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 401 for wrong credentials", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: { authorization: `Basic ${Buffer.from("wrong-token").toString("base64")}` },
      payload: validPayload,
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 200 for valid credentials and valid payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: { authorization: validAuthHeader },
      payload: validPayload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns 200 even when email parsing fails", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: { authorization: validAuthHeader },
      payload: { ...validPayload, html: "<html><body>no receipt here</body></html>" },
    });
    expect(response.statusCode).toBe(200);
  });

  it("returns 200 for email from unexpected sender", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: { authorization: validAuthHeader },
      payload: {
        ...validPayload,
        envelope: { from: "spam@example.com", to: "target@cloudmailin.net" },
      },
    });
    expect(response.statusCode).toBe(200);
  });

  it("sends Telegram error and returns 200 when ZenMoney creation fails", async () => {
    vi.mocked(createZenMoneyTransaction).mockResolvedValueOnce({
      success: false,
      message: "ZenMoney API error",
      error: { type: "ZenMoneyApiError", message: "quota exceeded" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: { authorization: validAuthHeader },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(telegramInstance.error).toHaveBeenCalledWith(
      expect.stringContaining("quota exceeded"),
      expect.objectContaining({
        merchant: "Starbucks",
        currency: "EUR",
        reason: "quota exceeded",
      }),
    );
  });

  it("emits info log for successful processing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: { authorization: validAuthHeader },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);

    const transactionCreatedLog = logLines
      .map((line) => JSON.parse(line))
      .find((entry) => entry.event === "transaction.created");

    expect(transactionCreatedLog).toMatchObject({
      event: "transaction.created",
      merchant: "Starbucks",
      currency: "EUR",
    });
  });
});

describe("POST /webhook (multipart format)", () => {
  const boundary = "----TestBoundary123";
  const multipartConfig = { ...config, cloudmailinFormat: "multipart" as const };

  it("returns 200 and processes valid multipart payload", async () => {
    const app = buildApp(multipartConfig);
    const fields = {
      "envelope[from]": "support@imaginecurve.com",
      "envelope[to]": "target@cloudmailin.net",
      "headers[subject]": "Curve Receipt: Purchase at Starbucks on 23 April 2026 for €8.09",
      plain: "",
      html: curveHtml,
    };

    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: {
        authorization: validAuthHeader,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: buildMultipartBody(fields, boundary),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns 401 for missing authorization in multipart request", async () => {
    const app = buildApp(multipartConfig);
    const fields = { "envelope[from]": "support@imaginecurve.com", plain: "", html: "" };

    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: buildMultipartBody(fields, boundary),
    });

    expect(response.statusCode).toBe(401);
  });
});
