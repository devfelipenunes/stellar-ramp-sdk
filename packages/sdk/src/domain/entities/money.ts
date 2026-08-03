/**
 * Montantes de dinheiro — sempre como string decimal, nunca float.
 * Float corrompe valores monetários (0.1 + 0.2 != 0.3). O SDK opera com
 * strings e converte no boundary com o provider/chain.
 */
export type FiatCode = string; // ISO 4217: "BRL" | "MXN" | "USD" | ...
export type CryptoCode = "USDC";
export type AssetCode = FiatCode | CryptoCode;
export type Amount = string; // decimal, ex: "100.00" | "1.174751"

export interface Money {
  readonly amount: Amount;
  readonly code: AssetCode;
}
