import { parseEmailTriggerEvent } from "./event";
import { loadServerlessConfig } from "./config";
import { TelegramNotifier } from "../notifications/telegram";
import { logger as appLogger, type AppLogger } from "../logging/logger";
import { processEmail } from "../processor";

export function createHandler(config = loadServerlessConfig(), logger: AppLogger = appLogger) {
  const handlerLogger = logger.child({ source: "serverless" });
  const telegram = new TelegramNotifier(config.telegram, handlerLogger);

  return async (event: unknown): Promise<void> => {
    handlerLogger.info({ event: "webhook.received" }, "Webhook received");

    let parsedEmail;
    try {
      parsedEmail = parseEmailTriggerEvent(event);
    } catch (err) {
      const message = (err as Error).message;
      handlerLogger.error(
        { event: "webhook.payload_parse_failed", err, reason: message },
        "Failed to parse webhook payload",
      );
      await telegram.error(
        `Failed to parse webhook payload\nReason: ${message}\n\n${new Date().toISOString()}`,
        { reason: message },
      );
      return;
    }

    handlerLogger.info(
      { event: "webhook.payload_parsed", sender: parsedEmail.from, subject: parsedEmail.subject },
      "Webhook payload parsed",
    );

    await processEmail({ parsedEmail, config, telegram, logger: handlerLogger });
  };
}

export const handler = createHandler();
