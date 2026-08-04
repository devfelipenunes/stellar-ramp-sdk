import type { Amount } from "../entities/money";

/**
 * Stellar (chain) port. In mock mode, a local adapter resolves it;
 * in live, adapters use js-stellar-sdk + Horizon.
 * Needed for: balance checks (offramp spec), USDC delivery (onramp spec),
 * and burn signing.
 */
export interface StellarWallet {
  getUsdcBalance(pubkey: string, usdcAsset: string): Promise<Amount>;
  // Green phase: claimable balance (onramp), sign/submit burn (offramp),
  // pathfinding via Horizon /paths (ADR-006).
}
