import type { Amount } from "../entities/money";

export interface StellarWallet {
  getBalance(pubkey: string, assetCode: string): Promise<Amount>;
}
