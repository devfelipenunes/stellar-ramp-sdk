import type { Amount, FiatCode } from "./money";
import type { StablebondCode } from "./stablebond";

/** Stablebond position resulting from an autoPark (ADR-009). */
export interface BondPosition {
  providerId: string;
  code: StablebondCode;
  tokens: Amount;
  nav: Amount;
  /** tokens × nav — fiat value (ADR-010, never spot price). */
  fiatValue: Amount;
  fiat: FiatCode;
  createdAt: string;
}

/** Yield-earning balance, shown live via NAV polling. */
export interface YieldBalance {
  code: StablebondCode;
  tokens: Amount;
  nav: Amount;
  fiatValue: Amount;
  fiat: FiatCode;
  updatedAt: string;
}

/** USDC → stablebond conversion quote at the current NAV. */
export interface BondQuote {
  code: StablebondCode;
  usdcAmount: Amount;
  tokens: Amount;
  nav: Amount;
  fiatValue: Amount;
  fiat: FiatCode;
}
