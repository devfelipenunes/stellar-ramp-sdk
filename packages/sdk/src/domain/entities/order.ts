import type { CountryCode } from "./country";
import type { Amount, FiatCode } from "./money";

export type OrderDirection = "onramp" | "offramp";

export type OrderStatus =
  "created" | "funded" | "completed" | "finalized" | "expired" | "cancelled";

export interface EmbeddedWalletApproval {
  approvalMessageId: string;

  approvalMessage: string;

  summary: string;
}

export interface Order {

  id: string;
  providerId: string;
  direction: OrderDirection;
  country: CountryCode;
  fiat: FiatCode;
  fiatAmount: Amount;

  cryptoAmount: Amount;

  cryptoAsset: string;

  status: OrderStatus;
  createdAt: string;
  updatedAt: string;

  statusPageUrl?: string;

  approval?: EmbeddedWalletApproval;

  stellarClaimableBalanceId?: string;
}
