# JSON Logging And Telegram Mirroring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add consistent JSON stdout logging for successful processing and mirror Telegram warning/error notifications to stdout in both the server and serverless flows.

**Architecture:** Introduce a shared logger module that emits structured JSON logs and can also be passed into Fastify. Use that logger in the webhook app, the serverless handler, and the Telegram notifier so warn/error notifications and successful processing share the same log shape.

**Tech Stack:** TypeScript, Fastify, Vitest, Pino

---

### Task 1: Add failing tests for shared logging behavior

**Files:**
- Create: `src/logging/logger.test.ts`
- Modify: `src/notifications/telegram.test.ts`
- Modify: `src/server/app.test.ts`
- Modify: `src/serverless/handler.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/logging/logger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppLogger } from './logger';

describe('createAppLogger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('writes JSON info logs to stdout', () => {
    const write = vi.fn();
    const logger = createAppLogger({ write });

    logger.info({ event: 'transaction.created', merchant: 'Starbucks' }, 'Transaction created');

    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0][0]).toContain('"level":30');
    expect(write.mock.calls[0][0]).toContain('"event":"transaction.created"');
    expect(write.mock.calls[0][0]).toContain('"merchant":"Starbucks"');
  });
});
```

```ts
// src/notifications/telegram.test.ts
it('logs warn notifications to stdout before sending Telegram', async () => {
  const logger = { warn: vi.fn(), error: vi.fn() };
  const notifier = new TelegramNotifier(config, logger as any);

  await notifier.warn('Rate limited');

  expect(logger.warn).toHaveBeenCalledWith(
    expect.objectContaining({
      event: 'notification.telegram.warn',
      telegram_notification: true,
    }),
    'Rate limited',
  );
});
```

```ts
// src/server/app.test.ts
it('emits info log for successful processing', async () => {
  const app = buildApp(config);

  await app.inject({
    method: 'POST',
    url: '/webhook?token=test-token',
    payload: validPayload,
  });

  expect(logWriteSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"transaction.created"'));
});
```

```ts
// src/serverless/handler.test.ts
it('emits info log for successful serverless processing', async () => {
  await handler(validEvent);

  expect(logWriteSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"transaction.created"'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/logging/logger.test.ts src/notifications/telegram.test.ts src/server/app.test.ts src/serverless/handler.test.ts`
Expected: FAIL because `src/logging/logger.ts` does not exist and existing code does not inject or assert structured logs.

- [ ] **Step 3: Commit**

```bash
git add src/logging/logger.test.ts src/notifications/telegram.test.ts src/server/app.test.ts src/serverless/handler.test.ts
git commit -m "test: cover json logging flow"
```

### Task 2: Implement shared JSON logger and Telegram mirroring

**Files:**
- Create: `src/logging/logger.ts`
- Modify: `src/notifications/telegram.ts`

- [ ] **Step 1: Write minimal implementation**

```ts
// src/logging/logger.ts
import pino from 'pino';

export function createAppLogger(destination?: pino.DestinationStream) {
  return pino(
    {
      base: { service: 'curve-zenmoney-sync' },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}

export const logger = createAppLogger();
```

```ts
// src/notifications/telegram.ts
export class TelegramNotifier {
  constructor(
    config: TelegramConfig,
    private readonly logger = createAppLogger(),
  ) {}

  async warn(message: string, context?: Record<string, unknown>): Promise<void> {
    this.logger.warn({ event: 'notification.telegram.warn', telegram_notification: true, ...context }, message);
    await this.send(`⚠️ curve-zenmoney-sync\n\n${message}`);
  }
}
```

- [ ] **Step 2: Run targeted tests to verify they pass**

Run: `npm test -- src/logging/logger.test.ts src/notifications/telegram.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/logging/logger.ts src/notifications/telegram.ts src/logging/logger.test.ts src/notifications/telegram.test.ts
git commit -m "feat: add shared json logger"
```

### Task 3: Instrument webhook and serverless processing

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/server/app.test.ts`
- Modify: `src/serverless/handler.ts`
- Modify: `src/serverless/handler.test.ts`

- [ ] **Step 1: Write minimal implementation**

```ts
// src/server/app.ts
const fastify = Fastify({ logger });

fastify.log.info({ event: 'webhook.received' }, 'Webhook received');
fastify.log.info({ event: 'curve.email.parsed', subject: parsedEmail.subject }, 'Curve email parsed');
fastify.log.info(
  {
    event: 'transaction.created',
    merchant: transaction.merchant,
    amount: transaction.amount,
    currency: transaction.currency,
  },
  'Transaction created in ZenMoney',
);
```

```ts
// src/serverless/handler.ts
logger.info({ event: 'webhook.received', source: 'serverless' }, 'Webhook received');
logger.info({ event: 'curve.email.parsed', subject: parsedEmail.subject }, 'Curve email parsed');
logger.info(
  {
    event: 'transaction.created',
    merchant: transaction.merchant,
    amount: transaction.amount,
    currency: transaction.currency,
  },
  'Transaction created in ZenMoney',
);
```

- [ ] **Step 2: Run targeted tests to verify they pass**

Run: `npm test -- src/server/app.test.ts src/serverless/handler.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/server/app.ts src/server/app.test.ts src/serverless/handler.ts src/serverless/handler.test.ts
git commit -m "feat: log webhook processing events"
```

### Task 4: Verify integration end-to-end

**Files:**
- Verify only

- [ ] **Step 1: Run focused verification**

Run: `npm test -- src/logging/logger.test.ts src/notifications/telegram.test.ts src/server/app.test.ts src/serverless/handler.test.ts`
Expected: PASS

- [ ] **Step 2: Run full verification**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/logging/logger.ts src/logging/logger.test.ts src/notifications/telegram.ts src/notifications/telegram.test.ts src/server/app.ts src/server/app.test.ts src/serverless/handler.ts src/serverless/handler.test.ts docs/superpowers/plans/2026-04-28-json-logging-telegram-mirroring.md
git commit -m "feat: add json logging for notifications and sync flow"
```
