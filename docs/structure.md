# Project Structure

## Overview

`curve-zenmoney-sync` is a self-hosted service that receives forwarded Curve card transaction emails via HTTP webhook, parses the transaction details, and creates corresponding transactions in ZenMoney.

---

## Directory Map

```
curve-zenmoney-sync/
│
├── src/
│   ├── server.ts               — Fastify HTTP server. Registers /webhook and /health routes.
│   ├── config.ts               — Reads and validates all environment variables at startup.
│   │                             The service refuses to start if required vars are missing.
│   │
│   ├── email/                  — Everything related to receiving and parsing emails.
│   │   ├── providers/
│   │   │   ├── types.ts        — EmailProvider interface and ParsedEmail type.
│   │   │   │                     This is the abstraction boundary: swap providers by
│   │   │   │                     implementing this interface.
│   │   │   └── cloudmailin.ts  — CloudmailinAdapter. Normalises Cloudmailin's webhook
│   │   │                         POST payload into a ParsedEmail.
│   │   └── parser/
│   │       └── curve.ts        — CurveEmailParser. Parses the HTML body of a Curve receipt
│   │                             email and produces a CurveTransactionInput.
│   │
│   ├── zenmoney/
│   │   └── index.ts            — ZenMoney API integration. Contains the API client,
│   │                             transaction mapper, merchant manager, currency converter,
│   │                             validator, and the main createZenMoneyTransaction() entry
│   │                             point. Moved from handler.ts at project root.
│   │
│   └── notifications/
│       └── telegram.ts         — TelegramNotifier. Sends ⚠️ warn and 🚨 error messages
│                                 to a configured Telegram chat via Bot API.
│
├── docs/
│   ├── adr/                    — Architecture Decision Records. One file per decision.
│   │   ├── 001-language-and-runtime.md
│   │   ├── 002-http-framework.md
│   │   ├── 003-email-provider.md
│   │   ├── 004-deployment.md
│   │   └── 005-email-ingestion-strategy.md
│   ├── structure.md            — This file.
│   ├── zenmoney-module.md      — ZenMoney module internals: validation rules, account
│   │                             resolution, merchant handling, currency conversion,
│   │                             transaction mapping, and API communication.
│   └── superpowers/specs/      — Design documents.
│
├── Dockerfile                  — Multi-stage build. Produces a minimal production image.
├── docker-compose.yml          — Single-service compose file. Reads config from .env.
└── .env.example                — All supported environment variables with descriptions.
```

---

## Data Flow

```
Cloudmailin POST /webhook
      │
      ▼
CloudmailinAdapter          parses raw webhook body → ParsedEmail
      │
      ▼
CurveEmailParser            parses HTML → CurveTransactionInput
      │
      ▼
createZenMoneyTransaction() calls ZenMoney API
      │
      ├── success → HTTP 200
      └── failure → TelegramNotifier.error() + HTTP 200
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP server port |
| `ZENMONEY_ACCESS_TOKEN` | Yes | — | ZenMoney OAuth2 access token |
| `ZENMONEY_DEFAULT_ACCOUNT_ID` | Yes | — | Default ZenMoney account UUID |
| `CLOUDMAILIN_CREDENTIALS` | Yes | — | Shared credentials for webhook validation |
| `CLOUDMAILIN_FORMAT` | No | `multipart` | Cloudmailin POST format: `json` or `multipart` — must match the target's "Post Format" setting |
| `TELEGRAM_BOT_TOKEN` | Yes | — | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Yes | — | Telegram chat or channel ID |
| `CURVE_SENDER_EMAIL` | No | `support@imaginecurve.com` | Expected sender address for validation |
