# ADR-002: Fastify as HTTP framework

**Date:** 2026-04-23  
**Status:** Accepted

## Decision

Use Fastify as the HTTP framework.

## Context

The service needs a minimal HTTP server with two routes: a webhook receiver and a health check.

## Alternatives considered

- **Express** — most familiar Node.js framework; adequate for this scale
- **Node.js built-in `http`** — no dependencies, but requires manual routing and body parsing

## Reasoning

Fastify has first-class TypeScript support, built-in JSON schema validation, and better performance than Express. At the scale of this service (a few requests per day) performance is not a meaningful factor, but TypeScript ergonomics are. The user preferred Fastify over Express.
