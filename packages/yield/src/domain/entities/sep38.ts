
export interface Sep38Quote {
  id: string;
  expires_at: string;
  sell_asset: string;
  buy_asset: string;
  sell_amount: string;
  buy_amount: string;
  fee: string;
  price: string;
  total_price: string;
  context: "sep38-quote";
}
