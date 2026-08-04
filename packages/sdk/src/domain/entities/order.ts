import type { CountryCode } from "./country";
import type { Amount, FiatCode } from "./money";

export type OrderDirection = "onramp" | "offramp";

/**
 * Status chain observed across providers:
 * - onramp: created → funded (fiat deposit detected) → completed (USDC delivered)
 * - offramp: created → funded (burn confirmed) → completed → finalized (payout done)
 * - created → expired|cancelled when the deposit/burn never confirms
 */
export type OrderStatus =
  "created" | "funded" | "completed" | "finalized" | "expired" | "cancelled";

export interface BurnTransaction {
  envelopeXdr: string;
  expiresAt: string; // ISO — can expire; regenerable (offramp spec)
  orderId: string;
}

export interface Order {
  /** Provider's orderId (field varies by provider: orderId/id/order_id). */
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
  /** Provider's tracking page (sandbox). */
  statusPageUrl?: string;
  /** offramp: burn requested by the provider. */
  burnTransaction?: BurnTransaction;
}
