# ADR-005: HTTP webhook over IMAP polling for email ingestion

**Date:** 2026-04-23  
**Status:** Accepted

## Decision

Receive emails via HTTP webhook (Cloudmailin) rather than polling an IMAP mailbox.

## Context

Two viable strategies were considered for getting Curve receipt emails into the service.

## Alternatives considered

- **IMAP polling** — connect to an IMAP mailbox, poll every 30–60s for new emails, mark as read after processing. No public port required. Works on home machines without port forwarding. ~30–60s processing delay. Requires managing IMAP credentials and polling state.

- **HTTP webhook** — a third-party service receives the email and POSTs it to the service immediately. Near-instant processing. Requires the service to have a public HTTP endpoint.

## Reasoning

The webhook approach was chosen for simplicity of implementation: no polling loop, no IMAP state management, no credential handling for a separate mailbox. The ~30–60s delay of IMAP is acceptable for personal finance sync, but the webhook approach is simpler code.

The trade-off is that a public endpoint is required. On a VPS or cloud this is native. On a home machine a tunnel (e.g. Cloudflare Tunnel) is needed — acceptable given the primary deployment target is a VPS or cloud.

The `EmailProvider` abstraction means IMAP can be added later as an alternative adapter if the deployment context changes.
