import type { Amount, FiatCode } from "./money";

/** Stablebond code (classic Stellar asset: `CODE:ISSUER`). */
export type StablebondCode = string; // "TESOURO" | "CETES" | "USTRY" | ...

export interface Stablebond {
  code: StablebondCode;
  /** Asset "CODE:ISSUER" on Stellar. */
  asset: string;
  /** NAV currency (fiat). */
  fiat: FiatCode;
  /** NAV of 1 token (ADR-010: yield = growing NAV, not rebasing). */
  nav: Amount;
  /** Reference APY (display). */
  apyPct?: number;
}

export interface Nav {
  code: StablebondCode;
  nav: Amount;
  updatedAt: string;
}
