import type { CountryCode } from "./country";
import type { Amount, FiatCode } from "./money";

export type OrderDirection = "onramp" | "offramp";

/**
 * Cadeia de status observada nos providers:
 * - onramp: created → funded (depósito fiat detectado) → completed (USDC entregue)
 * - offramp: created → funded (burn confirmado) → completed → finalized (payout feito)
 * - created → expired|cancelled quando o depósito/burn nunca confirma
 */
export type OrderStatus =
  "created" | "funded" | "completed" | "finalized" | "expired" | "cancelled";

export interface BurnTransaction {
  envelopeXdr: string;
  expiresAt: string; // ISO — pode expirar; regenerável (spec offramp)
  orderId: string;
}

export interface Order {
  /** orderId do provider (campo varia por provider: orderId/id/order_id). */
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
  /** Página de acompanhamento do provider (sandbox). */
  statusPageUrl?: string;
  /** offramp: burn solicitado pelo provider. */
  burnTransaction?: BurnTransaction;
}
