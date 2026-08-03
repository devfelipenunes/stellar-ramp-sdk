import { describe, expect, it } from "vitest";
import { createRamp } from "../src/application/ramp-service";
import { makeIdentityStore, makeProvider } from "./fixtures";

/**
 * TDD — spec mock-mode.feature + ADR-004.
 * FASE RED: createRamp é stub → modo mock ainda não isola de providers reais.
 */
describe("mock mode — demo determinística (spec mock-mode.feature)", () => {
  it("mode=mock não chama providers reais (quote resolve offline)", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    const koywe = makeProvider("koywe", ["BR"]);
    const ramp = createRamp({
      mode: "mock",
      providers: [etherfuse, koywe], // reais, mas não devem ser tocados
      identityStore: makeIdentityStore(),
    });

    const q = await ramp.quote({
      direction: "onramp",
      country: "BR",
      fiat: "BRL",
      fiatAmount: "100",
    });

    expect(etherfuse.quote).not.toHaveBeenCalled();
    expect(koywe.quote).not.toHaveBeenCalled();
    expect(q.feeBps).toBeGreaterThanOrEqual(0);
    expect(q.feeBps).toBeLessThanOrEqual(150); // faixa realista Etherfuse 0.25–1.5%
  });

  it("mock é determinístico: mesma entrada → mesmo resultado", async () => {
    const rampMock = () =>
      createRamp({
        mode: "mock",
        providers: [makeProvider("etherfuse", ["MX"])],
        identityStore: makeIdentityStore(),
      });

    const a = await rampMock().quote({
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "500",
    });
    const b = await rampMock().quote({
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "500",
    });

    expect(a.usdcAmount).toBe(b.usdcAmount);
    expect(a.fee).toBe(b.fee);
  });

  it("mock finaliza off-ramp sem tocar a chain", async () => {
    const ramp = createRamp({
      mode: "mock",
      providers: [makeProvider("etherfuse", ["MX"])],
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
    expect(["created", "funded", "completed", "finalized"]).toContain(
      order.status,
    );
  });

  it("alternar live↔mock não muda a interface da app (ADR-004)", () => {
    const live = createRamp({
      mode: "live",
      providers: [makeProvider("etherfuse", ["MX"])],
      identityStore: makeIdentityStore(),
    });
    const mock = createRamp({
      mode: "mock",
      providers: [makeProvider("etherfuse", ["MX"])],
      identityStore: makeIdentityStore(),
    });

    expect(Object.keys(live).sort()).toEqual(Object.keys(mock).sort());
    expect(typeof live.quote).toBe("function");
    expect(typeof mock.quote).toBe("function");
  });
});
