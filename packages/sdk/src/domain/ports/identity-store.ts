import type { Identity } from "../entities/identity";

/**
 * Port de persistência de identidade (ADR-005). Chaveado por
 * (pubkey, providerId). Implementações: in-memory (demo), SQLite/Redis (server).
 */
export interface IdentityStore {
  getIdentity(
    pubkey: string,
    providerId: string,
  ): Promise<Identity | undefined>;
  saveIdentity(identity: Identity): Promise<void>;
}
