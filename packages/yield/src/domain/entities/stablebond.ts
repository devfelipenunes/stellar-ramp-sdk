import type { Amount, FiatCode } from "./money";

export type StablebondCode = string;

export interface Stablebond {
  code: StablebondCode;

  asset: string;

  fiat: FiatCode;

  nav: Amount;

  apyPct?: number;
}

export interface Nav {
  code: StablebondCode;
  nav: Amount;
  updatedAt: string;
}
