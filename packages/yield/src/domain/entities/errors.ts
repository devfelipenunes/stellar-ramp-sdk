
export type YieldErrorCode =
  | "no_allocation_for_country"
  | "unsupported_bond"
  | "no_nav_source_available"
  | "invalid_sep38_pair"
  | "not_implemented";

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
} as const;
