import { parse } from 'node-html-parser';
import { getCurrencyCode } from '../../zenmoney/index';
import type { CurveTransactionInput } from '../../zenmoney/index';

export class CurveEmailParseError extends Error {
  constructor(
    message: string,
    public readonly field: string,
  ) {
    super(message);
    this.name = 'CurveEmailParseError';
  }
}

export function parseCurveEmail(html: string): CurveTransactionInput {
  const root = parse(html);

  // Merchant: first bold td aligned left.
  // Matches both direct emails (class="u-bold") and forwarded emails where
  // the mail client prepends a namespace prefix (e.g. class="qt-u-bold").
  const boldTds = root.querySelectorAll('td[class*="u-bold"]');
  const merchantTd = boldTds.find(td => td.getAttribute('align') === 'left');
  if (!merchantTd) {
    throw new CurveEmailParseError('Could not find merchant element in email HTML', 'merchant');
  }
  const merchant = merchantTd.text.trim();
  if (!merchant) {
    throw new CurveEmailParseError('Merchant element is empty', 'merchant');
  }

  // Amount + currency: first bold td aligned right
  const amountTd = boldTds.find(td => td.getAttribute('align') === 'right');
  if (!amountTd) {
    throw new CurveEmailParseError('Could not find amount element in email HTML', 'amount');
  }
  const amountText = amountTd.text.trim();
  const amountMatch = amountText.match(/^([^\d]+)([\d,.]+)$/);
  if (!amountMatch) {
    throw new CurveEmailParseError(`Could not parse amount from: "${amountText}"`, 'amount');
  }
  const currencySymbol = amountMatch[1].trim();
  const amount = parseFloat(amountMatch[2].replace(',', ''));
  const currency = getCurrencyCode(currencySymbol);
  if (currency === 'EUR' && currencySymbol !== '€') {
    throw new CurveEmailParseError(
      `Unrecognised currency symbol: "${currencySymbol}"`,
      'currency',
    );
  }

  // Date: first non-empty grey smaller td with half top padding
  const dateTds = root.querySelectorAll('td[class*="greySmaller"][class*="padding__top--half"]');
  const dateTd = dateTds.find(td => td.text.trim().length > 0);
  if (!dateTd) {
    throw new CurveEmailParseError('Could not find date element in email HTML', 'date');
  }
  const dateText = dateTd.text.trim();
  const parsedDate = new Date(dateText);
  if (isNaN(parsedDate.getTime())) {
    throw new CurveEmailParseError(`Could not parse date from: "${dateText}"`, 'date');
  }
  const date = parsedDate.toISOString();

  // Card info: centered td containing XXXX-NNNN
  const centerTds = root.querySelectorAll('td[align="center"]');
  const cardTd = centerTds.find(td => /XXXX-\d{4}/.test(td.text));
  if (!cardTd) {
    throw new CurveEmailParseError('Could not find card info section in email HTML', 'syncID');
  }

  const cardLines = cardTd.innerHTML
    .split(/<br\s*\/?>/i)
    .map(fragment => parse(fragment).text.trim())
    .filter(Boolean);

  const cardDigitsIndex = cardLines.findIndex(line => /XXXX-\d{4}/.test(line));
  if (cardDigitsIndex < 0) {
    throw new CurveEmailParseError('Could not find XXXX-NNNN pattern in card section', 'syncID');
  }

  const syncIDMatch = cardLines[cardDigitsIndex].match(/XXXX-(\d{4})/);
  if (!syncIDMatch) {
    throw new CurveEmailParseError('Could not extract last 4 digits from card line', 'syncID');
  }
  const syncID = syncIDMatch[1];

  if (cardDigitsIndex === 0) {
    throw new CurveEmailParseError('Could not find account name (expected line before card digits)', 'account');
  }
  const account = cardLines[cardDigitsIndex - 1];

  return {
    syncID,
    account,
    amount,
    currency,
    date,
    merchant,
    originalAmount: amount,
    originalCurrency: currency,
  };
}
