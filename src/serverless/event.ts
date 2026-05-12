import type { ParsedEmail } from "../email/providers/types";

export interface YandexEmailTriggerHeader {
  name: string;
  values: string[];
}

export interface YandexEmailTriggerAttachments {
  bucket_id?: string;
  keys?: string[];
}

export interface YandexEmailTriggerMessage {
  received_at?: string;
  headers?: YandexEmailTriggerHeader[];
  message?: string;
  attachments?: YandexEmailTriggerAttachments;
}

export interface YandexEmailTriggerEvent {
  messages: YandexEmailTriggerMessage[];
}

function getHeaderValue(headers: YandexEmailTriggerHeader[], name: string): string {
  const header = headers.find((entry) => entry.name.toLowerCase() === name.toLowerCase());

  if (!Array.isArray(header?.values) || typeof header.values[0] !== "string") {
    return "";
  }

  return header.values[0];
}

export function parseEmailTriggerEvent(event: unknown): ParsedEmail {
  if (event === null || typeof event !== "object") {
    throw new Error("Invalid email trigger event");
  }

  const ev = event as Record<string, unknown>;

  if (!Array.isArray(ev["messages"]) || ev["messages"].length === 0) {
    throw new Error("Email trigger event has no messages");
  }

  const rawMsg = ev["messages"][0];
  if (rawMsg === null || typeof rawMsg !== "object") {
    throw new Error("Email trigger event message is not an object");
  }
  const msg = rawMsg as YandexEmailTriggerMessage;

  const headers = msg.headers ?? [];

  let from = getHeaderValue(headers, "from");
  const angleMatch = from.match(/<([^>]+)>/);
  if (angleMatch) {
    from = angleMatch[1];
  }

  const subject = getHeaderValue(headers, "subject");

  const html = msg.message ?? "";

  return { from, subject, html, plain: "" };
}
