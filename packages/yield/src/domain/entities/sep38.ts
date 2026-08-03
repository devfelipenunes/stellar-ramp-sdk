/**
 * Formato de quote SEP-38 (Stellar Anchor — asset identification + quotes).
 * Campos seguem a spec SEP-38; amounts com 7 casas decimais.
 * A pesquisa identificou SEP-38 para stablebonds como "espaço aberto".
 */
export interface Sep38Quote {
  id: string;
  expires_at: string;
  sell_asset: string; // ex: "stellar:USDC:<issuer>"
  buy_asset: string; //  ex: "stellar:TESOURO:<issuer>"
  sell_amount: string; // 7 casas decimais
  buy_amount: string; // 7 casas decimais
  fee: string;
  price: string;
  total_price: string;
  context: "sep38-quote";
}
