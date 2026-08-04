import type { Identity } from "../entities/identity";

export interface IdentityStore {
  getIdentity(
    pubkey: string,
    providerId: string,
  ): Promise<Identity | undefined>;
  saveIdentity(identity: Identity): Promise<void>;
}
