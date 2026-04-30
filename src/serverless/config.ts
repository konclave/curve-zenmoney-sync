export interface ServerlessConfig {
  zenmoney: { accessToken: string; defaultAccountId: string };
  telegram: { botToken: string; chatId: string };
  curveSenderEmails: string[];
}

export function loadServerlessConfig(): ServerlessConfig {
  const required = [
    "ZENMONEY_ACCESS_TOKEN",
    "ZENMONEY_DEFAULT_ACCOUNT_ID",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    zenmoney: {
      accessToken: process.env.ZENMONEY_ACCESS_TOKEN!,
      defaultAccountId: process.env.ZENMONEY_DEFAULT_ACCOUNT_ID!,
    },
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      chatId: process.env.TELEGRAM_CHAT_ID!,
    },
    curveSenderEmails: (process.env.CURVE_SENDER_EMAIL ?? "support@imaginecurve.com")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
  };
}
