import type { RampProvider } from "./ports/ramp-provider";
import type { IdentityStore } from "./ports/identity-store";
import type { SecretProvider } from "./ports/secret-provider";
import type { StellarWallet } from "./ports/stellar-wallet";

/**
 * mock: adapter MockProvider com taxas realistas, sem rede (ADR-004).
 * live: providers reais (Etherfuse/Koywe/Manteca) com keys via SecretProvider.
 */
export type RampMode = "mock" | "live";

export interface RampConfig {
  mode: RampMode;
  /** Em modo "live", o router escolhe entre estes por país (ADR-002). */
  providers: RampProvider[];
  /** Persistência de identidade (ADR-005). */
  identityStore: IdentityStore;
  /** Keys dos adapters — server-side only (ADR-007). */
  secretProvider?: SecretProvider;
  /** Acesso à chain Stellar (saldo/entrega/burn). */
  stellarWallet?: StellarWallet;
}
