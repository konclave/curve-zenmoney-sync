import Fastify from 'fastify';
import type { Config } from '../config';
import { CloudmailinAdapter } from '../email/providers/cloudmailin';
import { TelegramNotifier } from '../notifications/telegram';
import { logger as appLogger, type AppLogger } from '../logging/logger';
import { processEmail } from '../processor';

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
      { event: 'webhook.payload_parsed', sender: parsedEmail.from, subject: parsedEmail.subject },
      'Webhook payload parsed',
    );

    await processEmail({ parsedEmail, config, telegram, logger: webhookLogger });
    return { status: 'ok' };
  });

  return fastify;
}
