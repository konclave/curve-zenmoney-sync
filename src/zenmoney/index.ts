/**
 *
 * This script takes a Curve transaction object and creates a corresponding
 * transaction in ZenMoney using their API.
 *
 * All source code has been consolidated into this single file to avoid module splitting.
 */

// ============================
// FETCH UTILITIES
// ============================

/**
 * Simple fetch helper function to replace FetchClient complexity
 */
async function makeRequest<T>(
  url: string,
  options: {
    method: "GET" | "POST";
    baseURL?: string;
    data?: any;
    headers?: Record<string, string>;
    timeout?: number;
    accessToken?: string;
  },
): Promise<T> {
  const fullUrl = url.startsWith("http") ? url : `${options.baseURL || ""}${url}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "Windmill-ZenMoney-Sync/1.0.0",
    ...options.headers,
  };

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

  try {
    const response = await fetch(fullUrl, {
      method: options.method,
      headers,
      body: options.data ? JSON.stringify(options.data) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      throw new Error("Authentication failed. Token may be expired or invalid.");
    }
    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return (await response.json()) as T;
    } else {
      return (await response.text()) as T;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================
// TYPES AND INTERFACES
// ============================

/**
 * Input object from Curve transaction for Windmill.dev script
 */
export interface CurveTransactionInput {
  /** Account sync ID (account or card 4 last digigs) from Curve */
  syncID: string;
  /** Account identifier from Curve */
  account: string;
  /** Transaction amount in account currency */
  amount: number;
  /** Transaction currency (3-letter ISO code) */
  currency: string;
  /** Transaction date in ISO format */
  date: string;
  /** Merchant name */
  merchant: string;
  /** Original transaction amount */
  originalAmount: number;
  /** Original transaction currency (3-letter ISO code) */
  originalCurrency: string;
}

/**
 * ZenMoney API Types based on the official documentation
 */

export interface ZenMoneyInstrument {
  id: number;
  changed: number; // Unix timestamp
  title: string;
  shortTitle: string; // 3-letter currency code
  symbol: string;
  rate: number; // Rate in RUB
}

export interface ZenMoneyCompany {
  id: number;
  changed: number;
  title: string;
  fullTitle: string;
  www: string;
  country: string;
}

export interface ZenMoneyUser {
  id: number;
  changed: number;
  login?: string;
  currency: number; // -> Instrument.id
  parent?: number; // -> User.id
}

export type AccountType = "cash" | "ccard" | "checking" | "loan" | "deposit" | "emoney" | "debt";

export interface ZenMoneyAccount {
  id: string; // UUID
  changed: number;
  user: number; // -> User.id
  role?: number; // -> User.id
  instrument?: number; // -> Instrument.id
  company?: number; // -> Company.id
  type: AccountType;
  title: string;
  syncID?: string[];
  balance?: number;
  startBalance?: number;
  creditLimit?: number;
  inBalance: boolean;
  savings?: boolean;
  enableCorrection: boolean;
  enableSMS: boolean;
  archive: boolean;
  // For loan/deposit accounts
  capitalization?: boolean;
  percent?: number;
  startDate?: string; // 'yyyy-MM-dd'
  endDateOffset?: number;
  endDateOffsetInterval?: "day" | "week" | "month" | "year";
  payoffStep?: number;
  payoffInterval?: "month" | "year";
}

export interface ZenMoneyTag {
  id: string; // UUID
  changed: number;
  user: number; // -> User.id
  title: string;
  parent?: string; // -> Tag.id
  icon?: string;
  picture?: string;
  color?: number;
  showIncome: boolean;
  showOutcome: boolean;
  budgetIncome: boolean;
  budgetOutcome: boolean;
  required?: boolean;
}

export interface ZenMoneyMerchant {
  id: string; // UUID
  changed: number;
  user: number; // -> User.id
  title: string;
}

export interface ZenMoneyTransaction {
  id: string; // UUID
  changed: number;
  created: number; // Unix timestamp
  user: number; // -> User.id
  deleted: boolean;
  hold?: boolean;
  date: string; // 'yyyy-MM-dd'
  income: number; // Income account id
  incomeInstrument: number | null; // -> Instrument.id
  incomeAccount: string | null; // -> Account.id
  incomeBankID: string | null;
  outcome: number; // Outcome account id
  outcomeInstrument: number; // -> Instrument.id
  outcomeAccount: string; // -> Account.id
  tag?: string[]; // -> Tag.id[]
  merchant: string | null; // -> Merchant.id
  payee: string | null;
  originalPayee: string | null;
  comment?: string;
  opIncome: number | null;
  opIncomeInstrument: number | null;
  opOutcome: number | null;
  opOutcomeInstrument: number | null;
  outcomeBankID: string | null;
  latitude: number | null;
  longitude: number | null;
  reminderMarker: string | null; // -> ReminderMarker.id
}

export interface ZenMoneyBudget {
  changed: number;
  user: number; // -> User.id
  tag: string; // -> Tag.id
  date: string; // 'yyyy-MM-dd'
  income: number;
  outcome: number;
}

/**
 * ZenMoney API Diff structure
 */
export interface ZenMoneyDiff {
  currentClientTimestamp: number;
  serverTimestamp: number;
  forceFetch?: string[];
  instrument?: ZenMoneyInstrument[];
  company?: ZenMoneyCompany[];
  user?: ZenMoneyUser[];
  account?: ZenMoneyAccount[];
  tag?: ZenMoneyTag[];
  merchant?: ZenMoneyMerchant[];
  transaction?: ZenMoneyTransaction[];
  budget?: ZenMoneyBudget[];
  deletion?: Array<{
    id: string;
    object: string;
    stamp: number;
    user: number;
  }>;
}

/**
 * ZenMoney API response structure
 */
export type ZenMoneyApiResponse = ZenMoneyDiff;

/**
 * OAuth2 token response
 */
export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

/**
 * Configuration for ZenMoney API client
 */
export interface ZenMoneyConfig {
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  apiBaseUrl?: string;
}

/**
 * Configuration for the Windmill script execution
 */
export interface ScriptExecutionConfig {
  // Required parameters
  accessToken: string;
  defaultAccountId: string;
  defaultCurrencyId: number;

  // Optional parameters
  clientId?: string;
  clientSecret?: string;
  apiBaseUrl?: string;
  autoCreateMerchants?: boolean;
  defaultTags?: string[];

  // Execution options
  validateOnly?: boolean;
  dryRun?: boolean;
  retryAttempts?: number;
}

/**
 * Windmill.dev script configuration
 */
export interface WindmillConfig extends ZenMoneyConfig {
  /** Default account ID to use for transactions */
  defaultAccountId: string;
  /** Default currency instrument ID */
  defaultCurrencyId: number;
  /** Whether to create merchants automatically */
  autoCreateMerchants: boolean;
  /** Default tag IDs to apply to transactions */
  defaultTags?: string[];
}

// ============================
// ERROR CLASSES
// ============================

/**
 * Custom error classes for better error handling
 */

export class ZenMoneyApiError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly response?: any;

  constructor(message: string, code: string, statusCode?: number, response?: any) {
    super(message);
    this.name = "ZenMoneyApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.response = response;
  }
}

export class ValidationError extends Error {
  public readonly field: string;
  public readonly value: any;

  constructor(message: string, field: string, value?: any) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
    this.value = value;
  }
}

export class ConfigurationError extends Error {
  public readonly missingFields: string[];

  constructor(message: string, missingFields: string[] = []) {
    super(message);
    this.name = "ConfigurationError";
    this.missingFields = missingFields;
  }
}

export class CurrencyConversionError extends Error {
  public readonly fromCurrency: string;
  public readonly toCurrency: string;

  constructor(message: string, fromCurrency: string, toCurrency: string) {
    super(message);
    this.name = "CurrencyConversionError";
    this.fromCurrency = fromCurrency;
    this.toCurrency = toCurrency;
  }
}

export class MerchantError extends Error {
  public readonly merchantName: string;

  constructor(message: string, merchantName: string) {
    super(message);
    this.name = "MerchantError";
    this.merchantName = merchantName;
  }
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Comprehensive validator for Curve transaction input
 */
export class TransactionValidator {
  /**
   * Validate complete transaction input
   */
  static validateTransaction(transaction: CurveTransactionInput): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    this.validateRequiredFields(transaction, errors);
    this.validateDataTypes(transaction, errors);
    this.validateBusinessRules(transaction, errors, warnings);
    this.validateCurrencies(transaction, errors, warnings);
    this.validateAmounts(transaction, errors, warnings);
    this.validateDate(transaction, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private static validateRequiredFields(
    transaction: CurveTransactionInput,
    errors: ValidationError[],
  ): void {
    const requiredFields: (keyof CurveTransactionInput)[] = [
      "account",
      "currency",
      "date",
      "merchant",
      "amount",
      "originalAmount",
      "originalCurrency",
    ];

    for (const field of requiredFields) {
      const value = transaction[field];

      if (value === undefined || value === null) {
        errors.push(new ValidationError(`${field} is required`, field, value));
      } else if (typeof value === "string" && !value.trim()) {
        errors.push(new ValidationError(`${field} cannot be empty`, field, value));
      }
    }
  }

  private static validateDataTypes(
    transaction: CurveTransactionInput,
    errors: ValidationError[],
  ): void {
    // String fields
    const stringFields: (keyof CurveTransactionInput)[] = [
      "account",
      "currency",
      "date",
      "merchant",
      "originalCurrency",
    ];

    for (const field of stringFields) {
      const value = transaction[field];
      if (value !== undefined && typeof value !== "string") {
        errors.push(new ValidationError(`${field} must be a string`, field, value));
      }
    }

    // Number fields
    const numberFields: (keyof CurveTransactionInput)[] = ["amount", "originalAmount"];

    for (const field of numberFields) {
      const value = transaction[field];
      if (value !== undefined && (typeof value !== "number" || isNaN(value))) {
        errors.push(new ValidationError(`${field} must be a valid number`, field, value));
      }
    }
  }

  private static validateBusinessRules(
    transaction: CurveTransactionInput,
    errors: ValidationError[],
    warnings: string[],
  ): void {
    // Merchant name length
    if (transaction.merchant && transaction.merchant.length > 100) {
      errors.push(
        new ValidationError(
          "Merchant name too long (max 100 characters)",
          "merchant",
          transaction.merchant,
        ),
      );
    }

    if (transaction.merchant && transaction.merchant.length < 2) {
      errors.push(
        new ValidationError(
          "Merchant name too short (min 2 characters)",
          "merchant",
          transaction.merchant,
        ),
      );
    }

    // Account ID format (assuming UUID or specific format)
    if (transaction.account && !this.isValidAccountId(transaction.account)) {
      warnings.push("Account ID format may not be valid");
    }

    // Check for suspicious patterns
    if (transaction.merchant && /^[0-9]+$/.test(transaction.merchant)) {
      warnings.push(
        "Merchant name appears to be only numbers, which may indicate data quality issues",
      );
    }
  }

  private static validateCurrencies(
    transaction: CurveTransactionInput,
    errors: ValidationError[],
    warnings: string[],
  ): void {
    // Currency code format (3 letters)
    const currencyPattern = /^[A-Z]{3}$/;

    if (transaction.currency && !currencyPattern.test(transaction.currency)) {
      errors.push(
        new ValidationError(
          "Currency must be a 3-letter ISO code",
          "currency",
          transaction.currency,
        ),
      );
    }

    if (transaction.originalCurrency && !currencyPattern.test(transaction.originalCurrency)) {
      errors.push(
        new ValidationError(
          "Original currency must be a 3-letter ISO code",
          "originalCurrency",
          transaction.originalCurrency,
        ),
      );
    }

    // Warn about uncommon currencies
    const commonCurrencies = ["USD", "EUR", "GBP", "RUB", "JPY", "CAD", "AUD", "CHF", "CNY"];

    if (transaction.currency && !commonCurrencies.includes(transaction.currency)) {
      warnings.push(`Currency ${transaction.currency} is not commonly supported`);
    }

    if (transaction.originalCurrency && !commonCurrencies.includes(transaction.originalCurrency)) {
      warnings.push(`Original currency ${transaction.originalCurrency} is not commonly supported`);
    }
  }

  private static validateAmounts(
    transaction: CurveTransactionInput,
    errors: ValidationError[],
    warnings: string[],
  ): void {
    // Amount validation
    if (transaction.amount !== undefined) {
      if (transaction.amount === 0) {
        errors.push(new ValidationError("Amount cannot be zero", "amount", transaction.amount));
      }

      if (Math.abs(transaction.amount) > 1000000) {
        warnings.push("Transaction amount is unusually large");
      }

      if (Math.abs(transaction.amount) < 0.01) {
        warnings.push("Transaction amount is unusually small");
      }
    }

    if (transaction.originalAmount !== undefined) {
      if (transaction.originalAmount === 0) {
        errors.push(
          new ValidationError(
            "Original amount cannot be zero",
            "originalAmount",
            transaction.originalAmount,
          ),
        );
      }

      if (Math.abs(transaction.originalAmount) > 1000000) {
        warnings.push("Original transaction amount is unusually large");
      }
    }

    // Cross-validation of amounts
    if (transaction.amount !== undefined && transaction.originalAmount !== undefined) {
      if (
        transaction.currency === transaction.originalCurrency &&
        transaction.amount !== transaction.originalAmount
      ) {
        warnings.push("Amount and original amount differ despite same currency");
      }

      // Check for unrealistic exchange rates
      if (transaction.currency !== transaction.originalCurrency) {
        const rate = Math.abs(transaction.amount / transaction.originalAmount);
        if (rate > 1000 || rate < 0.001) {
          warnings.push("Exchange rate appears unrealistic");
        }
      }
    }
  }

  private static validateDate(
    transaction: CurveTransactionInput,
    errors: ValidationError[],
    warnings: string[],
  ): void {
    if (!transaction.date) return;

    try {
      const date = new Date(transaction.date);

      if (isNaN(date.getTime())) {
        errors.push(new ValidationError("Invalid date format", "date", transaction.date));
        return;
      }

      // Check for future dates
      const now = new Date();
      if (date > now) {
        warnings.push("Transaction date is in the future");
      }

      // Check for very old dates
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      if (date < oneYearAgo) {
        warnings.push("Transaction date is more than one year old");
      }

      // Check for weekend dates (might indicate delayed processing)
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        warnings.push("Transaction date falls on a weekend");
      }
    } catch {
      errors.push(new ValidationError("Date parsing failed", "date", transaction.date));
    }
  }

  private static isValidAccountId(accountId: string): boolean {
    // UUID pattern
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    // Allow various account ID formats
    return uuidPattern.test(accountId) || /^[A-Za-z0-9_-]{8,}$/.test(accountId); // Alphanumeric with minimum length
  }
}

/**
 * Error handler for async operations
 */
export class ErrorHandler {
  /**
   * Handle API errors with retry logic
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000,
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on validation or configuration errors
        if (
          error instanceof ValidationError ||
          error instanceof ConfigurationError ||
          (error instanceof ZenMoneyApiError && error.statusCode === 400)
        ) {
          throw error;
        }

        // Don't retry on authentication errors unless it's the first attempt
        if (error instanceof ZenMoneyApiError && error.statusCode === 401 && attempt > 1) {
          throw error;
        }

        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff
        const delay = delayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Safely execute operation with error logging
   */
  static async safeExecute<T>(
    operation: () => Promise<T>,
    fallback?: T,
    errorLogger?: (error: Error) => void,
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      if (errorLogger) {
        errorLogger(error as Error);
      } else {
        console.error("Operation failed:", error);
      }
      return fallback;
    }
  }

  /**
   * Create user-friendly error message
   */
  static createUserMessage(error: Error): string {
    if (error instanceof ValidationError) {
      return `Validation failed for ${error.field}: ${error.message}`;
    }

    if (error instanceof ConfigurationError) {
      return `Configuration error: ${error.message}`;
    }

    if (error instanceof ZenMoneyApiError) {
      switch (error.statusCode) {
        case 401:
          return "Authentication failed. Please check your access token.";
        case 403:
          return "Access denied. You may not have permission to perform this action.";
        case 429:
          return "Rate limit exceeded. Please try again later.";
        case 500:
          return "ZenMoney API is experiencing issues. Please try again later.";
        default:
          return `API error: ${error.message}`;
      }
    }

    if (error instanceof CurrencyConversionError) {
      return `Currency conversion failed: ${error.message}`;
    }

    if (error instanceof MerchantError) {
      return `Merchant error: ${error.message}`;
    }

    return `Unexpected error: ${error.message}`;
  }

  /**
   * Log error with context
   */
  static logError(error: Error, context: Record<string, any> = {}): void {
    const errorData = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
    };

    if (error instanceof ZenMoneyApiError) {
      errorData.context.statusCode = error.statusCode;
      errorData.context.apiCode = error.code;
    }

    console.error("Error occurred:", JSON.stringify(errorData, null, 2));
  }
}

// ============================
// ZENMONEY API CLIENT
// ============================

/**
 * ZenMoney API Client with OAuth2 authentication
 */
export class ZenMoneyApiClient {
  private config: Required<ZenMoneyConfig>;
  private instrumentCache: ZenMoneyInstrument[] = [];
  private merchantCache: ZenMoneyMerchant[] = [];
  private accountCache: ZenMoneyAccount[] = [];
  private tagCache: ZenMoneyTag[] = [];
  private serverTimestamp: number = 0;

  constructor(config: ZenMoneyConfig) {
    this.config = {
      accessToken: config.accessToken || "",
      clientId: config.clientId || "",
      clientSecret: config.clientSecret || "",
      apiBaseUrl: config.apiBaseUrl || "https://api.zenmoney.ru",
    };
  }

  /**
   * Get data diff from ZenMoney API
   */
  async getDiff(): Promise<ZenMoneyDiff> {
    const payload: ZenMoneyDiff = {
      currentClientTimestamp: new Date().getTime() / 1000,
      serverTimestamp: this.serverTimestamp,
    };

    const response = await makeRequest<ZenMoneyApiResponse>("/v8/diff/", {
      method: "POST",
      baseURL: this.config.apiBaseUrl,
      data: payload,
      accessToken: this.config.accessToken,
      timeout: 30000,
    });

    if (response.serverTimestamp) {
      this.serverTimestamp = response.serverTimestamp;
    }

    this.instrumentCache = response.instrument ?? [];
    this.accountCache = response.account ?? [];
    this.merchantCache = response.merchant ?? [];
    this.tagCache = response.tag ?? [];

    return response || payload;
  }

  /**
   * Submit data changes to ZenMoney API
   */
  async submitDiff(diff: Partial<ZenMoneyDiff>): Promise<ZenMoneyApiResponse> {
    const response = await makeRequest<ZenMoneyApiResponse>("/v8/diff/", {
      method: "POST",
      baseURL: this.config.apiBaseUrl,
      data: {
        ...diff,
        lastServerTimestamp: this.serverTimestamp,
        currentClientTimestamp: new Date().getTime() / 1000,
      },
      accessToken: this.config.accessToken,
      timeout: 30000,
    });

    if (diff.transaction && response.serverTimestamp) {
      this.serverTimestamp = response.serverTimestamp;
    }

    return response;
  }

  /**
   * Create a new transaction
   */
  async createTransaction(
    transaction: Omit<ZenMoneyTransaction, "changed">,
  ): Promise<ZenMoneyApiResponse> {
    const transactionWithTimestamp: ZenMoneyTransaction = {
      ...transaction,
      changed: Math.floor(Date.now() / 1000),
    };

    return this.submitDiff({
      transaction: [transactionWithTimestamp],
    });
  }

  /**
   * Create a new merchant
   */
  async createMerchant(merchant: Omit<ZenMoneyMerchant, "changed">): Promise<ZenMoneyApiResponse> {
    const merchantWithTimestamp: ZenMoneyMerchant = {
      ...merchant,
      changed: Math.floor(Date.now() / 1000),
    };

    return this.submitDiff({
      merchant: [merchantWithTimestamp],
    });
  }

  /**
   * Get suggestion for payee/merchant
   */
  async getSuggestion(payee: string): Promise<any> {
    const response = await makeRequest("/v8/suggest/", {
      method: "POST",
      baseURL: this.config.apiBaseUrl,
      data: { payee },
      accessToken: this.config.accessToken,
      timeout: 30000,
    });

    return response;
  }

  /**
   * Get all accounts
   */
  async getAccounts(): Promise<ZenMoneyAccount[]> {
    if (this.accountCache.length === 0) {
      const { account } = await this.getDiff();
      this.accountCache = account ?? [];
    }
    return this.accountCache;
  }

  /**
   * Get all merchants
   */
  async getMerchants(): Promise<ZenMoneyMerchant[]> {
    if (this.merchantCache.length === 0) {
      const { merchant } = await this.getDiff();
      this.merchantCache = merchant ?? [];
    }
    return this.merchantCache;
  }

  /**
   * Get all instruments (currencies)
   */
  async getInstruments(): Promise<ZenMoneyInstrument[]> {
    if (this.instrumentCache.length === 0) {
      const { instrument } = await this.getDiff();
      this.instrumentCache = instrument ?? [];
    }
    return this.instrumentCache;
  }

  /**
   * Get all tags (categories)
   */
  async getTags(): Promise<ZenMoneyTag[]> {
    if (this.tagCache.length === 0) {
      const { tag } = await this.getDiff();
      this.tagCache = tag ?? [];
    }
    return this.tagCache;
  }

  /**
   * Find account by ID
   */
  async findAccountById(accountId: string): Promise<ZenMoneyAccount | undefined> {
    const accounts = await this.getAccounts();
    return accounts.find((account) => account.id === accountId);
  }

  /**
   * Find instrument by currency code
   */
  async findInstrumentByCurrency(currencyCode: string): Promise<ZenMoneyInstrument | undefined> {
    const instruments = await this.getInstruments();
    return instruments.find((instrument) => instrument.shortTitle === currencyCode);
  }

  /**
   * Find merchant by title
   */
  async findMerchantByTitle(title: string): Promise<ZenMoneyMerchant | undefined> {
    const merchants = await this.getMerchants();
    return merchants.find((merchant) => merchant.title.toLowerCase() === title.toLowerCase());
  }

  /**
   * Health check - verify API connection and authentication
   */
  async initLoad(): Promise<boolean> {
    try {
      await this.getDiff();
      return true;
    } catch {
      return false;
    }
  }
}

// ============================
// MERCHANT MANAGER
// ============================

/**
 * Manages merchant lookup and creation for ZenMoney transactions
 */
export class MerchantManager {
  private apiClient: ZenMoneyApiClient;
  private config: WindmillConfig;
  private merchantCache: Map<string, ZenMoneyMerchant> = new Map();
  private pendingCreations: Map<string, Promise<ZenMoneyMerchant>> = new Map();

  constructor(apiClient: ZenMoneyApiClient, config: WindmillConfig) {
    this.apiClient = apiClient;
    this.config = config;
  }

  /**
   * Initialize merchant cache with existing merchants
   */
  async initializeCache(): Promise<void> {
    try {
      const merchants = await this.apiClient.getMerchants();
      this.merchantCache.clear();

      for (const merchant of merchants) {
        // Cache by normalized title for faster lookup
        const normalizedTitle = this.normalizeMerchantName(merchant.title);
        this.merchantCache.set(normalizedTitle, merchant);
      }
    } catch (error) {
      console.warn("Failed to initialize merchant cache:", error);
    }
  }

  /**
   * Find or create merchant by name
   */
  async findOrCreateMerchant(
    merchantName: string,
    userId: number,
  ): Promise<ZenMoneyMerchant | undefined> {
    if (!merchantName?.trim()) {
      return undefined;
    }

    const normalizedName = this.normalizeMerchantName(merchantName);

    // Check cache first
    let merchant = this.merchantCache.get(normalizedName);
    if (merchant) {
      return merchant;
    }

    // Check for pending creation to avoid duplicates
    const pendingCreation = this.pendingCreations.get(normalizedName);
    if (pendingCreation) {
      return await pendingCreation;
    }

    // Create new merchant if auto-creation is enabled
    if (this.config.autoCreateMerchants) {
      const creationPromise = this.createNewMerchant(merchantName, userId);
      this.pendingCreations.set(normalizedName, creationPromise);

      try {
        merchant = await creationPromise;
        this.merchantCache.set(normalizedName, merchant);
        return merchant;
      } catch (error) {
        console.error(`Failed to create merchant "${merchantName}":`, error);
        throw error;
      } finally {
        this.pendingCreations.delete(normalizedName);
      }
    }

    return undefined;
  }

  /**
   * Create a new merchant
   */
  private async createNewMerchant(merchantName: string, userId: number): Promise<ZenMoneyMerchant> {
    const merchantId = crypto.randomUUID();
    const cleanedName = this.cleanMerchantName(merchantName);

    const newMerchant: ZenMoneyMerchant = {
      id: merchantId,
      changed: Math.floor(Date.now() / 1000),
      user: userId,
      title: cleanedName,
    };

    await this.apiClient.createMerchant(newMerchant);

    return newMerchant;
  }

  /**
   * Normalize merchant name for comparison
   */
  private normalizeMerchantName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, "") // Remove special characters
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/\b(ltd|llc|inc|corp|corporation|company|co|limited)\b/g, "") // Remove common business suffixes
      .trim();
  }

  /**
   * Clean merchant name for display
   */
  private cleanMerchantName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/^\w/, (c) => c.toUpperCase()); // Capitalize first letter
  }

  /**
   * Get merchant suggestions from ZenMoney API
   */
  async getMerchantSuggestions(merchantName: string): Promise<any> {
    try {
      return await this.apiClient.getSuggestion(merchantName);
    } catch (error) {
      console.warn(`Failed to get suggestions for "${merchantName}":`, error);
      return null;
    }
  }

  /**
   * Get all cached merchants
   */
  getCachedMerchants(): ZenMoneyMerchant[] {
    return Array.from(this.merchantCache.values());
  }

  /**
   * Clear merchant cache
   */
  clearCache(): void {
    this.merchantCache.clear();
    this.pendingCreations.clear();
  }
}

/**
 * Helper function to create merchant manager
 */
export function createMerchantManager(
  apiClient: ZenMoneyApiClient,
  config: WindmillConfig,
): MerchantManager {
  return new MerchantManager(apiClient, config);
}

// ============================
// TRANSACTION MAPPER
// ============================

/**
 * Maps Curve transaction to ZenMoney transaction format
 */
export class TransactionMapper {
  private converter: CurrencyConverter;
  private config: WindmillConfig;

  constructor(converter: CurrencyConverter, config: WindmillConfig) {
    this.converter = converter;
    this.config = config;
  }

  /**
   * Map Curve transaction to ZenMoney transaction
   */
  async mapTransaction(
    curveTransaction: CurveTransactionInput,
    account: ZenMoneyAccount,
    merchant?: ZenMoneyMerchant,
    tags?: string[],
  ): Promise<ZenMoneyTransaction> {
    const transactionId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    // Parse the date from Curve transaction
    const transactionDate = this.parseTransactionDate(curveTransaction.date);

    // Get account currency instrument
    const accountInstrument = await this.getAccountInstrument(account);

    // Convert amounts to account currency if needed
    const { convertedAmount } = this.convertAmounts(curveTransaction, accountInstrument);

    // All the transactions from Curve are outcome.
    const isIncome = false;

    // Create ZenMoney transaction
    const transaction: ZenMoneyTransaction = {
      id: transactionId,
      changed: now,
      created: now,
      user: account.user,
      deleted: false,
      hold: false,
      date: transactionDate,
      payee: merchant?.title ?? curveTransaction.merchant,
      originalPayee: curveTransaction.merchant,
      comment: this.generateComment(curveTransaction),

      // Set income/outcome based on transaction direction
      income: isIncome ? Math.abs(convertedAmount) : 0,
      incomeInstrument: accountInstrument.id,
      incomeAccount: isIncome ? account.id : this.config.defaultAccountId,
      incomeBankID: null,

      outcome: isIncome ? 0 : Math.abs(convertedAmount),
      outcomeInstrument: accountInstrument.id,
      outcomeAccount: isIncome ? this.config.defaultAccountId : account.id,
      outcomeBankID: null,

      reminderMarker: null,
      // Store original amounts if different currency
      opIncome:
        curveTransaction.currency !== accountInstrument.shortTitle && isIncome
          ? Math.abs(curveTransaction.amount)
          : null,
      opIncomeInstrument:
        curveTransaction.currency !== accountInstrument.shortTitle && isIncome
          ? (this.converter.getInstrument({
              currencyCode: curveTransaction.currency,
            })?.id ?? null)
          : null,

      opOutcome:
        curveTransaction.currency !== accountInstrument.shortTitle && !isIncome
          ? Math.abs(curveTransaction.amount)
          : null,
      opOutcomeInstrument:
        curveTransaction.currency !== accountInstrument.shortTitle && !isIncome
          ? (this.converter.getInstrument({
              currencyCode: curveTransaction.currency,
            })?.id ?? null)
          : null,

      // Set merchant if provided
      merchant: merchant?.id ?? null,

      // Set tags if provided
      tag: tags ?? this.config.defaultTags ?? [],
      latitude: null,
      longitude: null,
    };

    return transaction;
  }

  /**
   * Parse transaction date to ZenMoney format (yyyy-MM-dd)
   */
  private parseTransactionDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date: ${dateString}`);
      }

      // Format as yyyy-MM-dd
      return date.toISOString().split("T")[0];
    } catch (error) {
      // Fallback to current date if parsing fails
      console.warn(`Failed to parse date "${dateString}", using current date:`, error);
      return new Date().toISOString().split("T")[0];
    }
  }

  /**
   * Get account currency instrument
   */
  private async getAccountInstrument(account: ZenMoneyAccount): Promise<ZenMoneyInstrument> {
    if (!account.instrument) {
      throw new Error(`Account ${account.id} has no associated instrument`);
    }

    // In a real scenario, you would fetch this from the API
    // For now, we'll need to pass this information or fetch it
    const instrument = this.converter.getInstrument({ id: account.instrument }); // Default fallback
    if (!instrument) {
      throw new Error(`Could not find instrument for account ${account.id}`);
    }

    return instrument;
  }

  /**
   * Convert transaction amounts to account currency
   */
  private convertAmounts(
    curveTransaction: CurveTransactionInput,
    accountInstrument: ZenMoneyInstrument,
  ): {
    convertedAmount: number;
    originalAmountInAccountCurrency: number;
  } {
    const accountCurrency = accountInstrument.shortTitle;

    // Convert main amount to account currency
    const convertedAmount = this.converter.convertToAccountCurrency(
      curveTransaction.amount,
      curveTransaction.currency,
      accountCurrency,
    );

    // Convert original amount to account currency (if different)
    const originalAmountInAccountCurrency = this.converter.convertToAccountCurrency(
      curveTransaction.originalAmount,
      curveTransaction.originalCurrency,
      accountCurrency,
    );

    return {
      convertedAmount: Math.round(convertedAmount * 100) / 100,
      originalAmountInAccountCurrency: Math.round(originalAmountInAccountCurrency * 100) / 100,
    };
  }

  /**
   * Generate transaction comment with conversion info
   */
  private generateComment(curveTransaction: CurveTransactionInput): string {
    const parts: string[] = [];

    // Add merchant info
    parts.push(`${curveTransaction.merchant}`);

    // Add currency conversion info if amounts differ
    if (
      curveTransaction.currency !== curveTransaction.originalCurrency ||
      curveTransaction.amount !== curveTransaction.originalAmount
    ) {
      const originalFormatted = this.converter.formatAmount(
        curveTransaction.originalAmount,
        curveTransaction.originalCurrency,
      );

      const convertedFormatted = this.converter.formatAmount(
        curveTransaction.amount,
        curveTransaction.currency,
      );

      parts.push(`Original: ${originalFormatted}`);
      if (originalFormatted !== convertedFormatted) {
        parts.push(`Converted: ${convertedFormatted}`);
      }
    }

    // Add account reference
    parts.push(`Account: ${curveTransaction.account}`);

    return parts.join(" | ");
  }
}

/**
 * Helper function to create transaction mapper
 */
export function createTransactionMapper(
  converter: CurrencyConverter,
  config: WindmillConfig,
): TransactionMapper {
  return new TransactionMapper(converter, config);
}

/**
 * Common currency codes and their typical symbols
 * Used as fallback when ZenMoney doesn't provide symbols
 */
export const COMMON_CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  RUB: "₽",
  JPY: "¥",
  CNY: "¥",
  CHF: "CHF",
  CAD: "C$",
  AUD: "A$",
  NZD: "NZ$",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  PLN: "zł",
  CZK: "Kč",
  HUF: "Ft",
  RON: "lei",
  BGN: "лв",
  HRK: "kn",
  TRY: "₺",
  BRL: "R$",
  MXN: "$",
  ARS: "$",
  CLP: "$",
  COP: "$",
  PEN: "S/",
  UYU: "$U",
  KRW: "₩",
  THB: "฿",
  SGD: "S$",
  MYR: "RM",
  IDR: "Rp",
  PHP: "₱",
  VND: "₫",
  INR: "₹",
  PKR: "₨",
  BDT: "৳",
  LKR: "₨",
  NPR: "₨",
  AFN: "؋",
  IRR: "﷼",
  IQD: "ع.د",
  SAR: "﷼",
  AED: "د.إ",
  KWD: "د.ك",
  QAR: "﷼",
  OMR: "﷼",
  BHD: ".د.ب",
  JOD: "د.ا",
  LBP: "£",
  SYP: "£",
  EGP: "£",
  MAD: "د.م.",
  TND: "د.ت",
  DZD: "د.ج",
  LYD: "ل.د",
  ETB: "Br",
  KES: "KSh",
  UGX: "USh",
  TZS: "TSh",
  RWF: "FRw",
  MGA: "Ar",
  MUR: "₨",
  SCR: "₨",
  ZAR: "R",
  NAD: "$",
  BWP: "P",
  SZL: "L",
  LSL: "L",
  MWK: "MK",
  ZMW: "ZK",
  AOA: "Kz",
  MZN: "MT",
  XOF: "CFA",
  XAF: "FCFA",
  GHS: "₵",
  NGN: "₦",
  XCD: "$",
  BBD: "$",
  BZD: "$",
  JMD: "$",
  TTD: "$",
  GYD: "$",
  SRD: "$",
  FJD: "$",
  SBD: "$",
  TOP: "T$",
  VUV: "Vt",
  WST: "T",
  PGK: "K",
};

/**
 * Get currency symbol with fallback to common symbols
 */
export function getCurrencySymbolWithFallback(currencyCode: string): string {
  return COMMON_CURRENCY_SYMBOLS[currencyCode] || currencyCode;
}

export function getCurrencyCode(currencySymbol: string): string {
  const entry = Object.entries(COMMON_CURRENCY_SYMBOLS).find(
    ([, symbol]) => symbol === currencySymbol,
  );
  return entry?.[0] ?? "EUR";
}

/**
 * Currency conversion utilities for ZenMoney integration
 */
export class CurrencyConverter {
  private instruments: Map<string, ZenMoneyInstrument> = new Map();
  private baseCurrency: string = "RUB"; // ZenMoney uses RUB as base currency

  /**
   * Initialize with instruments from ZenMoney API
   */
  setInstruments(instruments: ZenMoneyInstrument[]): void {
    this.instruments.clear();
    for (const instrument of instruments) {
      this.instruments.set(String(instrument.id), instrument);
    }
  }

  /**
   * Get instrument by currency code
   */
  getInstrument({
    id,
    currencyCode = "RUB",
  }: {
    id?: number;
    currencyCode?: string;
  }): ZenMoneyInstrument | undefined {
    if (id) {
      return this.instruments.get(String(id));
    }
    return Array.from(this.instruments.values()).find(
      (entry: ZenMoneyInstrument) => entry.shortTitle === currencyCode,
    );
  }

  /**
   * Get exchange rate from one currency to another
   * All rates in ZenMoney are relative to RUB
   */
  getExchangeRate(fromCurrency: string, toCurrency: string): number {
    if (fromCurrency === toCurrency) {
      return 1;
    }

    const fromInstrument = this.instruments.get(fromCurrency);
    const toInstrument = this.instruments.get(toCurrency);

    if (!fromInstrument || !toInstrument) {
      throw new Error(`Currency not found: ${!fromInstrument ? fromCurrency : toCurrency}`);
    }

    // Convert from source currency to RUB, then from RUB to target currency
    if (fromCurrency === this.baseCurrency) {
      return 1 / toInstrument.rate;
    } else if (toCurrency === this.baseCurrency) {
      return fromInstrument.rate;
    } else {
      // Both currencies are not RUB
      const fromToRubRate = fromInstrument.rate;
      const toToRubRate = toInstrument.rate;
      return fromToRubRate / toToRubRate;
    }
  }

  /**
   * Convert amount from one currency to another
   */
  convertAmount(amount: number, fromCurrency: string, toCurrency: string): number {
    const rate = this.getExchangeRate(fromCurrency, toCurrency);
    return Math.round(amount * rate * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Convert amount to account currency
   * This is useful when the transaction currency differs from account currency
   */
  convertToAccountCurrency(
    amount: number,
    transactionCurrency: string,
    accountCurrency: string,
  ): number {
    return this.convertAmount(amount, transactionCurrency, accountCurrency);
  }

  /**
   * Get conversion info for logging/debugging
   */
  getConversionInfo(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ): {
    originalAmount: number;
    originalCurrency: string;
    convertedAmount: number;
    convertedCurrency: string;
    exchangeRate: number;
  } {
    const rate = this.getExchangeRate(fromCurrency, toCurrency);
    const convertedAmount = this.convertAmount(amount, fromCurrency, toCurrency);

    return {
      originalAmount: amount,
      originalCurrency: fromCurrency,
      convertedAmount,
      convertedCurrency: toCurrency,
      exchangeRate: rate,
    };
  }

  /**
   * Check if currency is supported
   */
  isCurrencySupported(currencyCode: string): boolean {
    return this.instruments.has(currencyCode);
  }

  /**
   * Get all supported currencies
   */
  getSupportedCurrencies(): string[] {
    return Array.from(this.instruments.keys());
  }

  /**
   * Format amount with currency symbol
   */
  formatAmount(amount: number, currencyCode: string): string {
    const instrument = this.instruments.get(currencyCode);
    if (!instrument) {
      return `${amount} ${currencyCode}`;
    }

    return `${amount.toFixed(2)} ${instrument.symbol || currencyCode}`;
  }

  /**
   * Get currency symbol
   */
  getCurrencySymbol(currencyCode: string): string {
    const instrument = this.instruments.get(currencyCode);
    return instrument?.symbol || currencyCode;
  }

  /**
   * Validate currency conversion parameters
   */
  validateConversion(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (amount <= 0) {
      errors.push("Amount must be greater than 0");
    }

    if (!this.isCurrencySupported(fromCurrency)) {
      errors.push(`Source currency '${fromCurrency}' is not supported`);
    }

    if (!this.isCurrencySupported(toCurrency)) {
      errors.push(`Target currency '${toCurrency}' is not supported`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Helper function to create and initialize a currency converter
 */
export async function createCurrencyConverter(
  instruments: ZenMoneyInstrument[],
): Promise<CurrencyConverter> {
  const converter = new CurrencyConverter();
  converter.setInstruments(instruments);
  return converter;
}

/**
 * Main result interface for the Windmill script
 */
export interface TransactionCreationResult {
  success: boolean;
  transactionId?: string;
  message: string;
  details?: {
    merchant?: {
      id: string;
      name: string;
      created: boolean;
    };
    conversion?: {
      originalAmount: number;
      originalCurrency: string;
      convertedAmount: number;
      convertedCurrency: string;
      exchangeRate: number;
    };
    warnings?: string[];
  };
  error?: {
    type: string;
    message: string;
    code?: string;
  };
}

// main(
//     '3967',
//     'Trade Republic Card',
//     '4.70',
//     "€" ,
//     "16 September 2025 08:41:30" ,
//     "Sweet Spot Kaffee",
//     "4.70",
//     "€"
// );

export async function main(
  syncID: string,
  account: string,
  amount: string,
  currency: string,
  date: string,
  merchant: string,
  originalAmount?: string,
  originalCurrency?: string,
) {
  if (!syncID) {
    return;
  }

  const curveTransaction = {
    syncID,
    account,
    amount: Number(amount),
    currency: getCurrencyCode(currency),
    date,
    merchant,
    originalAmount: Number(originalAmount ?? amount),
    originalCurrency: getCurrencyCode(originalCurrency ?? currency),
  };

  const { accessToken, defaultAccountId } = await readEnvironmentVariables();

  const config: ScriptExecutionConfig = {
    accessToken,
    defaultAccountId,
    defaultCurrencyId: 3, // EUR
    autoCreateMerchants: true,
    retryAttempts: 1,
  };

  return await createZenMoneyTransaction(curveTransaction, config);
}

async function readEnvironmentVariables() {
  const accessToken = process.env.ZENMONEY_ACCESS_TOKEN;
  const defaultAccountId = process.env.ZENMONEY_DEFAULT_ACCOUNT_ID;

  if (!accessToken) {
    throw new Error(
      "Zenmoney access token is not defined. Should be as a ZENMONEY_ACCESS_TOKEN environment variable",
    );
  }

  if (!defaultAccountId) {
    throw new Error(
      "Zenmoney default account ID is not defined. Should be as a ZENMONYE_DEFAULT_ACCOUNT_ID environment variable",
    );
  }

  return { accessToken, defaultAccountId };
}

/**
 * Main function to create ZenMoney transaction from Curve data
 *
 * @param curveTransaction - The Curve transaction object
 * @param config - Configuration object or individual parameters
 * @returns Promise<TransactionCreationResult>
 */
export async function createZenMoneyTransaction(
  curveTransaction: CurveTransactionInput,
  config: ScriptExecutionConfig | string, // Allow passing accessToken directly for simplicity
  defaultAccountId?: string,
  defaultCurrencyId?: number,
  autoCreateMerchants?: boolean,
  defaultTags?: string[],
  apiBaseUrl?: string,
  validateOnly?: boolean,
  dryRun?: boolean,
): Promise<TransactionCreationResult> {
  // Handle flexible parameter passing
  const executionConfig: ScriptExecutionConfig =
    typeof config === "string"
      ? {
          accessToken: config,
          defaultAccountId: defaultAccountId!,
          defaultCurrencyId: defaultCurrencyId || 3,
          autoCreateMerchants: autoCreateMerchants ?? true,
          defaultTags,
          apiBaseUrl,
          validateOnly,
          dryRun,
        }
      : config;

  try {
    const validationResult = TransactionValidator.validateTransaction(curveTransaction);

    if (!validationResult.isValid) {
      return {
        success: false,
        message: "Transaction validation failed",
        error: {
          type: "ValidationError",
          message: validationResult.errors.map((e: ValidationError) => e.message).join("; "),
        },
      };
    }

    if (executionConfig.validateOnly) {
      return {
        success: true,
        message: "Transaction validation passed",
        details: {
          warnings: validationResult.warnings,
        },
      };
    }

    if (!executionConfig.accessToken?.trim()) {
      return {
        success: false,
        message: "Configuration validation failed",
        error: {
          type: "ConfigurationError",
          message: "ZENMONEY_ACCESS_TOKEN is required",
        },
      };
    }

    if (!executionConfig.defaultAccountId?.trim()) {
      return {
        success: false,
        message: "Configuration validation failed",
        error: {
          type: "ConfigurationError",
          message: "ZENMONEY_DEFAULT_ACCOUNT_ID is required",
        },
      };
    }

    // Step 3: Initialize configuration and API client
    const windmillConfig: WindmillConfig = {
      accessToken: executionConfig.accessToken,
      clientId: executionConfig.clientId,
      clientSecret: executionConfig.clientSecret,
      apiBaseUrl: executionConfig.apiBaseUrl || "https://api.zenmoney.ru",
      defaultAccountId: executionConfig.defaultAccountId,
      defaultCurrencyId: executionConfig.defaultCurrencyId,
      autoCreateMerchants: executionConfig.autoCreateMerchants ?? true,
      defaultTags: executionConfig.defaultTags,
    };

    const apiClient = new ZenMoneyApiClient(windmillConfig);

    // Step 4: Test API connection
    const isConnected = await ErrorHandler.withRetry(
      () => apiClient.initLoad(),
      1, // Single attempt for health check
      0,
    );

    if (!isConnected) {
      throw new ZenMoneyApiError("Failed to connect to ZenMoney API", "CONNECTION_FAILED");
    }

    // Step 5: Initialize services
    const [instruments, accounts] = await Promise.all([
      apiClient.getInstruments(),
      apiClient.getAccounts(),
    ]);

    const currencyConverter = await createCurrencyConverter(instruments);
    const transactionMapper = createTransactionMapper(currencyConverter, windmillConfig);
    const merchantManager = createMerchantManager(apiClient, windmillConfig);

    // Initialize merchant cache
    await merchantManager.initializeCache();

    // Step 6: Find target account
    const targetAccount =
      accounts.find((acc: ZenMoneyAccount) => acc.syncID?.includes(curveTransaction.syncID)) ||
      accounts.find((acc: ZenMoneyAccount) => acc.title.trim() === curveTransaction.account) ||
      accounts.find((acc: ZenMoneyAccount) => acc.id === windmillConfig.defaultAccountId);

    if (!targetAccount) {
      throw new ConfigurationError(`Default account ${windmillConfig.defaultAccountId} not found`, [
        "defaultAccountId",
      ]);
    }

    // Step 7: Handle merchant
    let merchant;
    let merchantCreated = false;
    let tags: string[] | undefined;

    if (curveTransaction.merchant) {
      const suggestion = await merchantManager.getMerchantSuggestions(curveTransaction.merchant);
      if (suggestion?.tag) {
        tags = suggestion.tag;
      }
      if (suggestion && suggestion.merchant) {
        merchant = {
          id: suggestion.merchant,
          title: suggestion.payee,
        } as ZenMoneyMerchant;
      } else {
        const existingMerchant = await merchantManager.findOrCreateMerchant(
          curveTransaction.merchant,
          targetAccount.user,
        );

        if (existingMerchant) {
          merchant = existingMerchant;
          // Check if this is a newly created merchant
          const cachedMerchants = merchantManager.getCachedMerchants();
          merchantCreated = !cachedMerchants.some(
            (m: ZenMoneyMerchant) => m.id === existingMerchant.id,
          );
        }
      }
    }

    // Step 8: Convert currency if needed
    let conversionInfo;

    if (curveTransaction.currency !== curveTransaction.originalCurrency) {
      conversionInfo = currencyConverter.getConversionInfo(
        curveTransaction.originalAmount,
        curveTransaction.originalCurrency,
        curveTransaction.currency,
      );
    }

    // Step 9: Map transaction
    const zenMoneyTransaction = await transactionMapper.mapTransaction(
      curveTransaction,
      targetAccount,
      merchant,
      tags,
    );

    if (executionConfig.dryRun) {
      return {
        success: true,
        message: "Dry run completed successfully - transaction was not actually created",
        transactionId: zenMoneyTransaction.id,
        details: {
          merchant: merchant
            ? {
                id: merchant.id,
                name: merchant.title,
                created: merchantCreated,
              }
            : undefined,
          conversion: conversionInfo,
          warnings: validationResult.warnings,
        },
      };
    }

    // Step 10: Create transaction in ZenMoney
    await ErrorHandler.withRetry(
      () => apiClient.createTransaction(zenMoneyTransaction),
      executionConfig.retryAttempts || 3,
      1000,
    );

    return {
      success: true,
      message: "Transaction created successfully in ZenMoney",
      transactionId: zenMoneyTransaction.id,
      details: {
        merchant: merchant
          ? {
              id: merchant.id,
              name: merchant.title,
              created: merchantCreated,
            }
          : undefined,
        conversion: conversionInfo,
        warnings: validationResult.warnings,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: ErrorHandler.createUserMessage(error as Error),
      error: {
        type: (error as Error).name,
        message: (error as Error).message,
        code: error instanceof ZenMoneyApiError ? error.code : undefined,
      },
    };
  }
}

/**
 * Utility function to validate configuration
 */
export async function validateConfiguration(config: ScriptExecutionConfig): Promise<{
  isValid: boolean;
  errors: string[];
  accountInfo?: any;
  instrumentInfo?: any;
}> {
  try {
    const windmillConfig: WindmillConfig = {
      accessToken: config.accessToken,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      apiBaseUrl: config.apiBaseUrl || "https://api.zenmoney.ru",
      defaultAccountId: config.defaultAccountId,
      defaultCurrencyId: config.defaultCurrencyId,
      autoCreateMerchants: config.autoCreateMerchants ?? true,
      defaultTags: config.defaultTags,
    };

    const apiClient = new ZenMoneyApiClient(windmillConfig);

    // Test connection
    const isConnected = await apiClient.initLoad();
    if (!isConnected) {
      return {
        isValid: false,
        errors: ["Failed to connect to ZenMoney API"],
      };
    }

    // Get account and currency info
    const [accounts, instruments] = await Promise.all([
      apiClient.getAccounts(),
      apiClient.getInstruments(),
    ]);

    const targetAccount = accounts.find((acc) => acc.id === config.defaultAccountId);
    const targetInstrument = instruments.find((inst) => inst.id === config.defaultCurrencyId);

    const errors: string[] = [];

    if (!targetAccount) {
      errors.push(`Account with ID ${config.defaultAccountId} not found`);
    }

    if (!targetInstrument) {
      errors.push(`Currency instrument with ID ${config.defaultCurrencyId} not found`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      accountInfo: targetAccount
        ? {
            id: targetAccount.id,
            title: targetAccount.title,
            type: targetAccount.type,
            currency: targetAccount.instrument,
          }
        : undefined,
      instrumentInfo: targetInstrument
        ? {
            id: targetInstrument.id,
            title: targetInstrument.title,
            shortTitle: targetInstrument.shortTitle,
            symbol: targetInstrument.symbol,
          }
        : undefined,
    };
  } catch (error) {
    return {
      isValid: false,
      errors: [ErrorHandler.createUserMessage(error as Error)],
    };
  }
}

// Default export for Windmill.dev
export default createZenMoneyTransaction;
