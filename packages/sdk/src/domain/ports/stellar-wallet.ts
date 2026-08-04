import type { Amount } from "../entities/money";

export interface StellarWallet {
  getUsdcBalance(pubkey: string, usdcAsset: string): Promise<Amount>;

}
