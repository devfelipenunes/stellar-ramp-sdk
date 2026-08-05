import type { CountryCode } from "./country";
import type { Amount, FiatCode } from "./money";

export type QuoteDirection = "onramp" | "offramp";

export interface QuoteRequest {
  direction: QuoteDirection;

  country: CountryCode;
  fiat: FiatCode;

  fiatAmount?: Amount;

  cryptoAmount?: Amount;

  cryptoAsset?: string;

  pubkey?: string;

  walletAddress?: string;

  customerId?: string;
}

export interface Quote {

  quoteId: string;
  providerId: string;
  direction: QuoteDirection;
  country: CountryCode;
  fiat: FiatCode;

  fiatAmount: Amount;

  cryptoAmount: Amount;

  cryptoAsset: string;

  feeBps: number;

  fee: Amount;
  createdAt: string;
}
