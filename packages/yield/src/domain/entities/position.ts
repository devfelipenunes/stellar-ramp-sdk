import type { Amount, FiatCode } from "./money";
import type { StablebondCode } from "./stablebond";

/** Posição de stablebond resultante de um autoPark (ADR-009). */
export interface BondPosition {
  providerId: string;
  code: StablebondCode;
  tokens: Amount;
  nav: Amount;
  /** tokens × nav — valor em fiat (ADR-010, nunca preço spot). */
  fiatValue: Amount;
  fiat: FiatCode;
  createdAt: string;
}

/** Saldo rendendo, exibido ao vivo via NAV polling. */
export interface YieldBalance {
  code: StablebondCode;
  tokens: Amount;
  nav: Amount;
  fiatValue: Amount;
  fiat: FiatCode;
  updatedAt: string;
}

/** Quote de conversão USDC → stablebond no NAV atual. */
export interface BondQuote {
  code: StablebondCode;
  usdcAmount: Amount;
  tokens: Amount;
  nav: Amount;
  fiatValue: Amount;
  fiat: FiatCode;
}
