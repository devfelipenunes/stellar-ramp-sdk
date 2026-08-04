/**
 * SEP-38 quote format (Stellar Anchor — asset identification + quotes).
 * Fields follow the SEP-38 spec; amounts use 7 decimal places.
 * The research identified SEP-38 for stablebonds as an "open space".
 */
export interface Sep38Quote {
  id: string;
  expires_at: string;
  sell_asset: string; // e.g.: "stellar:USDC:<issuer>"
  buy_asset: string; //  e.g.: "stellar:TESOURO:<issuer>"
  sell_amount: string; // 7 decimal places
  buy_amount: string; // 7 decimal places
  fee: string;
  price: string;
  total_price: string;
  context: "sep38-quote";
}
