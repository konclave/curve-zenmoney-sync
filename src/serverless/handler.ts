import { parseEmailTriggerEvent } from './event';
import { loadServerlessConfig } from './config';
import { parseCurveEmail, CurveEmailParseError } from '../email/parser/curve';
import { createZenMoneyTransaction } from '../zenmoney/index';
import type { ScriptExecutionConfig } from '../zenmoney/index';
import { TelegramNotifier } from '../notifications/telegram';
import { logger as appLogger, type AppLogger } from '../logging/logger';

export function createHandler(
  config = loadServerlessConfig(),
  logger: AppLogger = appLogger,
) {
  const handlerLogger = logger.child({ source: 'serverless' });
  const telegram = new TelegramNotifier(config.telegram, handlerLogger);
  const zenConfig: ScriptExecutionConfig = {
    accessToken: config.zenmoney.accessToken,
    defaultAccountId: config.zenmoney.defaultAccountId,
    defaultCurrencyId: 3,
    autoCreateMerchants: true,
    retryAttempts: 3,
  };

  return async (event: unknown): Promise<void> => {
    handlerLogger.info({ event: 'webhook.received' }, 'Webhook received');

    let parsedEmail;
    try {
      parsedEmail = parseEmailTriggerEvent(event);
    } catch (err) {
      const message = (err as Error).message;
      handlerLogger.error(
        { event: 'webhook.payload_parse_failed', err, reason: message },
        'Failed to parse webhook payload',
      );
      await telegram.error(
        `Failed to parse webhook payload\nReason: ${message}\n\n${new Date().toISOString()}`,
        { reason: message },
      );
      return;
    }

    handlerLogger.info(
      {
        event: 'webhook.payload_parsed',
        sender: parsedEmail.from,
        subject: parsedEmail.subject,
      },
      'Webhook payload parsed',
    );

    if (parsedEmail.from !== config.curveSenderEmail) {
      handlerLogger.warn(
        {
          event: 'email.sender_unexpected',
          sender: parsedEmail.from,
          expectedSender: config.curveSenderEmail,
          subject: parsedEmail.subject,
        },
        'Email from unexpected sender',
      );
      await telegram.warn(
        `Email from unexpected sender: ${parsedEmail.from}\nExpected: ${config.curveSenderEmail}`,
        {
          sender: parsedEmail.from,
          expectedSender: config.curveSenderEmail,
          subject: parsedEmail.subject,
        },
      );
      return;
    }

    let transaction;
    try {
      transaction = parseCurveEmail(parsedEmail.html);
    } catch (err) {
      const message = (err as CurveEmailParseError).message;
      handlerLogger.error(
        {
          event: 'curve.email_parse_failed',
          err,
          subject: parsedEmail.subject,
          reason: message,
        },
        'Failed to parse Curve email',
      );
      await telegram.error(
        `Failed to parse Curve email\nSubject: ${parsedEmail.subject}\nReason: ${message}\n\n${new Date().toISOString()}`,
        { subject: parsedEmail.subject, reason: message },
      );
      return;
    }

    handlerLogger.info(
      {
        event: 'curve.email_parsed',
        subject: parsedEmail.subject,
        merchant: transaction.merchant,
        amount: transaction.amount,
        currency: transaction.currency,
      },
      'Curve email parsed',
    );

    const result = await createZenMoneyTransaction(transaction, zenConfig);

    if (!result.success) {
      handlerLogger.error(
        {
          event: 'transaction.create_failed',
          merchant: transaction.merchant,
          amount: transaction.amount,
          currency: transaction.currency,
          reason: result.error?.message ?? 'unknown',
        },
        'Transaction creation failed',
      );
      await telegram.error(
        `Transaction creation failed\nMerchant: ${transaction.merchant}\nAmount: ${transaction.amount} ${transaction.currency}\nReason: ${result.error?.message ?? 'unknown'}\n\n${new Date().toISOString()}`,
        {
          merchant: transaction.merchant,
          amount: transaction.amount,
          currency: transaction.currency,
          reason: result.error?.message ?? 'unknown',
        },
      );
      return;
    }

    handlerLogger.info(
      {
        event: 'transaction.created',
        merchant: transaction.merchant,
        amount: transaction.amount,
        currency: transaction.currency,
        transactionId: result.transactionId,
      },
      'Transaction created in ZenMoney',
    );
  };
}

export const handler = createHandler();
