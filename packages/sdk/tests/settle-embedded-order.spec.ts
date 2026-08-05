import { describe, expect, it, vi } from "vitest";
import {
  createEmbeddedWalletSigner,
  generateEmbeddedWalletKeyPair,
} from "../src/adapters/stellar/embedded-wallet-signer";
import { createRamp } from "../src/application/ramp-service";
import type { Order } from "../src/domain/entities/order";
import { makeIdentityStore, makeOrder, makeProvider } from "./fixtures";

const TEST_PRIVATE_KEY_PEM = generateEmbeddedWalletKeyPair().privateKeyPem;

function approvalOrder(overrides: Partial<Order> = {}): Order {
  return makeOrder("etherfuse", "onramp", "funded", {
    approval: {
      approvalMessageId: "am-1",
      approvalMessage: JSON.stringify({ timestampMs: String(Date.now()) }),
      summary: "Claim 19.49 USDC",
    },
    ...overrides,
  });
}

describe("settleEmbeddedOrder — poll + assina + submete + poll", () => {
  it("espera a aprovação aparecer (2 tentativas) e depois espera completar (2 tentativas)", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    etherfuse.getOrder = vi
      .fn()
      .mockResolvedValueOnce(makeOrder("etherfuse", "onramp", "created"))
      .mockResolvedValueOnce(approvalOrder())
      .mockResolvedValueOnce(approvalOrder({ status: "funded" }))
      .mockResolvedValueOnce(approvalOrder({ status: "completed" }));

    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
    });
    const quote = await ramp.quote({
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "100",
    });
    const order = await ramp.onramp({ quote, pubkey: "G-USUARIO-1" });

    const signer = createEmbeddedWalletSigner(TEST_PRIVATE_KEY_PEM);
    const settled = await ramp.settleEmbeddedOrder(order.id, signer, {
      pollIntervalMs: 1,
    });

    expect(settled.status).toBe("completed");
    expect(etherfuse.submitApproval).toHaveBeenCalledWith(
      order.id,
      expect.objectContaining({ approvalMessageId: "am-1" }),
    );
  });

  it("reconhece a ordem que completou sozinha antes da aprovação aparecer (corrida)", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    etherfuse.getOrder = vi
      .fn()
      .mockResolvedValueOnce(makeOrder("etherfuse", "onramp", "created"))
      .mockResolvedValueOnce(makeOrder("etherfuse", "onramp", "completed"));

    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
    });
    const quote = await ramp.quote({
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "100",
    });
    const order = await ramp.onramp({ quote, pubkey: "G-USUARIO-1" });

    const signer = createEmbeddedWalletSigner(TEST_PRIVATE_KEY_PEM);
    const settled = await ramp.settleEmbeddedOrder(order.id, signer, {
      pollIntervalMs: 1,
    });

    expect(settled.status).toBe("completed");
    expect(etherfuse.submitApproval).not.toHaveBeenCalled();
  });

  it("estoura timeout esperando a ordem completar depois de aprovada", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    etherfuse.getOrder = vi.fn().mockResolvedValue(approvalOrder({ status: "funded" }));

    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
    });
    const quote = await ramp.quote({
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "100",
    });
    const order = await ramp.onramp({ quote, pubkey: "G-USUARIO-1" });

    const signer = createEmbeddedWalletSigner(TEST_PRIVATE_KEY_PEM);
    await expect(
      ramp.settleEmbeddedOrder(order.id, signer, {
        pollIntervalMs: 1,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ code: "approval_timeout" });
  });
});

describe("provisionWallet / getOrder — casos de borda do RampService", () => {
  it("provisionWallet delega pro provider quando ele suporta embedded wallet", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    (etherfuse as unknown as { provisionWallet: unknown }).provisionWallet =
      vi.fn(async (signerPublicKeyPem: string) => ({
        walletId: "w-1",
        publicKey: `pub-for-${signerPublicKeyPem.length}`,
      }));
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
    });

    const { publicKeyPem } = generateEmbeddedWalletKeyPair();
    const w = await ramp.provisionWallet("etherfuse", publicKeyPem);
    expect(w.walletId).toBe("w-1");
  });

  it("provisionWallet falha claramente quando o provider não suporta embedded wallet", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
    });

    await expect(ramp.provisionWallet("etherfuse", "pem")).rejects.toThrow(
      /does not support embedded wallets/,
    );
  });

  it("getOrder falha com order_not_found quando nenhum provider reconhece o id", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    etherfuse.getOrder = vi.fn().mockRejectedValue(new Error("404"));
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
    });

    await expect(ramp.getOrder("no-such-order")).rejects.toMatchObject({
      code: "order_not_found",
    });
  });
});
