import { describe, expect, it } from "vitest";
import { SqliteIdentityStore } from "../src/adapters/storage/sqlite-identity-store";
import type { Identity } from "../src/domain/entities/identity";

const ident = (): Identity => ({
  pubkey: "G-USER",
  providerId: "etherfuse",
  customerId: "cust-1",
  bankAccounts: [
    {
      bankAccountId: "b-1",
      providerId: "etherfuse",
      country: "BR",
      fiat: "BRL",
    },
  ],
  createdAt: "2026-08-04T00:00:00Z",
});

describe("SqliteIdentityStore", () => {
  it("salva e lê por (pubkey, providerId)", async () => {
    const store = new SqliteIdentityStore();
    await store.saveIdentity(ident());

    const got = await store.getIdentity("G-USER", "etherfuse");
    expect(got?.customerId).toBe("cust-1");
    expect(got?.bankAccounts).toHaveLength(1);
    expect(got?.bankAccounts[0]?.country).toBe("BR");
    store.close();
  });

  it("retorna undefined quando não existe", async () => {
    const store = new SqliteIdentityStore();
    expect(await store.getIdentity("G-X", "etherfuse")).toBeUndefined();
    store.close();
  });

  it("persiste em arquivo e reabre", async () => {
    const file = "/tmp/identity-store-test.db";
    const a = new SqliteIdentityStore(file);
    await a.saveIdentity(ident());
    a.close();

    const b = new SqliteIdentityStore(file);
    const got = await b.getIdentity("G-USER", "etherfuse");
    expect(got?.customerId).toBe("cust-1");
    b.close();
  });
});
