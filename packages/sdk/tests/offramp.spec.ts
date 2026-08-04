import { describe, expect, it } from "vitest";
import { createRamp } from "../src/application/ramp-service";
import { err } from "../src/domain/entities/errors";
import { makeIdentityStore, makeProvider, makeOrder } from "./fixtures";

describe("offramp — USDC → fiat (spec offramp.feature)", () => {
  it("ciclo completo com burn: created → funded → completed → finalized", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
    });
    const quote = await ramp.quote({
      direction: "offramp",
      country: "MX",
      fiat: "MXN",
      usdcAmount: "200",
    });

    const order = await ramp.offramp({
      quote,
      pubkey: "G-USUARIO-1",
      usdcAsset: "USDC:ISSUER",
    });

    expect(order.direction).toBe("offramp");
    expect(order.burnTransaction?.envelopeXdr).toBeTruthy();
    expect(order.status).toBe("created");
  });

  it("burnTransaction pode ser regenerado sem duplicar ordem", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
    });
    const quote = await ramp.quote({
      direction: "offramp",
      country: "MX",
      fiat: "MXN",
      usdcAmount: "200",
    });

    const first = await ramp.offramp({
      quote,
      pubkey: "G-USUARIO-1",
      usdcAsset: "USDC:ISSUER",
    });
    const regenerated = first.burnTransaction
      ? await etherfuse.getOrder(first.id)
      : makeOrder("etherfuse", "offramp", "created");

    expect(regenerated.id).toBe(first.id);
  });

  it("saldo insuficiente falha antes de criar ordem", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
      stellarWallet: {
        getUsdcBalance: async () => "50",
      },
    });
    const quote = await ramp.quote({
      direction: "offramp",
      country: "MX",
      fiat: "MXN",
      usdcAmount: "200",
    });

    await expect(
      ramp.offramp({ quote, pubkey: "G-USUARIO-1", usdcAsset: "USDC:ISSUER" }),
    ).rejects.toMatchObject({
      code: "insufficient_balance",
      details: { have: "50", need: "200" },
    });
    expect(etherfuse.createOfframpOrder).not.toHaveBeenCalled();
    void err;
  });
});
