import type { ParsedEmail } from "./email/providers/types";
import type { ZenMoneyServiceConfig } from "./config";
import type { AppLogger } from "./logging/logger";
import { parseCurveEmail, CurveEmailParseError } from "./email/parser/curve";
import { createZenMoneyTransaction } from "./zenmoney/index";
import type { TelegramNotifier } from "./notifications/telegram";

export async function processEmail({
  parsedEmail,
  config,
  telegram,
  logger,
}: {
  parsedEmail: ParsedEmail;
  config: { curveSenderEmails: string[]; zenmoney: ZenMoneyServiceConfig };
  telegram: TelegramNotifier;
  logger: AppLogger;
}): Promise<void> {
  if (
    Boolean(config.curveSenderEmails) &&
    Array.isArray(config.curveSenderEmails) &&
    config.curveSenderEmails.length > 0 &&
    !config.curveSenderEmails.includes(parsedEmail.from)
  ) {
    logger.warn(
      {
        event: "email.sender_unexpected",
        sender: parsedEmail.from,
        expectedSenders: config.curveSenderEmails,
        subject: parsedEmail.subject,
      },
      "Email from unexpected sender",
    );
    await telegram.warn(
      `Email from unexpected sender: ${parsedEmail.from}\nExpected: ${config.curveSenderEmails.join(", ")}`,
      {
        sender: parsedEmail.from,
        expectedSenders: config.curveSenderEmails,
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
    const htmlSnippet = parsedEmail.html.slice(0, 1500);
    logger.error(
      {
        event: "curve.email_parse_failed",
        err,
        subject: parsedEmail.subject,
        reason: message,
        htmlSnippet,
      },
      "Failed to parse Curve email",
    );
    await telegram.error(
      `Failed to parse Curve email\nSubject: ${parsedEmail.subject}\nReason: ${message}\n\nHTML snippet:\n${htmlSnippet}\n\n${new Date().toISOString()}`,
      { subject: parsedEmail.subject, reason: message },
    );
    return;
  }

  logger.info(
    {
      event: "curve.email_parsed",
      subject: parsedEmail.subject,
      merchant: transaction.merchant,
      amount: transaction.amount,
      currency: transaction.currency,
    },
    "Curve email parsed",
  );

  const result = await createZenMoneyTransaction(transaction, {
    accessToken: config.zenmoney.accessToken,
    defaultAccountId: config.zenmoney.defaultAccountId,
    defaultCurrencyId: 3,
    autoCreateMerchants: true,
    retryAttempts: 3,
  });

  if (!result.success) {
    logger.error(
      {
        event: "transaction.create_failed",
        merchant: transaction.merchant,
        amount: transaction.amount,
        currency: transaction.currency,
        reason: result.error?.message ?? "unknown",
      },
      "Transaction creation failed",
    );
    await telegram.error(
      `Transaction creation failed\nMerchant: ${transaction.merchant}\nAmount: ${transaction.amount} ${transaction.currency}\nReason: ${result.error?.message ?? "unknown"}\n\n${new Date().toISOString()}`,
      {
        merchant: transaction.merchant,
        amount: transaction.amount,
        currency: transaction.currency,
        reason: result.error?.message ?? "unknown",
      },
    );
    return;
  }

  logger.info(
    {
      event: "transaction.created",
      merchant: transaction.merchant,
      amount: transaction.amount,
      currency: transaction.currency,
      transactionId: result.transactionId,
    },
    "Transaction created in ZenMoney",
  );
}
