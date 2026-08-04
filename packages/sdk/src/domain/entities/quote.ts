import type { CountryCode } from "./country";
import type { Amount, FiatCode } from "./money";

export type QuoteDirection = "onramp" | "offramp";

export interface QuoteRequest {
  direction: QuoteDirection;
  /** User's country — provider selection driver (ADR-002). */
  country: CountryCode;
  fiat: FiatCode;
  /**
   * onramp: how much fiat the user sends (required).
   * offramp: ignored (uses `usdcAmount`).
   */
  fiatAmount?: Amount;
  /**
   * offramp: how much USDC the user sends (required).
   * onramp: ignored.
   */
  usdcAmount?: Amount;
  /**
   * User's Stellar wallet — it is the quote `wallet` in the Etherfuse API.
   * Required for a real provider (the API requires the org to exist before
   * quoting); mock/demo don't need it.
   */
  pubkey?: string;
  /**
   * User's organizationId (ADR-005) — filled by RampService when the quote
   * runs with an identity. Not a field of the end user.
   */
  customerId?: string;
}

export interface Quote {
  /**
   * Real quote id in the API (Etherfuse). The order references this id (2-pass:
   * quote → order). RampService quotes fresh on onramp/offramp to guarantee it.
   */
  quoteId: string;
  providerId: string;
  direction: QuoteDirection;
  country: CountryCode;
  fiat: FiatCode;
  /** Fiat amount involved (in on onramp, out on offramp). */
  fiatAmount: Amount;
  /** USDC amount involved (out on onramp, in on offramp). */
  usdcAmount: Amount;
  /** Fee in basis points (0.25% = 25). */
  feeBps: number;
  /** Fee in the currency of the input leg (fiat on onramp, USDC on offramp). */
  fee: Amount;
  createdAt: string; // ISO 8601
}
