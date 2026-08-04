/**
 * Money amounts — always as decimal strings, never float.
 * Float corrupts monetary values (0.1 + 0.2 != 0.3). The SDK operates with
 * strings and converts at the provider/chain boundary.
 */
/**
 * ISO 4217 fiat code. Union gives autocomplete for the common values;
 * `(string & {})` keeps room for other fiats (runtime validation in providers).
 */
export type FiatCode = "BRL" | "MXN" | "USD" | "ARS" | (string & {});
export type CryptoCode = "USDC";
export type AssetCode = FiatCode | CryptoCode;
export type Amount = string; // decimal, ex: "100.00" | "1.174751"

export interface Money {
  readonly amount: Amount;
  readonly code: AssetCode;
}
