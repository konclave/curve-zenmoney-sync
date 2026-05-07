# Curve → ZenMoney Email Sync Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Fastify HTTP service that receives Cloudmailin email webhooks, parses Curve receipt emails, and creates ZenMoney transactions.

**Architecture:** A Fastify server exposes `POST /webhook` which validates a token, normalises the Cloudmailin payload via `CloudmailinAdapter`, parses transaction fields from the email HTML via `CurveEmailParser`, and calls the existing `createZenMoneyTransaction()`. Failures are reported to Telegram with severity levels (⚠️ warn / 🚨 error).

**Tech Stack:** TypeScript 5, Node.js 22, Fastify 5, node-html-parser 6, Vitest 2, Docker

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Move | `handler.ts` → `src/zenmoney/index.ts` | ZenMoney API client, mapper, validator — untouched |
| Create | `src/index.ts` | Entry point: load config, build app, start server |
| Create | `src/config.ts` | Read and validate all env vars at startup |
| Create | `src/config.test.ts` | Tests for config loading |
| Create | `src/server.ts` | `buildApp()`: registers Fastify routes |
| Create | `src/server.test.ts` | Tests for webhook and health routes |
| Create | `src/notifications/telegram.ts` | `TelegramNotifier`: `warn()` / `error()` |
| Create | `src/notifications/telegram.test.ts` | Tests for Telegram notification formatting |
| Create | `src/email/providers/types.ts` | `EmailProvider` interface + `ParsedEmail` type |
| Create | `src/email/providers/cloudmailin.ts` | `CloudmailinAdapter` |
| Create | `src/email/providers/cloudmailin.test.ts` | Tests for payload normalisation |
| Create | `src/email/parser/curve.ts` | `parseCurveEmail()` — HTML → `CurveTransactionInput` |
| Create | `src/email/parser/curve.test.ts` | Tests for HTML parsing |
| Create | `src/email/parser/fixtures/curve-receipt.html` | Realistic HTML fixture for parser tests |
| Create | `Dockerfile` | Multi-stage build |
| Create | `docker-compose.yml` | Single-service compose |
| Create | `.env.example` | All supported env vars with descriptions |
| Create | `package.json` | Dependencies and scripts |
| Create | `tsconfig.json` | TypeScript compiler config |
| Create | `vitest.config.ts` | Vitest config |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "curve-zenmoney-sync",
  "version": "1.0.0",
  "description": "Syncs Curve card transactions to ZenMoney via email webhooks",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "node-html-parser": "^6.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts
git commit -m "chore: project scaffold — Fastify, TypeScript, Vitest"
```

---

## Task 2: Move ZenMoney Module

**Files:**
- Create: `src/zenmoney/index.ts` (copy of `handler.ts`)

- [ ] **Step 1: Create the directory and copy the file**

```bash
mkdir -p src/zenmoney
cp handler.ts src/zenmoney/index.ts
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are errors related to `process`, `crypto`, or `fetch` not being found, they are resolved in Task 1 via `@types/node` — re-run `npm install` if needed.

- [ ] **Step 3: Commit**

```bash
git add src/zenmoney/index.ts
git commit -m "refactor: move handler.ts to src/zenmoney/index.ts"
```

---

## Task 3: Config Module

**Files:**
- Create: `src/config.ts`
- Create: `src/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config';

const required: Record<string, string> = {
  ZENMONEY_ACCESS_TOKEN: 'zen-token',
  ZENMONEY_DEFAULT_ACCOUNT_ID: 'acc-uuid',
  CLOUDMAILIN_CREDENTIALS: 'webhook-token',
  TELEGRAM_BOT_TOKEN: 'bot-token',
  TELEGRAM_CHAT_ID: '12345',
};

describe('loadConfig', () => {
  beforeEach(() => {
    Object.entries(required).forEach(([k, v]) => { process.env[k] = v; });
  });

  afterEach(() => {
    Object.keys(required).forEach(k => { delete process.env[k]; });
    delete process.env.PORT;
    delete process.env.CURVE_SENDER_EMAIL;
  });

  it('loads all required config from env vars', () => {
    const config = loadConfig();
    expect(config.zenmoney.accessToken).toBe('zen-token');
    expect(config.zenmoney.defaultAccountId).toBe('acc-uuid');
    expect(config.cloudmailinToken).toBe('webhook-token');
    expect(config.telegram.botToken).toBe('bot-token');
    expect(config.telegram.chatId).toBe('12345');
  });

  it('uses default port 3000 when PORT is not set', () => {
    const config = loadConfig();
    expect(config.port).toBe(3000);
  });

  it('parses PORT from env when set', () => {
    process.env.PORT = '8080';
    const config = loadConfig();
    expect(config.port).toBe(8080);
  });

  it('uses default curveSenderEmail when not set', () => {
    const config = loadConfig();
    expect(config.curveSenderEmail).toBe('support@imaginecurve.com');
  });

  it('uses CURVE_SENDER_EMAIL from env when set', () => {
    process.env.CURVE_SENDER_EMAIL = 'custom@example.com';
    const config = loadConfig();
    expect(config.curveSenderEmail).toBe('custom@example.com');
  });

  it.each(Object.keys(required))('throws if %s is missing', (key) => {
    delete process.env[key];
    expect(() => loadConfig()).toThrow(key);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/config.test.ts
```

Expected: FAIL — `Cannot find module './config'`

- [ ] **Step 3: Implement `src/config.ts`**

```typescript
export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface ZenMoneyServiceConfig {
  accessToken: string;
  defaultAccountId: string;
}

export interface Config {
  port: number;
  zenmoney: ZenMoneyServiceConfig;
  cloudmailinToken: string;
  telegram: TelegramConfig;
  curveSenderEmail: string;
}

export function loadConfig(): Config {
  const required = [
    'ZENMONEY_ACCESS_TOKEN',
    'ZENMONEY_DEFAULT_ACCOUNT_ID',
    'CLOUDMAILIN_CREDENTIALS',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    zenmoney: {
      accessToken: process.env.ZENMONEY_ACCESS_TOKEN!,
      defaultAccountId: process.env.ZENMONEY_DEFAULT_ACCOUNT_ID!,
    },
    cloudmailinToken: process.env.CLOUDMAILIN_CREDENTIALS!,
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      chatId: process.env.TELEGRAM_CHAT_ID!,
    },
    curveSenderEmail: process.env.CURVE_SENDER_EMAIL ?? 'support@imaginecurve.com',
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/config.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: config module with startup validation"
```

---

## Task 4: Telegram Notifier

**Files:**
- Create: `src/notifications/telegram.ts`
- Create: `src/notifications/telegram.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/notifications/telegram.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramNotifier } from './telegram';

const config = { botToken: 'test-bot-token', chatId: '123' };

describe('TelegramNotifier', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  it('sends warn message with ⚠️ prefix to correct URL', async () => {
    const notifier = new TelegramNotifier(config);
    await notifier.warn('Rate limited');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-bot-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: '123',
          text: '⚠️ curve-zenmoney-sync\n\nRate limited',
        }),
      }),
    );
  });

  it('sends error message with 🚨 prefix', async () => {
    const notifier = new TelegramNotifier(config);
    await notifier.error('Transaction lost');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: '123',
          text: '🚨 curve-zenmoney-sync\n\nTransaction lost',
        }),
      }),
    );
  });

  it('does not throw if fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const notifier = new TelegramNotifier(config);
    await expect(notifier.error('test')).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/notifications/telegram.test.ts
```

Expected: FAIL — `Cannot find module './telegram'`

- [ ] **Step 3: Implement `src/notifications/telegram.ts`**

```typescript
import type { TelegramConfig } from '../config';

export class TelegramNotifier {
  private readonly apiUrl: string;
  private readonly chatId: string;

  constructor(config: TelegramConfig) {
    this.apiUrl = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    this.chatId = config.chatId;
  }

  async warn(message: string): Promise<void> {
    await this.send(`⚠️ curve-zenmoney-sync\n\n${message}`);
  }

  async error(message: string): Promise<void> {
    await this.send(`🚨 curve-zenmoney-sync\n\n${message}`);
  }

  private async send(text: string): Promise<void> {
    try {
      await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text }),
      });
    } catch (err) {
      console.error('Failed to send Telegram notification:', err);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/notifications/telegram.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/notifications/telegram.ts src/notifications/telegram.test.ts
git commit -m "feat: Telegram notifier with warn/error severity levels"
```

---

## Task 5: Email Provider Types and Cloudmailin Adapter

**Files:**
- Create: `src/email/providers/types.ts`
- Create: `src/email/providers/cloudmailin.ts`
- Create: `src/email/providers/cloudmailin.test.ts`

- [ ] **Step 1: Create `src/email/providers/types.ts`**

No test needed — this is a type-only file.

```typescript
export interface ParsedEmail {
  from: string;
  subject: string;
  html: string;
  plain: string;
}

export interface EmailProvider {
  parseWebhookPayload(body: unknown): ParsedEmail;
}
```

- [ ] **Step 2: Write the failing test for CloudmailinAdapter**

```typescript
// src/email/providers/cloudmailin.test.ts
import { describe, it, expect } from 'vitest';
import { CloudmailinAdapter } from './cloudmailin';

const validPayload = {
  headers: { subject: 'Curve Receipt: Purchase at Starbucks on 23 April 2026 for €8.09' },
  envelope: { from: 'support@imaginecurve.com', to: 'target@cloudmailin.net' },
  plain: 'plain text body',
  html: '<html><body>receipt html</body></html>',
};

describe('CloudmailinAdapter', () => {
  const adapter = new CloudmailinAdapter();

  it('extracts from, subject, html, plain from a valid payload', () => {
    const result = adapter.parseWebhookPayload(validPayload);
    expect(result.from).toBe('support@imaginecurve.com');
    expect(result.subject).toBe('Curve Receipt: Purchase at Starbucks on 23 April 2026 for €8.09');
    expect(result.html).toBe('<html><body>receipt html</body></html>');
    expect(result.plain).toBe('plain text body');
  });

  it('falls back to headers.from when envelope.from is empty', () => {
    const payload = {
      ...validPayload,
      envelope: { from: '', to: '' },
      headers: { from: 'fallback@example.com', subject: 'test' },
    };
    const result = adapter.parseWebhookPayload(payload);
    expect(result.from).toBe('fallback@example.com');
  });

  it('handles array subject header (some mail servers send arrays)', () => {
    const payload = { ...validPayload, headers: { subject: ['First Subject', 'Second'] } };
    const result = adapter.parseWebhookPayload(payload);
    expect(result.subject).toBe('First Subject');
  });

  it('returns empty strings for all fields when payload is empty object', () => {
    const result = adapter.parseWebhookPayload({});
    expect(result.from).toBe('');
    expect(result.subject).toBe('');
    expect(result.html).toBe('');
    expect(result.plain).toBe('');
  });

  it('throws for non-object payload', () => {
    expect(() => adapter.parseWebhookPayload('not an object')).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- src/email/providers/cloudmailin.test.ts
```

Expected: FAIL — `Cannot find module './cloudmailin'`

- [ ] **Step 4: Implement `src/email/providers/cloudmailin.ts`**

```typescript
import type { EmailProvider, ParsedEmail } from './types';

interface CloudmailinHeaders {
  from?: string;
  subject?: string | string[];
  [key: string]: unknown;
}

interface CloudmailinPayload {
  headers?: CloudmailinHeaders;
  envelope?: { from?: string; to?: string };
  plain?: string;
  html?: string;
}

export class CloudmailinAdapter implements EmailProvider {
  parseWebhookPayload(body: unknown): ParsedEmail {
    if (!body || typeof body !== 'object') {
      throw new Error('Invalid Cloudmailin payload: expected an object');
    }

    const payload = body as CloudmailinPayload;
    const headers = payload.headers ?? {};

    const from =
      payload.envelope?.from ||
      (typeof headers.from === 'string' ? headers.from : '') ||
      '';

    const rawSubject = headers.subject;
    const subject = Array.isArray(rawSubject)
      ? (rawSubject[0] ?? '')
      : (rawSubject ?? '');

    return {
      from,
      subject,
      html: payload.html ?? '',
      plain: payload.plain ?? '',
    };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- src/email/providers/cloudmailin.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/email/providers/types.ts src/email/providers/cloudmailin.ts src/email/providers/cloudmailin.test.ts
git commit -m "feat: EmailProvider interface and CloudmailinAdapter"
```

---

## Task 6: Curve Email Parser

**Files:**
- Create: `src/email/parser/fixtures/curve-receipt.html`
- Create: `src/email/parser/curve.ts`
- Create: `src/email/parser/curve.test.ts`

- [ ] **Step 1: Create the HTML fixture**

```html
<!-- src/email/parser/fixtures/curve-receipt.html -->
<!doctype html>
<html>
<body>
  <center>
    <table id="bodyTable">
      <tr>
        <td>
          <table id="templateContainer">
            <tr>
              <td id="ReceiptContainer">
                <table>
                  <tbody>
                    <tr>
                      <td class="u-padding__bottom">
                        <h1>Email Receipt</h1>
                      </td>
                    </tr>
                    <tr>
                      <td class="u-padding__topBottom u-border__top">
                        Hello Ivan,<br><br>You made a purchase at:
                      </td>
                    </tr>
                    <tr>
                      <td class="u-padding__topBottom--half u-border__top">
                        <table>
                          <tr>
                            <td class="u-bold" align="left" style="font-weight: bold;">
                              Starbucks
                            </td>
                            <td class="u-bold" align="right" style="font-weight: bold;">
                              €8.09
                            </td>
                          </tr>
                          <tr>
                            <td class="u-greySmaller u-padding__top--half" align="left" style="color: #737373;">
                              23 April 2026 10:02:18
                            </td>
                            <td class="u-greySmaller u-padding__top--half" align="right" style="color: #737373;">
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td class="u-padding__top u-border__top">On this card:</td>
                    </tr>
                    <tr>
                      <td class="u-padding__topBottom">
                        <table>
                          <tr>
                            <td align="center">
                              <img src="https://cardimages.imaginecurve.com/cards/522943.png" width="200">
                            </td>
                          </tr>
                          <tr>
                            <td class="u-padding__top--half" align="center">
                              Ivan Vasilev<br>
                              Trading 212<br>
                              XXXX-8257<br>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/email/parser/curve.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCurveEmail, CurveEmailParseError } from './curve';

const fixtureHtml = readFileSync(
  join(__dirname, 'fixtures/curve-receipt.html'),
  'utf-8',
);

describe('parseCurveEmail', () => {
  it('extracts merchant from bold left-aligned td', () => {
    const result = parseCurveEmail(fixtureHtml);
    expect(result.merchant).toBe('Starbucks');
  });

  it('extracts amount as a number', () => {
    const result = parseCurveEmail(fixtureHtml);
    expect(result.amount).toBe(8.09);
  });

  it('resolves currency symbol to ISO code', () => {
    const result = parseCurveEmail(fixtureHtml);
    expect(result.currency).toBe('EUR');
  });

  it('extracts date in yyyy-MM-dd format', () => {
    const result = parseCurveEmail(fixtureHtml);
    expect(result.date).toMatch(/^2026-04-23/);
  });

  it('extracts syncID as last 4 card digits', () => {
    const result = parseCurveEmail(fixtureHtml);
    expect(result.syncID).toBe('8257');
  });

  it('extracts account name (line before card digits)', () => {
    const result = parseCurveEmail(fixtureHtml);
    expect(result.account).toBe('Trading 212');
  });

  it('sets originalAmount and originalCurrency equal to amount and currency', () => {
    const result = parseCurveEmail(fixtureHtml);
    expect(result.originalAmount).toBe(result.amount);
    expect(result.originalCurrency).toBe(result.currency);
  });

  it('throws CurveEmailParseError for empty HTML', () => {
    expect(() => parseCurveEmail('<html><body></body></html>')).toThrow(CurveEmailParseError);
  });

  it('thrown error includes the field that failed', () => {
    try {
      parseCurveEmail('<html><body></body></html>');
    } catch (err) {
      expect(err).toBeInstanceOf(CurveEmailParseError);
      expect((err as CurveEmailParseError).field).toBeTruthy();
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- src/email/parser/curve.test.ts
```

Expected: FAIL — `Cannot find module './curve'`

- [ ] **Step 4: Implement `src/email/parser/curve.ts`**

```typescript
import { parse } from 'node-html-parser';
import { getCurrencyCode } from '../../zenmoney/index';
import type { CurveTransactionInput } from '../../zenmoney/index';

export class CurveEmailParseError extends Error {
  constructor(
    message: string,
    public readonly field: string,
  ) {
    super(message);
    this.name = 'CurveEmailParseError';
  }
}

export function parseCurveEmail(html: string): CurveTransactionInput {
  const root = parse(html);

  // Merchant: first bold td aligned left
  const boldTds = root.querySelectorAll('td.u-bold');
  const merchantTd = boldTds.find(td => td.getAttribute('align') === 'left');
  if (!merchantTd) {
    throw new CurveEmailParseError('Could not find merchant element in email HTML', 'merchant');
  }
  const merchant = merchantTd.text.trim();
  if (!merchant) {
    throw new CurveEmailParseError('Merchant element is empty', 'merchant');
  }

  // Amount + currency: first bold td aligned right
  const amountTd = boldTds.find(td => td.getAttribute('align') === 'right');
  if (!amountTd) {
    throw new CurveEmailParseError('Could not find amount element in email HTML', 'amount');
  }
  const amountText = amountTd.text.trim();
  const amountMatch = amountText.match(/^([^\d]+)([\d,.]+)$/);
  if (!amountMatch) {
    throw new CurveEmailParseError(`Could not parse amount from: "${amountText}"`, 'amount');
  }
  const currencySymbol = amountMatch[1].trim();
  const amount = parseFloat(amountMatch[2].replace(',', ''));
  const currency = getCurrencyCode(currencySymbol);

  // Date: first non-empty grey smaller td with half top padding
  const dateTds = root.querySelectorAll('td.u-greySmaller.u-padding__top--half');
  const dateTd = dateTds.find(td => td.text.trim().length > 0);
  if (!dateTd) {
    throw new CurveEmailParseError('Could not find date element in email HTML', 'date');
  }
  const dateText = dateTd.text.trim();
  const parsedDate = new Date(dateText);
  if (isNaN(parsedDate.getTime())) {
    throw new CurveEmailParseError(`Could not parse date from: "${dateText}"`, 'date');
  }
  const date = parsedDate.toISOString();

  // Card info: centered td containing XXXX-NNNN
  const centerTds = root.querySelectorAll('td[align="center"]');
  const cardTd = centerTds.find(td => /XXXX-\d{4}/.test(td.text));
  if (!cardTd) {
    throw new CurveEmailParseError('Could not find card info section in email HTML', 'syncID');
  }

  const cardLines = cardTd.innerHTML
    .split(/<br\s*\/?>/i)
    .map(fragment => parse(fragment).text.trim())
    .filter(Boolean);

  const cardDigitsIndex = cardLines.findIndex(line => /XXXX-\d{4}/.test(line));
  if (cardDigitsIndex < 0) {
    throw new CurveEmailParseError('Could not find XXXX-NNNN pattern in card section', 'syncID');
  }

  const syncIDMatch = cardLines[cardDigitsIndex].match(/XXXX-(\d{4})/);
  if (!syncIDMatch) {
    throw new CurveEmailParseError('Could not extract last 4 digits from card line', 'syncID');
  }
  const syncID = syncIDMatch[1];

  if (cardDigitsIndex === 0) {
    throw new CurveEmailParseError('Could not find account name (expected line before card digits)', 'account');
  }
  const account = cardLines[cardDigitsIndex - 1];

  return {
    syncID,
    account,
    amount,
    currency,
    date,
    merchant,
    originalAmount: amount,
    originalCurrency: currency,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- src/email/parser/curve.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/email/parser/curve.ts src/email/parser/curve.test.ts src/email/parser/fixtures/curve-receipt.html
git commit -m "feat: Curve email parser — HTML to CurveTransactionInput"
```

---

## Task 7: Fastify Server

**Files:**
- Create: `src/server.ts`
- Create: `src/server.test.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildApp } from './server';

vi.mock('./zenmoney/index', () => ({
  createZenMoneyTransaction: vi.fn().mockResolvedValue({
    success: true,
    transactionId: 'tx-123',
    message: 'Transaction created successfully in ZenMoney',
    details: { warnings: [] },
  }),
  getCurrencyCode: (symbol: string) => ({ '€': 'EUR', '$': 'USD' }[symbol] ?? symbol),
}));

vi.mock('./notifications/telegram', () => ({
  TelegramNotifier: vi.fn().mockImplementation(() => ({
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
  })),
}));

const config = {
  port: 3000,
  cloudmailinToken: 'test-token',
  curveSenderEmail: 'support@imaginecurve.com',
  zenmoney: { accessToken: 'zen-token', defaultAccountId: 'acc-id' },
  telegram: { botToken: 'bot-token', chatId: '123' },
};

const curveHtml = readFileSync(
  join(__dirname, 'email/parser/fixtures/curve-receipt.html'),
  'utf-8',
);

const validPayload = {
  envelope: { from: 'support@imaginecurve.com', to: 'target@cloudmailin.net' },
  headers: { subject: 'Curve Receipt: Purchase at Starbucks on 23 April 2026 for €8.09' },
  plain: '',
  html: curveHtml,
};

describe('GET /health', () => {
  it('returns 200 with { status: ok }', async () => {
    const app = buildApp(config);
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /webhook', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp(config);
    vi.clearAllMocks();
  });

  it('returns 401 for missing token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhook',
      payload: validPayload,
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 401 for wrong token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhook?token=wrong-token',
      payload: validPayload,
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 200 for valid token and valid payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhook?token=test-token',
      payload: validPayload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('returns 200 even when email parsing fails', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhook?token=test-token',
      payload: { ...validPayload, html: '<html><body>no receipt here</body></html>' },
    });
    expect(response.statusCode).toBe(200);
  });

  it('returns 200 for email from unexpected sender', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhook?token=test-token',
      payload: { ...validPayload, envelope: { from: 'spam@example.com', to: 'target@cloudmailin.net' } },
    });
    expect(response.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/server.test.ts
```

Expected: FAIL — `Cannot find module './server'`

- [ ] **Step 3: Implement `src/server.ts`**

```typescript
import Fastify from 'fastify';
import type { Config } from './config';
import { CloudmailinAdapter } from './email/providers/cloudmailin';
import { parseCurveEmail, CurveEmailParseError } from './email/parser/curve';
import { createZenMoneyTransaction } from './zenmoney/index';
import type { ScriptExecutionConfig } from './zenmoney/index';
import { TelegramNotifier } from './notifications/telegram';

export function buildApp(config: Config) {
  const fastify = Fastify({ logger: true });
  const emailAdapter = new CloudmailinAdapter();
  const telegram = new TelegramNotifier(config.telegram);

  fastify.get('/health', async () => ({ status: 'ok' }));

  fastify.post('/webhook', async (request, reply) => {
    const { token } = request.query as { token?: string };
    if (!token || token !== config.cloudmailinToken) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // Parse webhook payload → ParsedEmail
    let parsedEmail;
    try {
      parsedEmail = emailAdapter.parseWebhookPayload(request.body);
    } catch (err) {
      const message = (err as Error).message;
      await telegram.error(`Failed to parse webhook payload\nReason: ${message}\n\n${new Date().toISOString()}`);
      return { status: 'ok' };
    }

    // Validate sender
    if (parsedEmail.from !== config.curveSenderEmail) {
      await telegram.warn(
        `Email from unexpected sender: ${parsedEmail.from}\nExpected: ${config.curveSenderEmail}`,
      );
      return { status: 'ok' };
    }

    // Parse email HTML → CurveTransactionInput
    let transaction;
    try {
      transaction = parseCurveEmail(parsedEmail.html);
    } catch (err) {
      const message = (err as CurveEmailParseError).message;
      await telegram.error(
        `Failed to parse Curve email\nSubject: ${parsedEmail.subject}\nReason: ${message}\n\n${new Date().toISOString()}`,
      );
      return { status: 'ok' };
    }

    // Create transaction in ZenMoney
    const zenConfig: ScriptExecutionConfig = {
      accessToken: config.zenmoney.accessToken,
      defaultAccountId: config.zenmoney.defaultAccountId,
      defaultCurrencyId: 3,
      autoCreateMerchants: true,
      retryAttempts: 3,
    };

    const result = await createZenMoneyTransaction(transaction, zenConfig);

    if (!result.success) {
      await telegram.error(
        `Transaction creation failed\nMerchant: ${transaction.merchant}\nAmount: ${transaction.amount} ${transaction.currency}\nReason: ${result.error?.message ?? 'unknown'}\n\n${new Date().toISOString()}`,
      );
    }

    return { status: 'ok' };
  });

  return fastify;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/server.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Create `src/index.ts`**

```typescript
import { loadConfig } from './config';
import { buildApp } from './server';

const config = loadConfig();
const app = buildApp(config);

app.listen({ port: config.port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`curve-zenmoney-sync listening on port ${config.port}`);
});
```

- [ ] **Step 6: Verify full test suite passes**

```bash
npm test
```

Expected: all tests PASS across all files.

- [ ] **Step 7: Commit**

```bash
git add src/server.ts src/server.test.ts src/index.ts
git commit -m "feat: Fastify server with /webhook and /health routes"
```

---

## Task 8: Docker and Environment Setup

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  curve-zenmoney-sync:
    build: .
    restart: unless-stopped
    env_file: .env
    ports:
      - "${PORT:-3000}:3000"
```

- [ ] **Step 3: Create `.env.example`**

```bash
# HTTP server port (default: 3000)
PORT=3000

# ZenMoney OAuth2 access token
# Obtain from: https://zerro.app/ or ZenMoney developer settings
ZENMONEY_ACCESS_TOKEN=

# UUID of the default ZenMoney account to use when card sync ID doesn't match
ZENMONEY_DEFAULT_ACCOUNT_ID=

# Cloudmailin webhook token — add as query param in your Cloudmailin target URL:
# https://yourhost.com/webhook?token=YOUR_SECRET
# Keep this value private; it is the only authentication for the webhook endpoint.
CLOUDMAILIN_CREDENTIALS=

# Telegram bot token (from @BotFather)
TELEGRAM_BOT_TOKEN=

# Telegram chat ID to send notifications to
# Get your chat ID by messaging @userinfobot
TELEGRAM_CHAT_ID=

# Expected sender email for Curve receipts (default: support@imaginecurve.com)
# CURVE_SENDER_EMAIL=support@imaginecurve.com
```

- [ ] **Step 4: Verify Docker build**

```bash
docker build -t curve-zenmoney-sync .
```

Expected: build completes successfully, no errors.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .env.example
git commit -m "chore: Docker setup and environment variable documentation"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Fastify HTTP server | Task 7 |
| `POST /webhook` route | Task 7 |
| `GET /health` route | Task 7 |
| Token validation (query param) | Task 7 |
| `EmailProvider` interface + `ParsedEmail` type | Task 5 |
| `CloudmailinAdapter` | Task 5 |
| Sender email validation | Task 7 |
| `CurveEmailParser` — all fields | Task 6 |
| `parseCurveEmail` defaults originalAmount/Currency | Task 6 |
| `src/zenmoney/index.ts` (moved handler.ts) | Task 2 |
| `TelegramNotifier` warn/error | Task 4 |
| ⚠️ warn: unexpected sender | Task 7 |
| 🚨 error: parse failure | Task 7 |
| 🚨 error: ZenMoney failure | Task 7 |
| 🚨 error: startup config invalid | Task 3 (throws on bad config) |
| Always return HTTP 200 to Cloudmailin (post-auth) | Task 7 |
| Config from env vars, validated at startup | Task 3 |
| Docker deployment | Task 8 |
| `.env.example` | Task 8 |

**Placeholder scan:** None found. All steps contain complete code.

**Type consistency check:**
- `Config` defined in `config.ts`, used in `server.ts` ✓
- `TelegramConfig` defined in `config.ts`, used in `TelegramNotifier` constructor ✓
- `ParsedEmail` defined in `email/providers/types.ts`, returned by `CloudmailinAdapter`, consumed in `server.ts` ✓
- `CurveTransactionInput` defined in `zenmoney/index.ts`, returned by `parseCurveEmail`, passed to `createZenMoneyTransaction` ✓
- `ScriptExecutionConfig` defined in `zenmoney/index.ts`, constructed in `server.ts` ✓
- `CurveEmailParseError` exported from `curve.ts`, caught in `server.ts` ✓
