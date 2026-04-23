# ADR-003: Cloudmailin as email provider with adapter abstraction

**Date:** 2026-04-23  
**Status:** Accepted

## Decision

Use Cloudmailin as the email-to-webhook provider. Abstract the provider behind an `EmailProvider` interface so it can be replaced without touching business logic.

## Context

The service needs to receive forwarded Curve receipt emails. The user forwards emails from their inbox to an address that triggers the service.

## Alternatives considered

- **IMAP polling** — service polls a dedicated mailbox (e.g. Gmail). No public port required, works on home machines. ~30–60s latency. Requires an App Password or OAuth2 for Gmail.
- **SendGrid Inbound Parse** — requires owning a domain and configuring DNS MX records.
- **Mailgun** — same domain requirement as SendGrid.
- **Cloudmailin** — provides a `@cloudmailin.net` address with zero DNS setup. 200 emails/month free. No domain required.

## Reasoning

Cloudmailin was chosen for its zero-friction setup (no domain, no DNS) and sufficient free tier for personal use. The `EmailProvider` interface ensures a future switch to Mailgun, SendGrid, or IMAP requires only a new adapter file and a config change — no changes to the parser or ZenMoney integration.
