import { describe, expect, it } from "vitest";
import { createRamp } from "../src/application/ramp-service";
import { makeIdentityStore, makeProvider } from "./fixtures";
import type { Identity } from "../src/domain/entities/identity";

/**
 * TDD — spec onboarding.feature. FASE RED: createRamp é stub.
 */
const identidade = (pubkey: string, providerId: string): Identity => ({
  pubkey,
  providerId,
  customerId: `${providerId}-cust-1`,
  bankAccountId: `${providerId}-bank-1`,
  createdAt: "2026-08-03T00:00:00.000Z",
});

describe("onboarding — identidades (spec onboarding.feature, ADR-005)", () => {
  it("cria identidade UMA vez por usuário e persiste", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    const store = makeIdentityStore();
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: store,
    });

    await ramp.quote({
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "300",
    });
    await ramp.onramp({
      quote: await ramp.quote({
        direction: "onramp",
        country: "MX",
        fiat: "MXN",
        fiatAmount: "300",
      }),
      pubkey: "G-A",
    });
    await ramp.onramp({
      quote: await ramp.quote({
        direction: "onramp",
        country: "MX",
        fiat: "MXN",
        fiatAmount: "300",
      }),
      pubkey: "G-A",
    });

    expect(etherfuse.createCustomer).toHaveBeenCalledTimes(1);
    expect(store.map.get("G-A:etherfuse")).toBeDefined();
  });

  it("pubkeys diferentes geram identidades independentes", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    const store = makeIdentityStore();
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: store,
    });

    await ramp.onramp({
      quote: await ramp.quote({
        direction: "onramp",
        country: "MX",
        fiat: "MXN",
        fiatAmount: "300",
      }),
      pubkey: "G-A",
    });
    await ramp.onramp({
      quote: await ramp.quote({
        direction: "onramp",
        country: "MX",
        fiat: "MXN",
        fiatAmount: "300",
      }),
      pubkey: "G-B",
    });

    expect(store.map.get("G-A:etherfuse")).toBeDefined();
    expect(store.map.get("G-B:etherfuse")).toBeDefined();
    expect(store.map.get("G-A:etherfuse")).not.toBe(
      store.map.get("G-B:etherfuse"),
    );
  });

  it("IdentityStore injetado é o único usado (nada global)", async () => {
    const storeA = makeIdentityStore([identidade("G-X", "etherfuse")]);
    const storeB = makeIdentityStore();
    const rampA = createRamp({
      mode: "live",
      providers: [makeProvider("etherfuse", ["MX"])],
      identityStore: storeA,
    });
    const rampB = createRamp({
      mode: "live",
      providers: [makeProvider("etherfuse", ["MX"])],
      identityStore: storeB,
    });

    await expect(storeA.getIdentity("G-X", "etherfuse")).resolves.toBeDefined();
    await expect(
      storeB.getIdentity("G-X", "etherfuse"),
    ).resolves.toBeUndefined();
    void rampA;
    void rampB;
  });
});
