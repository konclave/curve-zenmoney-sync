import { parseEmailTriggerEvent } from './event';
import { loadServerlessConfig } from './config';
import { parseCurveEmail, CurveEmailParseError } from '../email/parser/curve';
import { createZenMoneyTransaction } from '../zenmoney/index';
import type { ScriptExecutionConfig } from '../zenmoney/index';
import { TelegramNotifier } from '../notifications/telegram';

// Initialise at cold-start (module level), not per-invocation
const config = loadServerlessConfig();
const telegram = new TelegramNotifier(config.telegram);
const zenConfig: ScriptExecutionConfig = {
  accessToken: config.zenmoney.accessToken,
  defaultAccountId: config.zenmoney.defaultAccountId,
  defaultCurrencyId: 3,
  autoCreateMerchants: true,
  retryAttempts: 3,
};

export const handler = async (event: unknown): Promise<void> => {
  // Step 1: Parse YC email trigger event → ParsedEmail
  let parsedEmail;
  try {
    parsedEmail = parseEmailTriggerEvent(event);
  } catch (err) {
    const message = (err as Error).message;
    await telegram.error(`Failed to parse webhook payload\nReason: ${message}\n\n${new Date().toISOString()}`);
    return;
  }

  // Step 2: Validate sender
  if (parsedEmail.from !== config.curveSenderEmail) {
    await telegram.warn(
      `Email from unexpected sender: ${parsedEmail.from}\nExpected: ${config.curveSenderEmail}`,
    );
    return;
  }

  // Step 3: Parse Curve HTML → CurveTransactionInput
  let transaction;
  try {
    transaction = parseCurveEmail(parsedEmail.html);
  } catch (err) {
    const message = (err as CurveEmailParseError).message;
    await telegram.error(
      `Failed to parse Curve email\nSubject: ${parsedEmail.subject}\nReason: ${message}\n\n${new Date().toISOString()}`,
    );
    return;
  }

  // Step 4: createZenMoneyTransaction
  const result = await createZenMoneyTransaction(transaction, zenConfig);

  if (!result.success) {
    await telegram.error(
      `Transaction creation failed\nMerchant: ${transaction.merchant}\nAmount: ${transaction.amount} ${transaction.currency}\nReason: ${result.error?.message ?? 'unknown'}\n\n${new Date().toISOString()}`,
    );
  }
};
