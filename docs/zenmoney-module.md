# ZenMoney Module

**Source:** `src/zenmoney/index.ts`  
**Entry point:** `createZenMoneyTransaction(curveTransaction, config)`

This module owns the entire ZenMoney integration: input validation, account/merchant/currency resolution, transaction mapping, and API communication. It was originally `handler.ts` at the project root, consolidated into a single file to avoid module splitting in the Windmill.dev environment.

---

## Entry Point

```typescript
createZenMoneyTransaction(
  curveTransaction: CurveTransactionInput,
  config: ScriptExecutionConfig
): Promise<TransactionCreationResult>
```

Returns a `TransactionCreationResult` — it never throws. All errors are caught internally and returned as a structured result with `success: false`.

---

## Execution Steps

The function runs the following steps in order:

1. **Validate** the `CurveTransactionInput`
2. **Short-circuit** if `validateOnly: true` (dry validation, no API calls)
3. **Check config** — access token and default account ID must be present
4. **Connect** to ZenMoney API (health check via `initLoad()`)
5. **Load instruments and accounts** from ZenMoney
6. **Resolve merchant** via suggestion API or local find/create
7. **Convert currency** if transaction and original currencies differ
8. **Map** the Curve transaction to a `ZenMoneyTransaction`
9. **Short-circuit** if `dryRun: true` (returns mapped transaction without posting)
10. **Create** the transaction via the ZenMoney diff API

---

## Input: CurveTransactionInput

All fields are required unless noted.

| Field | Type | Description |
|---|---|---|
| `syncID` | `string` | Last 4 digits of the Curve card used. Used to match the ZenMoney account. |
| `account` | `string` | Card label as shown in Curve (e.g. "Trading 212"). Fallback for account matching. |
| `amount` | `number` | Transaction amount in the billing currency (the currency Curve charged). |
| `currency` | `string` | 3-letter ISO code of the billing currency (e.g. `"EUR"`). |
| `date` | `string` | Transaction date/time in any format parseable by `new Date()`. |
| `merchant` | `string` | Merchant name as shown in the Curve receipt. |
| `originalAmount` | `number` | Amount in the merchant's local currency. Equal to `amount` if no FX conversion. |
| `originalCurrency` | `string` | 3-letter ISO code of the merchant's local currency. |

---

## Validation

`TransactionValidator.validateTransaction()` runs before any API calls. It returns `{ isValid, errors, warnings }`.

**Hard errors (block transaction creation):**

| Rule | Field(s) |
|---|---|
| Required fields must be present and non-empty | All fields |
| `amount` and `originalAmount` must be valid non-NaN numbers | `amount`, `originalAmount` |
| `amount` and `originalAmount` cannot be zero | `amount`, `originalAmount` |
| Currency must match `^[A-Z]{3}$` | `currency`, `originalCurrency` |
| Merchant name must be 2–100 characters | `merchant` |
| Date must be parseable by `new Date()` | `date` |

**Warnings (logged, do not block):**

| Condition | Warning |
|---|---|
| `amount` or `originalAmount` > 1,000,000 | Unusually large amount |
| `amount` < 0.01 | Unusually small amount |
| Same currency but `amount ≠ originalAmount` | Amounts differ despite same currency |
| Exchange rate implied by amounts is > 1000× or < 0.001× | Unrealistic exchange rate |
| Currency not in common list (USD/EUR/GBP/RUB/JPY/CAD/AUD/CHF/CNY) | Uncommon currency |
| Transaction date is in the future | Future date |
| Transaction date is more than 1 year old | Old date |
| Transaction date falls on a weekend | Weekend date |
| Account ID is not UUID or alphanumeric ≥ 8 chars | Possibly invalid account ID format |
| Merchant name is all digits | Possible data quality issue |

---

## Account Resolution

The module resolves the target ZenMoney account in this priority order:

1. Account whose `syncID[]` array contains `curveTransaction.syncID` (card last-4 match)
2. Account whose `title` matches `curveTransaction.account` (exact, trimmed)
3. Account whose `id` matches `config.defaultAccountId` (fallback)

If none match, the transaction fails with a `ConfigurationError`.

---

## Merchant Resolution

Merchant handling follows this flow:

1. **Suggestion API** — calls `GET /v8/suggest/` with the merchant name. If the API returns a merchant ID and payee, that is used directly (including any tags the suggestion returns).
2. **Local cache lookup** — if no suggestion, searches the in-memory merchant cache (populated from the diff API at startup) using normalised name comparison.
3. **Auto-create** — if not found and `autoCreateMerchants: true`, creates a new merchant via the diff API and caches it.
4. **No merchant** — if `autoCreateMerchants: false` and no match, the transaction is created without a merchant ID.

**Name normalisation** (for cache lookup only, not for the created title):
- Lowercased and trimmed
- Special characters removed
- Whitespace normalised
- Common business suffixes removed: `ltd`, `llc`, `inc`, `corp`, `corporation`, `company`, `co`, `limited`

---

## Currency Conversion

`CurrencyConverter` uses ZenMoney instruments (currencies) loaded from the diff API. All ZenMoney rates are expressed relative to RUB.

**Conversion formula:**
```
fromCurrency → RUB → toCurrency
rate = fromInstrument.rate / toInstrument.rate
```

The converter is used in two places:
- `TransactionMapper` — converts `amount` to the account's currency for the `outcome` field
- `createZenMoneyTransaction` — computes `conversionInfo` for the result details when `currency ≠ originalCurrency`

---

## Transaction Mapping

`TransactionMapper.mapTransaction()` produces a `ZenMoneyTransaction`. All Curve transactions are treated as **outcome** (spending) transactions.

| ZenMoney field | Source |
|---|---|
| `id` | `crypto.randomUUID()` |
| `date` | `curveTransaction.date` formatted as `yyyy-MM-dd` |
| `outcome` | `abs(convertedAmount)` — amount in account currency |
| `outcomeAccount` | Resolved ZenMoney account ID |
| `outcomeInstrument` | Account's currency instrument ID |
| `income` | `0` (always — Curve transactions are spending) |
| `incomeAccount` | `config.defaultAccountId` |
| `incomeInstrument` | Account's currency instrument ID |
| `opOutcome` | `curveTransaction.amount` — only set when `currency ≠ accountCurrency` |
| `opOutcomeInstrument` | Instrument ID for `curveTransaction.currency` — only when currencies differ |
| `payee` | `merchant.title` if resolved, otherwise `curveTransaction.merchant` |
| `originalPayee` | `curveTransaction.merchant` (always the raw Curve merchant name) |
| `merchant` | Resolved ZenMoney merchant UUID, or `null` |
| `tag` | Tags from suggestion API, or `config.defaultTags`, or `[]` |
| `comment` | See comment format below |
| `hold` | `false` |
| `deleted` | `false` |

**Comment format:**

```
{merchant} | Original: {originalAmount} {originalCurrency} | Converted: {amount} {currency} | Account: {account}
```

The `Original` and `Converted` parts are only included when amounts or currencies differ.

---

## API Communication

All API calls go through `ZenMoneyApiClient`, which wraps `makeRequest()` (a `fetch`-based helper with timeout and abort support).

**Base URL:** `https://api.zenmoney.ru` (configurable via `config.apiBaseUrl`)

| Operation | Method | Endpoint | Purpose |
|---|---|---|---|
| Load data | `POST` | `/v8/diff/` | Fetches accounts, instruments, merchants, tags |
| Create transaction | `POST` | `/v8/diff/` | Submits transaction (and optionally merchant) as a diff |
| Merchant suggestion | `POST` | `/v8/suggest/` | Gets ZenMoney's suggested merchant/tags for a payee name |

The diff API is used for both reading and writing. A write diff includes only the changed objects alongside `lastServerTimestamp` for optimistic concurrency.

**HTTP error handling:**

| Status | Behaviour |
|---|---|
| `401` | Throws `ZenMoneyApiError` — not retried after first attempt |
| `429` | Throws `ZenMoneyApiError` — retried with exponential backoff |
| `400` | Throws `ZenMoneyApiError` — not retried (client error) |
| Other 4xx/5xx | Throws `ZenMoneyApiError` — retried |

---

## Retry Logic

`ErrorHandler.withRetry(operation, maxRetries, delayMs)` wraps API calls with exponential backoff:

```
delay = delayMs * 2^(attempt - 1)
```

Defaults: 3 attempts, 1000ms base delay. Not retried: `ValidationError`, `ConfigurationError`, HTTP 400, HTTP 401 after first attempt.

---

## Output: TransactionCreationResult

```typescript
interface TransactionCreationResult {
  success: boolean;
  transactionId?: string;      // ZenMoney transaction UUID on success
  message: string;             // Human-readable status
  details?: {
    merchant?: { id, name, created }
    conversion?: { originalAmount, originalCurrency, convertedAmount, convertedCurrency, exchangeRate }
    warnings?: string[]        // Non-fatal validation warnings
  };
  error?: {
    type: string;              // Error class name
    message: string;
    code?: string;             // ZenMoneyApiError code if applicable
  };
}
```
