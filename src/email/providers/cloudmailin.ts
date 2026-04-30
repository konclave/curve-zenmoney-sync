import type { EmailProvider, ParsedEmail } from "./types";

interface CloudmailinHeaders {
  from?: string;
  subject?: string | string[];
  [key: string]: unknown;
}

interface CloudmailinPayload {
  headers?: CloudmailinHeaders;
  envelope?: { from?: string; to?: string };
  plain?: string;
  html?: string;
}

export class CloudmailinAdapter implements EmailProvider {
  parseWebhookPayload(body: unknown): ParsedEmail {
    if (!body || typeof body !== "object") {
      throw new Error("Invalid Cloudmailin payload: expected an object");
    }

    const payload = body as CloudmailinPayload;
    const headers = payload.headers ?? {};

    const from =
      payload.envelope?.from || (typeof headers.from === "string" ? headers.from : "") || "";

    const rawSubject = headers.subject;
    const subject = Array.isArray(rawSubject) ? (rawSubject[0] ?? "") : (rawSubject ?? "");

    return {
      from,
      subject,
      html: payload.html ?? "",
      plain: payload.plain ?? "",
    };
  }
}
