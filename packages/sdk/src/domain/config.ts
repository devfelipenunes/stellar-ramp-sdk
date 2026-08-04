import type { RampProvider } from "./ports/ramp-provider";
import type { IdentityStore } from "./ports/identity-store";
import type { SecretProvider } from "./ports/secret-provider";
import type { StellarWallet } from "./ports/stellar-wallet";

export type RampMode = "mock" | "live";

export interface RampConfig {
  mode: RampMode;

  providers: RampProvider[];

  identityStore: IdentityStore;

  secretProvider?: SecretProvider;

  stellarWallet?: StellarWallet;
}
