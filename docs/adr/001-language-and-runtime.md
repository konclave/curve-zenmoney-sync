# ADR-001: TypeScript / Node.js as language and runtime

**Date:** 2026-04-23  
**Status:** Accepted

## Decision

Use TypeScript on Node.js for the service.

## Context

The existing ZenMoney integration (`handler.ts`) is TypeScript. The project needed a runtime for the new HTTP service.

## Alternatives considered

- **Python** — would require rewriting or wrapping the existing TypeScript integration
- **Go** — same rewrite cost; no existing code to leverage

## Reasoning

Staying in TypeScript avoids a rewrite of the ZenMoney integration, keeps the project in a single language, and the existing `handler.ts` can be moved into the new structure without changes.
