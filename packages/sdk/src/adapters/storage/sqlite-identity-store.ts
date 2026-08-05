import { createRequire } from "node:module";
import type { Identity } from "../../domain/entities/identity";
import type { IdentityStore } from "../../domain/ports/identity-store";

const require = createRequire(process.cwd() + "/");
type Db = InstanceType<typeof import("node:sqlite").DatabaseSync>;

export class SqliteIdentityStore implements IdentityStore {
  private readonly db: Db;

  constructor(filename = ":memory:") {
    const { DatabaseSync } =
      require("node:sqlite") as typeof import("node:sqlite");
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS identities (
        pubkey TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        bank_accounts TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (pubkey, provider_id)
      )
    `);
  }

  getIdentity(
    pubkey: string,
    providerId: string,
  ): Promise<Identity | undefined> {
    const row = this.db
      .prepare("SELECT * FROM identities WHERE pubkey = ? AND provider_id = ?")
      .get(pubkey, providerId) as
      | {
          pubkey: string;
          provider_id: string;
          customer_id: string;
          bank_accounts: string;
          created_at: string;
        }
      | undefined;
    if (!row) return Promise.resolve(undefined);
    return Promise.resolve({
      pubkey: row.pubkey,
      providerId: row.provider_id,
      customerId: row.customer_id,
      bankAccounts: JSON.parse(row.bank_accounts),
      createdAt: row.created_at,
    });
  }

  saveIdentity(identity: Identity): Promise<void> {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO identities (pubkey, provider_id, customer_id, bank_accounts, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        identity.pubkey,
        identity.providerId,
        identity.customerId,
        JSON.stringify(identity.bankAccounts),
        identity.createdAt,
      );
    return Promise.resolve();
  }

  close(): void {
    this.db.close();
  }
}
