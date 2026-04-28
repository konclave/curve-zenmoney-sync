import Fastify from 'fastify';
import type { Config } from '../config';
import { CloudmailinAdapter } from '../email/providers/cloudmailin';
import { parseCurveEmail, CurveEmailParseError } from '../email/parser/curve';
import { createZenMoneyTransaction } from '../zenmoney/index';
import type { ScriptExecutionConfig } from '../zenmoney/index';
import { TelegramNotifier } from '../notifications/telegram';
import { logger as appLogger, type AppLogger } from '../logging/logger';

export function buildApp(config: Config, logger: AppLogger = appLogger) {
  const fastify = Fastify({ loggerInstance: logger });
  const emailAdapter = new CloudmailinAdapter();
  const webhookLogger = logger.child({ source: 'server' });
  const telegram = new TelegramNotifier(config.telegram, webhookLogger);

  fastify.get('/health', async () => ({ status: 'ok' }));

  fastify.post<{ Querystring: { token?: string } }>('/webhook', {
    schema: {
      querystring: {
        type: 'object',
        properties: { token: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    webhookLogger.info({ event: 'webhook.received' }, 'Webhook received');

    const { token } = request.query;
    if (!token || token !== config.cloudmailinToken) {
      webhookLogger.warn({ event: 'webhook.unauthorized' }, 'Unauthorized webhook request');
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    let parsedEmail;
    try {
      parsedEmail = emailAdapter.parseWebhookPayload(request.body);
    } catch (err) {
      const message = (err as Error).message;
      webhookLogger.error(
        { event: 'webhook.payload_parse_failed', err, reason: message },
        'Failed to parse webhook payload',
      );
      await telegram.error(
        `Failed to parse webhook payload\nReason: ${message}\n\n${new Date().toISOString()}`,
        { reason: message },
      );
      return { status: 'ok' };
    }

    webhookLogger.info(
      {
        event: 'webhook.payload_parsed',
        sender: parsedEmail.from,
        subject: parsedEmail.subject,
      },
      'Webhook payload parsed',
    );

    if (parsedEmail.from !== config.curveSenderEmail) {
      webhookLogger.warn(
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
      return { status: 'ok' };
    }

    let transaction;
    try {
      transaction = parseCurveEmail(parsedEmail.html);
    } catch (err) {
      const message = (err as CurveEmailParseError).message;
      const htmlSnippet = parsedEmail.html.slice(0, 1500);
      webhookLogger.error(
        {
          event: 'curve.email_parse_failed',
          err,
          subject: parsedEmail.subject,
          reason: message,
          htmlSnippet,
        },
        'Failed to parse Curve email',
      );
      await telegram.error(
        `Failed to parse Curve email\nSubject: ${parsedEmail.subject}\nReason: ${message}\n\nHTML snippet:\n${htmlSnippet}\n\n${new Date().toISOString()}`,
        { subject: parsedEmail.subject, reason: message },
      );
      return { status: 'ok' };
    }

    webhookLogger.info(
      {
        event: 'curve.email_parsed',
        subject: parsedEmail.subject,
        merchant: transaction.merchant,
        amount: transaction.amount,
        currency: transaction.currency,
      },
      'Curve email parsed',
    );

    const zenConfig: ScriptExecutionConfig = {
      accessToken: config.zenmoney.accessToken,
      defaultAccountId: config.zenmoney.defaultAccountId,
      defaultCurrencyId: 3,
      autoCreateMerchants: true,
      retryAttempts: 3,
    };

    const result = await createZenMoneyTransaction(transaction, zenConfig);

    if (!result.success) {
      webhookLogger.error(
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
      return { status: 'ok' };
    }

    webhookLogger.info(
      {
        event: 'transaction.created',
        merchant: transaction.merchant,
        amount: transaction.amount,
        currency: transaction.currency,
        transactionId: result.transactionId,
      },
      'Transaction created in ZenMoney',
    );

    return { status: 'ok' };
  });

  return fastify;
}
