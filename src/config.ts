export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface ZenMoneyServiceConfig {
  accessToken: string;
  defaultAccountId: string;
}

export interface Config {
  port: number;
  zenmoney: ZenMoneyServiceConfig;
  cloudmailinToken: string;
  telegram: TelegramConfig;
  curveSenderEmail: string;
}

export function loadConfig(): Config {
  const required = [
    'ZENMONEY_ACCESS_TOKEN',
    'ZENMONEY_DEFAULT_ACCOUNT_ID',
    'CLOUDMAILIN_TOKEN',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    zenmoney: {
      accessToken: process.env.ZENMONEY_ACCESS_TOKEN!,
      defaultAccountId: process.env.ZENMONEY_DEFAULT_ACCOUNT_ID!,
    },
    cloudmailinToken: process.env.CLOUDMAILIN_TOKEN!,
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      chatId: process.env.TELEGRAM_CHAT_ID!,
    },
    curveSenderEmail: process.env.CURVE_SENDER_EMAIL ?? 'support@imaginecurve.com',
  };
}
