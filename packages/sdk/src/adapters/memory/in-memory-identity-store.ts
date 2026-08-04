import type { Identity } from "../../domain/entities/identity";
import type { IdentityStore } from "../../domain/ports/identity-store";

/**
 * In-memory IdentityStore (ADR-005) — for demo/mock. On the server, use
 * SQLite/Redis: the port is the same, only the implementation changes.
 */
export class InMemoryIdentityStore implements IdentityStore {
  private readonly map = new Map<string, Identity>();

  async getIdentity(
    pubkey: string,
    providerId: string,
  ): Promise<Identity | undefined> {
    return this.map.get(this.key(pubkey, providerId));
  }

  async saveIdentity(identity: Identity): Promise<void> {
    this.map.set(this.key(identity.pubkey, identity.providerId), identity);
  }

  private key(pubkey: string, providerId: string): string {
    return `${pubkey}:${providerId}`;
  }
}
