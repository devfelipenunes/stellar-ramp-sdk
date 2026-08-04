import type { Amount, FiatCode } from "./money";
import type { StablebondCode } from "./stablebond";

export interface BondPosition {
  providerId: string;
  code: StablebondCode;
  tokens: Amount;
  nav: Amount;

  fiatValue: Amount;
  fiat: FiatCode;
  createdAt: string;
}

export interface YieldBalance {
  code: StablebondCode;
  tokens: Amount;
  nav: Amount;
  fiatValue: Amount;
  fiat: FiatCode;
  updatedAt: string;
}

export interface BondQuote {
  code: StablebondCode;
  usdcAmount: Amount;
  tokens: Amount;
  nav: Amount;
  fiatValue: Amount;
  fiat: FiatCode;
}
