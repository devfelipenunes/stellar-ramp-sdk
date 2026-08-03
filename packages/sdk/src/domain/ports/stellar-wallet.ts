import type { Amount } from "../entities/money";

/**
 * Port do lado Stellar (chain). Em modo mock, um adapter local resolve;
 * em live, adapters usam js-stellar-sdk + Horizon.
 * Necessário para: verificação de saldo (spec offramp), entrega de USDC
 * (spec onramp) e assinatura de burn.
 */
export interface StellarWallet {
  getUsdcBalance(pubkey: string, usdcAsset: string): Promise<Amount>;
  // Fase green: claimable balance (onramp), sign/submit burn (offramp),
  // pathfinding via Horizon /paths (ADR-006).
}
