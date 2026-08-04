/** Domain error codes — contracted in the Gherkin specs. */
export type RampErrorCode =
  | "no_provider_for_country"
  | "all_providers_failed"
  | "sandbox_quote_limit"
  | "insufficient_balance"
  | "identity_not_found"
  | "quote_requires_customer"
  | "bank_account_details_required"
  | "bank_account_details_invalid"
  | "bank_account_response_unrecognized"
  | "order_not_found"
  | "unsupported_fiat"
  | "not_implemented";

export class RampError extends Error {
  readonly code: RampErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: RampErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RampError";
    this.code = code;
    this.details = details;
  }
}

export const err = {
  noProviderForCountry: (country: string) =>
    new RampError(
      "no_provider_for_country",
      `No provider covers country ${country}`,
      { country },
    ),
  allProvidersFailed: (country: string, causes: unknown[]) =>
    new RampError(
      "all_providers_failed",
      `All providers failed for ${country}`,
      {
        country,
        causes,
      },
    ),
  sandboxQuoteLimit: (limit: string) =>
    new RampError(
      "sandbox_quote_limit",
      `Quote above the sandbox limit (${limit})`,
      { limit },
    ),
  insufficientBalance: (have: string, need: string) =>
    new RampError(
      "insufficient_balance",
      `Insufficient balance: have ${have}, need ${need}`,
      {
        have,
        need,
      },
    ),
  identityNotFound: (pubkey: string, providerId: string) =>
    new RampError(
      "identity_not_found",
      `Identity not found for ${pubkey}@${providerId}`,
      {
        pubkey,
        providerId,
      },
    ),
  quoteRequiresCustomer: () =>
    new RampError(
      "quote_requires_customer",
      "A real quote requires the user's pubkey (the SDK creates/reuses the organization before quoting)",
    ),
  bankAccountDetailsRequired: (country: string) =>
    new RampError(
      "bank_account_details_required",
      `Bank account details (${country}) required on first onboarding`,
      { country },
    ),
  bankAccountDetailsInvalid: (problems: string[]) =>
    new RampError(
      "bank_account_details_invalid",
      `Invalid bank account details: ${problems.join("; ")}`,
      { problems },
    ),
  bankAccountResponseUnrecognized: (path: string) =>
    new RampError(
      "bank_account_response_unrecognized",
      `Response of ${path} without a recognizable bankAccountId — confirm the sandbox shape`,
      { path },
    ),
  orderNotFound: (orderId: string) =>
    new RampError("order_not_found", `Order not found: ${orderId}`, {
      orderId,
    }),
  notImplemented: (feature: string) =>
    new RampError(
      "not_implemented",
      `TDD red phase — pending implementation: ${feature}`,
      { feature },
    ),
} as const;
