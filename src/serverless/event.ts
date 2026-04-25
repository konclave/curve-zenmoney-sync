import type { ParsedEmail } from '../email/providers/types';

export interface EmailTriggerMessage {
  received_at?: string;
  headers?: Array<{ name: string; value: string }>;
  message?: string;
  attachments?: { bucket_id?: string; keys?: string[] };
}

export interface EmailTriggerEvent {
  messages: EmailTriggerMessage[];
}

export function parseEmailTriggerEvent(event: unknown): ParsedEmail {
  if (event === null || typeof event !== 'object') {
    throw new Error('Invalid email trigger event');
  }

  const ev = event as Record<string, unknown>;

  if (!Array.isArray(ev['messages']) || ev['messages'].length === 0) {
    throw new Error('Email trigger event has no messages');
  }

  const rawMsg = ev['messages'][0];
  if (rawMsg === null || typeof rawMsg !== 'object') {
    throw new Error('Email trigger event message is not an object');
  }
  const msg = rawMsg as EmailTriggerMessage;

  const headers = msg.headers ?? [];

  const fromHeader = headers.find((h) => h.name.toLowerCase() === 'from');
  let from = fromHeader?.value ?? '';
  const angleMatch = from.match(/<([^>]+)>/);
  if (angleMatch) {
    from = angleMatch[1];
  }

  const subjectHeader = headers.find((h) => h.name.toLowerCase() === 'subject');
  const subject = subjectHeader?.value ?? '';

  const html = msg.message ?? '';

  return { from, subject, html, plain: '' };
}
