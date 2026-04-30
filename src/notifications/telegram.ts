import type { TelegramConfig } from "../config";
import { logger as appLogger, type AppLogger } from "../logging/logger";

type NotificationContext = Record<string, unknown>;

export class TelegramNotifier {
  private readonly apiUrl: string;
  private readonly chatId: string;
  private readonly logger: Pick<AppLogger, "warn" | "error">;

  constructor(config: TelegramConfig, logger: Pick<AppLogger, "warn" | "error"> = appLogger) {
    this.apiUrl = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    this.chatId = config.chatId;
    this.logger = logger;
  }

  async warn(message: string, context: NotificationContext = {}): Promise<void> {
    this.logger.warn(
      { event: "notification.telegram.warn", telegram_notification: true, ...context },
      message,
    );
    await this.send(`⚠️ curve-zenmoney-sync\n\n${message}`);
  }

  async error(message: string, context: NotificationContext = {}): Promise<void> {
    this.logger.error(
      { event: "notification.telegram.error", telegram_notification: true, ...context },
      message,
    );
    await this.send(`🚨 curve-zenmoney-sync\n\n${message}`);
  }

  private async send(text: string): Promise<void> {
    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: this.chatId, text }),
      });
      if (!response.ok) {
        this.logger.error(
          {
            event: "notification.telegram.delivery_failed",
            telegram_notification: true,
            status: response.status,
            statusText: response.statusText,
          },
          "Failed to send Telegram notification",
        );
      }
    } catch (err) {
      this.logger.error(
        {
          event: "notification.telegram.delivery_failed",
          telegram_notification: true,
          err,
        },
        "Failed to send Telegram notification",
      );
    }
  }
}
