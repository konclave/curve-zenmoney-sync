import Fastify from 'fastify';
import type { Config } from '../config';
import { CloudmailinAdapter } from '../email/providers/cloudmailin';
import { parseCurveEmail, CurveEmailParseError } from '../email/parser/curve';
import { createZenMoneyTransaction } from '../zenmoney/index';
import type { ScriptExecutionConfig } from '../zenmoney/index';
import { TelegramNotifier } from '../notifications/telegram';

export function buildApp(config: Config) {
  const fastify = Fastify({ logger: true });
  const emailAdapter = new CloudmailinAdapter();
  const telegram = new TelegramNotifier(config.telegram);

  fastify.get('/health', async () => ({ status: 'ok' }));

  fastify.post<{ Querystring: { token?: string } }>('/webhook', {
    schema: {
      querystring: {
        type: 'object',
        properties: { token: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { token } = request.query;
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
