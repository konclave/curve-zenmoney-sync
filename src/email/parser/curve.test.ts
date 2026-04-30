import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseCurveEmail, CurveEmailParseError } from "./curve";

const fixtureHtml = readFileSync(join(__dirname, "fixtures/curve-receipt.html"), "utf-8");

const forwardedFixtureHtml = readFileSync(
  join(__dirname, "fixtures/curve-receipt-forwarded.html"),
  "utf-8",
);

describe("parseCurveEmail", () => {
  it("extracts merchant from bold left-aligned td", () => {
    const result = parseCurveEmail(fixtureHtml);
    expect(result.merchant).toBe("Starbucks");
  });

  it("extracts amount as a number", () => {
    const result = parseCurveEmail(fixtureHtml);
    expect(result.amount).toBe(8.09);
  });

  it("resolves currency symbol to ISO code", () => {
    const result = parseCurveEmail(fixtureHtml);
    expect(result.currency).toBe("EUR");
  });

  it("extracts date in yyyy-MM-dd format", () => {
    const result = parseCurveEmail(fixtureHtml);
    expect(result.date).toMatch(/^2026-04-23/);
  });

  it("extracts syncID as last 4 card digits", () => {
    const result = parseCurveEmail(fixtureHtml);
    expect(result.syncID).toBe("0000");
  });

  it("extracts account name (line before card digits)", () => {
    const result = parseCurveEmail(fixtureHtml);
    expect(result.account).toBe("Test Bank");
  });

  it("sets originalAmount and originalCurrency equal to amount and currency", () => {
    const result = parseCurveEmail(fixtureHtml);
    expect(result.originalAmount).toBe(result.amount);
    expect(result.originalCurrency).toBe(result.currency);
  });

  it("throws CurveEmailParseError for empty HTML", () => {
    expect(() => parseCurveEmail("<html><body></body></html>")).toThrow(CurveEmailParseError);
  });

  it("thrown error includes the field that failed", () => {
    expect.assertions(2);
    try {
      parseCurveEmail("<html><body></body></html>");
    } catch (err) {
      expect(err).toBeInstanceOf(CurveEmailParseError);
      expect((err as CurveEmailParseError).field).toBeTruthy();
    }
  });

  it("throws CurveEmailParseError for unrecognised currency symbol", () => {
    const htmlWithUnknownCurrency = fixtureHtml.replace("€8.09", "Ω8.09");
    expect(() => parseCurveEmail(htmlWithUnknownCurrency)).toThrow(CurveEmailParseError);
  });
});

describe("parseCurveEmail — forwarded email (qt- prefixed classes)", () => {
  it("extracts merchant", () => {
    expect(parseCurveEmail(forwardedFixtureHtml).merchant).toBe("Starbucks");
  });

  it("extracts amount", () => {
    expect(parseCurveEmail(forwardedFixtureHtml).amount).toBe(8.09);
  });

  it("extracts currency", () => {
    expect(parseCurveEmail(forwardedFixtureHtml).currency).toBe("EUR");
  });

  it("extracts date", () => {
    expect(parseCurveEmail(forwardedFixtureHtml).date).toMatch(/^2026-04-23/);
  });

  it("extracts syncID", () => {
    expect(parseCurveEmail(forwardedFixtureHtml).syncID).toBe("0000");
  });

  it("extracts account name", () => {
    expect(parseCurveEmail(forwardedFixtureHtml).account).toBe("Test Bank");
  });
});
