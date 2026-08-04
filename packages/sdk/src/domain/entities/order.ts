import type { CountryCode } from "./country";
import type { Amount, FiatCode } from "./money";

export type OrderDirection = "onramp" | "offramp";

export type OrderStatus =
  "created" | "funded" | "completed" | "finalized" | "expired" | "cancelled";

export interface BurnTransaction {
  envelopeXdr: string;
  expiresAt: string;
  orderId: string;
}

export interface Order {

  id: string;
  providerId: string;
  direction: OrderDirection;
  country: CountryCode;
  fiat: FiatCode;
  fiatAmount: Amount;
  usdcAmount: Amount;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;

  statusPageUrl?: string;

  burnTransaction?: BurnTransaction;
}
