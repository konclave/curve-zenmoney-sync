import Fastify from "fastify";
import type { Config } from "../config";
import { CloudmailinAdapter } from "../email/providers/cloudmailin";
import { TelegramNotifier } from "../notifications/telegram";
import { logger as appLogger, type AppLogger } from "../logging/logger";
import { processEmail } from "../processor";

export function buildApp(config: Config, logger: AppLogger = appLogger) {
  const fastify = Fastify({ loggerInstance: logger });
  const emailAdapter = new CloudmailinAdapter();
  const webhookLogger = logger.child({ source: "server" });
  const telegram = new TelegramNotifier(config.telegram, webhookLogger);

  fastify.setNotFoundHandler((_request, reply) => {
    reply.hijack();
    reply.raw.destroy();
  });

  fastify.get("/health", async () => ({ status: "ok" }));

  fastify.post("/webhook", async (request, reply) => {
    webhookLogger.info({ event: "webhook.received" }, "Webhook received");

    const base64Credentials = request.headers.authorization?.split(" ").at(1);
    const credentials = base64Credentials
      ? Buffer.from(base64Credentials, "base64").toString()
      : undefined;

    if (!credentials || credentials !== config.cloudmailinToken) {
      webhookLogger.warn({ event: "webhook.unauthorized" }, "Unauthorized webhook request");
      return reply.code(401).send({ error: "Unauthorized" });
    }

    let parsedEmail;
    try {
      parsedEmail = emailAdapter.parseWebhookPayload(request.body);
    } catch (err) {
      const message = (err as Error).message;
      webhookLogger.error(
        { event: "webhook.payload_parse_failed", err, reason: message },
        "Failed to parse webhook payload",
      );
      await telegram.error(
        `Failed to parse webhook payload\nReason: ${message}\n\n${new Date().toISOString()}`,
        { reason: message },
      );
      return { status: "ok" };
    }

    webhookLogger.info(
      {
        event: "webhook.payload_parsed",
        sender: parsedEmail.from,
        subject: parsedEmail.subject,
      },
      "Webhook payload parsed",
    );

    await processEmail({
      parsedEmail,
      config,
      telegram,
      logger: webhookLogger,
    });
    return { status: "ok" };
  });

  return fastify;
}
