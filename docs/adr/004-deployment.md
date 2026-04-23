# ADR-004: Docker as deployment target

**Date:** 2026-04-23  
**Status:** Accepted

## Decision

Package and run the service as a Docker container.

## Context

The service should run identically on a self-hosted machine, a VPS, and a cloud provider.

## Alternatives considered

- **Plain Node.js process with pm2/systemd** — works but requires Node.js installed on the host and per-environment process manager setup
- **Serverless (AWS Lambda, Cloud Run)** — possible but adds cold-start latency and requires cloud-specific configuration; doesn't map well to a self-hosted machine

## Reasoning

Docker provides environment parity across all three deployment targets with a single `docker-compose up`. Configuration is entirely via `.env` file. No host-level dependencies beyond Docker itself.
