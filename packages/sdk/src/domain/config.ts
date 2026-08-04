import type { RampProvider } from "./ports/ramp-provider";
import type { IdentityStore } from "./ports/identity-store";
import type { SecretProvider } from "./ports/secret-provider";
import type { StellarWallet } from "./ports/stellar-wallet";

/**
 * mock: MockProvider adapter with realistic rates, no network (ADR-004).
 * live: real providers (Etherfuse/Koywe/Manteca) with keys via SecretProvider.
 */
export type RampMode = "mock" | "live";

export interface RampConfig {
  mode: RampMode;
  /** In "live" mode, the router picks among these per country (ADR-002). */
  providers: RampProvider[];
  /** Identity persistence (ADR-005). */
  identityStore: IdentityStore;
  /** Adapter keys — server-side only (ADR-007). */
  secretProvider?: SecretProvider;
  /** Stellar chain access (balance/delivery/burn). */
  stellarWallet?: StellarWallet;
}
