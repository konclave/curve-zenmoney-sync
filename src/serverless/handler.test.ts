import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('./config', () => ({
  loadServerlessConfig: vi.fn().mockReturnValue({
    zenmoney: { accessToken: 'zen-token', defaultAccountId: 'acc-id' },
    telegram: { botToken: 'bot-token', chatId: '123' },
    curveSenderEmail: 'support@imaginecurve.com',
  }),
}));

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

import { handler } from './handler';
import { createZenMoneyTransaction } from '../zenmoney/index';
import { TelegramNotifier } from '../notifications/telegram';

const curveHtml = readFileSync(
  join(__dirname, '../email/parser/fixtures/curve-receipt.html'),
  'utf-8',
);

const validEvent = {
  messages: [{
    received_at: '2026-04-23T10:02:18Z',
    headers: [
      { name: 'From', value: 'support@imaginecurve.com' },
      { name: 'Subject', value: 'Curve Receipt: Purchase at Starbucks on 23 April 2026 for €8.09' },
    ],
    message: curveHtml,
  }],
};

describe('handler', () => {
  // TelegramNotifier is instantiated once at module cold-start; capture before any clearAllMocks
  const telegramInstance = vi.mocked(TelegramNotifier).mock.results[0]
    .value as { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createZenMoneyTransaction for a valid event', async () => {
    await handler(validEvent);
    expect(createZenMoneyTransaction).toHaveBeenCalledOnce();
    expect(telegramInstance.error).not.toHaveBeenCalled();
    expect(telegramInstance.warn).not.toHaveBeenCalled();
  });

  it('calls telegram.warn for email from unexpected sender', async () => {
    const event = {
      messages: [{
        ...validEvent.messages[0],
        headers: [
          { name: 'From', value: 'spam@example.com' },
          { name: 'Subject', value: 'Some email' },
        ],
      }],
    };
    await handler(event);
    expect(telegramInstance.warn).toHaveBeenCalledWith(
      expect.stringContaining('spam@example.com'),
    );
    expect(createZenMoneyTransaction).not.toHaveBeenCalled();
  });

  it('calls telegram.error when event parsing fails', async () => {
    await handler(null);
    expect(telegramInstance.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse webhook payload'),
    );
    expect(createZenMoneyTransaction).not.toHaveBeenCalled();
  });

  it('calls telegram.error when Curve email parse fails', async () => {
    const event = {
      messages: [{
        ...validEvent.messages[0],
        message: '<html><body>no receipt here</body></html>',
      }],
    };
    await handler(event);
    expect(telegramInstance.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse Curve email'),
    );
    expect(createZenMoneyTransaction).not.toHaveBeenCalled();
  });

  it('calls telegram.error when ZenMoney returns success: false', async () => {
    vi.mocked(createZenMoneyTransaction).mockResolvedValueOnce({
      success: false,
      message: 'ZenMoney API error',
      error: { type: 'ZenMoneyApiError', message: 'quota exceeded' },
    });

    await handler(validEvent);
    expect(telegramInstance.error).toHaveBeenCalledWith(
      expect.stringContaining('quota exceeded'),
    );
  });
});
