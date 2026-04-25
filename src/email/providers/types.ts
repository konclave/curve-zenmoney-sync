export interface ParsedEmail {
  from: string;
  subject: string;
  html: string;
  plain: string;
}

export interface EmailProvider {
  parseWebhookPayload(body: unknown): ParsedEmail;
}
