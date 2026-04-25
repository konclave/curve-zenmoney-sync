// src/server/app.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildApp } from './app';
import { createZenMoneyTransaction } from '../zenmoney/index';
import { TelegramNotifier } from '../notifications/telegram';

vi.mock('../zenmoney/index', () => ({
  createZenMoneyTransaction: vi.fn().mockResolvedValue({
    success: true,
    transactionId: 'tx-123',
    message: 'Transaction created successfully in ZenMoney',
    details: { warnings: [] },
  }),
  getCurrencyCode: (symbol: string) => ({ '€': 'EUR', '$': 'USD' }[symbol] ?? symbol),
}));

vi.mock('../notifications/telegram', () => ({
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
  join(__dirname, '../email/parser/fixtures/curve-receipt.html'),
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
  let telegramInstance: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp(config);
    telegramInstance = vi.mocked(TelegramNotifier).mock.results[0].value;
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

  it('sends Telegram error and returns 200 when ZenMoney creation fails', async () => {
    vi.mocked(createZenMoneyTransaction).mockResolvedValueOnce({
      success: false,
      message: 'ZenMoney API error',
      error: { type: 'ZenMoneyApiError', message: 'quota exceeded' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/webhook?token=test-token',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(telegramInstance.error).toHaveBeenCalledWith(
      expect.stringContaining('quota exceeded'),
    );
  });
});
