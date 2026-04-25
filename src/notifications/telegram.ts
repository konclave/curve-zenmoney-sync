import type { TelegramConfig } from '../config';

export class TelegramNotifier {
  private readonly apiUrl: string;
  private readonly chatId: string;

  constructor(config: TelegramConfig) {
    this.apiUrl = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    this.chatId = config.chatId;
  }

  async warn(message: string): Promise<void> {
    await this.send(`⚠️ curve-zenmoney-sync\n\n${message}`);
  }

  async error(message: string): Promise<void> {
    await this.send(`🚨 curve-zenmoney-sync\n\n${message}`);
  }

  private async send(text: string): Promise<void> {
    try {
      await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text }),
      });
    } catch (err) {
      console.error('Failed to send Telegram notification:', err);
    }
  }
}
