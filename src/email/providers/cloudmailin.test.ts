import { describe, it, expect } from "vitest";
import { CloudmailinAdapter } from "./cloudmailin";

const validPayload = {
  headers: { subject: "Curve Receipt: Purchase at Starbucks on 23 April 2026 for €8.09" },
  envelope: { from: "support@imaginecurve.com", to: "target@cloudmailin.net" },
  plain: "plain text body",
  html: "<html><body>receipt html</body></html>",
};

describe("CloudmailinAdapter", () => {
  const adapter = new CloudmailinAdapter();

  it("extracts from, subject, html, plain from a valid payload", () => {
    const result = adapter.parseWebhookPayload(validPayload);
    expect(result.from).toBe("support@imaginecurve.com");
    expect(result.subject).toBe("Curve Receipt: Purchase at Starbucks on 23 April 2026 for €8.09");
    expect(result.html).toBe("<html><body>receipt html</body></html>");
    expect(result.plain).toBe("plain text body");
  });

  it("falls back to headers.from when envelope.from is empty", () => {
    const payload = {
      ...validPayload,
      envelope: { from: "", to: "" },
      headers: { from: "fallback@example.com", subject: "test" },
    };
    const result = adapter.parseWebhookPayload(payload);
    expect(result.from).toBe("fallback@example.com");
  });

  it("handles array subject header (some mail servers send arrays)", () => {
    const payload = { ...validPayload, headers: { subject: ["First Subject", "Second"] } };
    const result = adapter.parseWebhookPayload(payload);
    expect(result.subject).toBe("First Subject");
  });

  it("returns empty strings for all fields when payload is empty object", () => {
    const result = adapter.parseWebhookPayload({});
    expect(result.from).toBe("");
    expect(result.subject).toBe("");
    expect(result.html).toBe("");
    expect(result.plain).toBe("");
  });

  it("throws for non-object payload", () => {
    expect(() => adapter.parseWebhookPayload("not an object")).toThrow();
  });
});
