import { describe, it, expect } from "vitest";
import { parseEmailTriggerEvent } from "./event";

describe("parseEmailTriggerEvent", () => {
  it("extracts from, subject, html from a valid event", () => {
    const event = {
      messages: [
        {
          headers: [
            { name: "From", values: ["support@imaginecurve.com"] },
            { name: "Subject", values: ["Your Curve receipt"] },
          ],
          message: "<html><body>Receipt content</body></html>",
        },
      ],
    };

    const result = parseEmailTriggerEvent(event);

    expect(result.from).toBe("support@imaginecurve.com");
    expect(result.subject).toBe("Your Curve receipt");
    expect(result.html).toBe("<html><body>Receipt content</body></html>");
    expect(result.plain).toBe("");
  });

  it("strips display-name decoration from From header", () => {
    const event = {
      messages: [
        {
          headers: [
            { name: "From", values: ["Curve Support <support@imaginecurve.com>"] },
            { name: "Subject", values: ["Test"] },
          ],
          message: "<p>Hello</p>",
        },
      ],
    };

    const result = parseEmailTriggerEvent(event);

    expect(result.from).toBe("support@imaginecurve.com");
  });

  it("returns empty string for from when headers are missing", () => {
    const event = {
      messages: [
        {
          message: "<p>Hello</p>",
        },
      ],
    };

    const result = parseEmailTriggerEvent(event);

    expect(result.from).toBe("");
  });

  it("returns empty string for subject when Subject header is absent", () => {
    const event = {
      messages: [
        {
          headers: [{ name: "From", values: ["support@imaginecurve.com"] }],
          message: "<p>Hello</p>",
        },
      ],
    };

    const result = parseEmailTriggerEvent(event);

    expect(result.subject).toBe("");
  });

  it("returns empty html when message field is absent", () => {
    const event = {
      messages: [
        {
          headers: [
            { name: "From", values: ["support@imaginecurve.com"] },
            { name: "Subject", values: ["Test"] },
          ],
        },
      ],
    };

    const result = parseEmailTriggerEvent(event);

    expect(result.html).toBe("");
  });

  it("throws on non-object event", () => {
    expect(() => parseEmailTriggerEvent(null)).toThrow("Invalid email trigger event");
  });

  it("treats malformed header values as absent data", () => {
    const event = {
      messages: [
        {
          headers: [
            { name: "From", values: [123] },
            { name: "Subject", values: "not-an-array" },
          ],
          message: "<p>Hello</p>",
        },
      ],
    };

    const result = parseEmailTriggerEvent(event);

    expect(result.from).toBe("");
    expect(result.subject).toBe("");
  });

  it("throws on missing messages array", () => {
    expect(() => parseEmailTriggerEvent({})).toThrow("Email trigger event has no messages");
  });

  it("throws on empty messages array", () => {
    expect(() => parseEmailTriggerEvent({ messages: [] })).toThrow(
      "Email trigger event has no messages",
    );
  });

  it("throws on non-object message element", () => {
    expect(() => parseEmailTriggerEvent({ messages: [null] })).toThrow(
      "Email trigger event message is not an object",
    );
  });
});
