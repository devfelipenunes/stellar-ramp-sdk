
export type YieldErrorCode =
  | "no_allocation_for_country"
  | "unsupported_bond"
  | "no_nav_source_available"
  | "invalid_sep38_pair"
  | "not_implemented"
  | "asset_not_found"
  | "invalid_webhook_signature"
  | "insufficient_balance_to_lock"
  | "insufficient_unlocked_balance"
  | "lock_not_found";

export class YieldError extends Error {
  readonly code: YieldErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: YieldErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "YieldError";
    this.code = code;
    this.details = details;
  }
}

export const yerr = {
  noAllocationForCountry: (country: string) =>
    new YieldError(
      "no_allocation_for_country",
      `No stablebond allocation for ${country}`,
      {
        country,
      },
    ),
  unsupportedBond: (code: string) =>
    new YieldError("unsupported_bond", `Unsupported stablebond: ${code}`, {
      code,
    }),
  noNavSourceAvailable: (code: string) =>
    new YieldError(
      "no_nav_source_available",
      `No NAV source available for ${code}`,
      { code },
    ),
  invalidSep38Pair: (reason: string) =>
    new YieldError("invalid_sep38_pair", `Invalid SEP-38 pair: ${reason}`, {
      reason,
    }),
  notImplemented: (feature: string) =>
    new YieldError(
      "not_implemented",
      `TDD red phase — pending implementation: ${feature}`,
      { feature },
    ),
  assetNotFound: (symbol: string) =>
    new YieldError("asset_not_found", `Asset not found: ${symbol}`, {
      symbol,
    }),
  invalidWebhookSignature: () =>
    new YieldError(
      "invalid_webhook_signature",
      "Invalid Etherfuse webhook signature",
    ),
  insufficientBalanceToLock: (code: string, tokens: string) =>
    new YieldError(
      "insufficient_balance_to_lock",
      `Insufficient balance to lock ${tokens} ${code}`,
      { code, tokens },
    ),
  insufficientUnlockedBalance: (code: string) =>
    new YieldError(
      "insufficient_unlocked_balance",
      `Insufficient unlocked balance for ${code}`,
      { code },
    ),
  lockNotFound: (lockId: string) =>
    new YieldError("lock_not_found", `Lock not found: ${lockId}`, {
      lockId,
    }),
} as const;
