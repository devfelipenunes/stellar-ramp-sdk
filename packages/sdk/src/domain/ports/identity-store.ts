import type { Identity } from "../entities/identity";

/**
 * Identity persistence port (ADR-005). Keyed by (pubkey, providerId).
 * Implementations: in-memory (demo), SQLite/Redis (server).
 */
export interface IdentityStore {
  getIdentity(
    pubkey: string,
    providerId: string,
  ): Promise<Identity | undefined>;
  saveIdentity(identity: Identity): Promise<void>;
}
