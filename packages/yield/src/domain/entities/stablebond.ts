import type { Amount, FiatCode } from "./money";

/** Código do Stablebond (asset clássico no Stellar: `CODE:ISSUER`). */
export type StablebondCode = string; // "TESOURO" | "CETES" | "USTRY" | ...

export interface Stablebond {
  code: StablebondCode;
  /** Asset "CODE:ISSUER" no Stellar. */
  asset: string;
  /** Moeda do NAV (fiat). */
  fiat: FiatCode;
  /** NAV de 1 token (ADR-010: yield = NAV crescente, não rebase). */
  nav: Amount;
  /** APY de referência (exibição). */
  apyPct?: number;
}

export interface Nav {
  code: StablebondCode;
  nav: Amount;
  updatedAt: string;
}
