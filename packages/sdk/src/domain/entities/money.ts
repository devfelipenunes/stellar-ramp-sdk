
export type FiatCode = "BRL" | "MXN" | "USD" | "ARS" | (string & {});
export type CryptoCode = "USDC" | "TESOURO" | "CETES" | "USTRY" | (string & {});
export type AssetCode = FiatCode | CryptoCode;
export type Amount = string;

export interface Money {
  readonly amount: Amount;
  readonly code: AssetCode;
}
