# Curve → ZenMoney Email Sync Service — Design

**Date:** 2026-04-23  
**Status:** Approved

---

## Overview

A self-hosted TypeScript/Node.js service that receives forwarded Curve transaction emails via an HTTP webhook (Cloudmailin), parses the transaction details from the email HTML, and creates a corresponding transaction in ZenMoney using the existing API integration.

---

## Goals

- Automatically sync Curve card transactions to ZenMoney without manual entry
- Deployable on a home machine, VPS, or cloud provider identically (Docker)
- Email provider can be swapped (Cloudmailin → Mailgun, IMAP, etc.) without touching business logic
- Failures send Telegram notifications with severity levels so no transaction is silently lost

---

## Architecture

```
Cloudmailin POST /webhook
        │
        ▼
  CloudmailinAdapter          (src/email/providers/cloudmailin.ts)
  normalises payload → ParsedEmail
        │
        ▼
  CurveEmailParser            (src/email/parser/curve.ts)
  extracts → CurveTransactionInput
        │
        ▼
  createZenMoneyTransaction() (src/zenmoney/index.ts)
        │
        ▼
  ZenMoney API
```

On any failure, `TelegramNotifier` (src/notifications/telegram.ts) is called with the appropriate severity level.

---

## File Structure

```
src/
  server.ts               — Fastify setup, /webhook route, /health route
  config.ts               — reads and validates env vars at startup
  email/
    providers/
      types.ts            — EmailProvider interface + ParsedEmail type
      cloudmailin.ts      — CloudmailinAdapter implementation
    parser/
      curve.ts            — CurveEmailParser (HTML → CurveTransactionInput)
  zenmoney/
    index.ts              — ZenMoney API client, mapper, validator (was handler.ts)
  notifications/
    telegram.ts           — TelegramNotifier (warn / error)

docs/
  adr/                    — Architecture Decision Records
  structure.md            — directory map with module descriptions
  superpowers/specs/      — design documents

Dockerfile
docker-compose.yml
.env.example
```

---

## Core Interfaces

### ParsedEmail

The normalised email type that every `EmailProvider` must produce:

```typescript
interface ParsedEmail {
  from: string;
  subject: string;
  html: string;
  plain: string;
}

interface EmailProvider {
  parseWebhookPayload(body: unknown): ParsedEmail;
}
```

### CurveTransactionInput (existing)

Defined in `src/zenmoney/index.ts`. Produced by `CurveEmailParser` from a `ParsedEmail`:

```typescript
interface CurveTransactionInput {
  syncID: string;        // last 4 digits of card (e.g. "8257")
  account: string;       // card label (e.g. "Trading 212")
  amount: number;
  currency: string;      // 3-letter ISO code (e.g. "EUR")
  date: string;          // ISO format
  merchant: string;
  originalAmount: number;
  originalCurrency: string;
}
```

---

## Email Parsing

`CurveEmailParser` parses the HTML body of the Cloudmailin payload. All required fields are present in the HTML of a Curve receipt email:

| Field | Source in HTML |
|---|---|
| `merchant` | Bold `<td>` in receipt row (e.g. "Starbucks") |
| `amount` | Bold `<td>` right-aligned in same row (e.g. "€8.09") |
| `date` | Grey `<td>` below receipt row (e.g. "23 April 2026 10:02:18") |
| `syncID` | Card digits in card section (e.g. "XXXX-8257" → "8257") |
| `account` | Card label in card section (e.g. "Trading 212") |

Currency symbol (e.g. `€`) is converted to ISO code via the existing `getCurrencyCode()` in `src/zenmoney/index.ts`.

---

## Security

- **Sender validation:** Requests from senders other than `support@imaginecurve.com` (configurable via `CURVE_SENDER_EMAIL`) are rejected with a ⚠️ warn notification.
- **Webhook token:** Cloudmailin sends a shared secret in every POST. The `/webhook` route rejects requests with a missing or invalid `X-Cloudmailin-Token` header. This prevents injection of fake transactions.

---

## Telegram Notifications

Two severity levels:

| Level | Method | Emoji | When |
|---|---|---|---|
| Warning | `warn(msg)` | ⚠️ | Transient — service is recovering (rate limit, unexpected sender) |
| Error | `error(msg)` | 🚨 | Terminal — transaction was not created, needs attention |

**Trigger map:**

| Situation | Severity |
|---|---|
| ZenMoney rate limited, retry scheduled | ⚠️ warn |
| Email from unexpected sender | ⚠️ warn |
| ZenMoney API error, retries exhausted → transaction lost | 🚨 error |
| Email parsing failed → can't extract transaction | 🚨 error |
| Startup config invalid (missing env var) | 🚨 error |

**Message format:**
```
🚨 curve-zenmoney-sync

Failed to parse Curve email
Subject: Curve Receipt: Purchase at Starbucks on 23 April 2026 for €8.09
Reason: Could not extract amount from HTML

2026-04-23 10:02:18 UTC
```

---

## Configuration

All configuration is via environment variables, read and validated at startup in `config.ts`. The service refuses to start if required vars are missing.

| Variable | Required | Description |
|---|---|---|
| `PORT` | No (default: 3000) | HTTP server port |
| `ZENMONEY_ACCESS_TOKEN` | Yes | ZenMoney OAuth2 access token |
| `ZENMONEY_DEFAULT_ACCOUNT_ID` | Yes | Default ZenMoney account UUID |
| `CLOUDMAILIN_TOKEN` | Yes | Shared secret for webhook validation |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Yes | Telegram chat/channel ID |
| `CURVE_SENDER_EMAIL` | No (default: support@imaginecurve.com) | Expected sender address |

---

## HTTP Routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhook` | Receives Cloudmailin email payloads |
| `GET` | `/health` | Returns 200 OK — for uptime monitoring |

**Webhook response behaviour:** The `/webhook` route always returns HTTP 200 to Cloudmailin to prevent retries. Errors are handled internally and surfaced via Telegram notifications.

---

## Deployment

Docker is the single deployment target. The image runs identically on a home machine, VPS, or cloud provider.

```yaml
# docker-compose.yml (sketch)
services:
  curve-zenmoney-sync:
    build: .
    restart: unless-stopped
    env_file: .env
    ports:
      - "3000:3000"
```

The public endpoint (`/webhook`) must be reachable from Cloudmailin's servers. On a VPS or cloud this is direct. On a home machine, a reverse proxy or Cloudflare Tunnel is needed.

---

## Error Handling

- Parsing failures and ZenMoney errors are caught, logged, and sent to Telegram.
- Retries on transient ZenMoney errors (rate limits, 5xx) are handled inside `src/zenmoney/index.ts` via the existing `ErrorHandler.withRetry()`.
- The service returns HTTP 200 to Cloudmailin regardless — Cloudmailin retries are not used; Telegram is the recovery mechanism.
