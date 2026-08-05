import { describe, expect, it } from "vitest";
import { MockProvider } from "../src/adapters/mock/mock-provider";
import {
  createEmbeddedWalletSigner,
  generateEmbeddedWalletKeyPair,
} from "../src/adapters/stellar/embedded-wallet-signer";
import { createRamp } from "../src/application/ramp-service";
import { makeIdentityStore, makeProvider } from "./fixtures";

const TEST_PRIVATE_KEY_PEM = generateEmbeddedWalletKeyPair().privateKeyPem;

describe("offramp — cripto → fiat, via embedded wallet (spec offramp.feature)", () => {
  it("ciclo completo: created → funded (aprovação pendente) → completed", async () => {
    const etherfuse = new MockProvider({ id: "etherfuse", countries: ["MX"] });
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
    });
    const quote = await ramp.quote({
      direction: "offramp",
      country: "MX",
      fiat: "MXN",
      cryptoAmount: "200",
      cryptoAsset: "TESOURO:ISSUER",
    });

    const order = await ramp.offramp({ quote, pubkey: "G-USUARIO-1" });
    expect(order.direction).toBe("offramp");
    expect(order.status).toBe("created");
    expect(order.approval).toBeUndefined();

    await etherfuse.simulateFiatDeposit(order.id);

    const signer = createEmbeddedWalletSigner(TEST_PRIVATE_KEY_PEM);
    const settled = await ramp.settleEmbeddedOrder(order.id, signer, {
      pollIntervalMs: 1,
    });

    expect(settled.status).toBe("completed");
  });

  it("settleEmbeddedOrder estoura timeout se a aprovação nunca aparece", async () => {
    const etherfuse = new MockProvider({ id: "etherfuse", countries: ["MX"] });
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
    });
    const quote = await ramp.quote({
      direction: "offramp",
      country: "MX",
      fiat: "MXN",
      cryptoAmount: "200",
    });
    const order = await ramp.offramp({ quote, pubkey: "G-USUARIO-1" });

    const signer = createEmbeddedWalletSigner(TEST_PRIVATE_KEY_PEM);

    await expect(
      ramp.settleEmbeddedOrder(order.id, signer, {
        pollIntervalMs: 1,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ code: "approval_timeout" });
  });

  it("saldo insuficiente falha antes de criar ordem", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
      stellarWallet: {
        getBalance: async () => "50",
      },
    });
    const quote = await ramp.quote({
      direction: "offramp",
      country: "MX",
      fiat: "MXN",
      cryptoAmount: "200",
    });

    await expect(
      ramp.offramp({ quote, pubkey: "G-USUARIO-1" }),
    ).rejects.toMatchObject({
      code: "insufficient_balance",
      details: { have: "50", need: "200" },
    });
    expect(etherfuse.createOfframpOrder).not.toHaveBeenCalled();
  });
});
