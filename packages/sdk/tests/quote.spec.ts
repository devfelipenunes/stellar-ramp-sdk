import { describe, expect, it } from "vitest";
import { createRamp } from "../src/application/ramp-service";
import { makeIdentityStore, makeProvider } from "./fixtures";

/**
 * TDD — spec quote.feature + router.feature.
 * FASE RED: createRamp ainda é stub → todas rejeitam not_implemented.
 * Cada teste descreve o contrato que a implementação green deve cumprir.
 */
describe("quote — roteamento por país (spec quote.feature)", () => {
  it("seleciona o provider que cobre o país do usuário", async () => {
    const koywe = makeProvider("koywe", ["BR"]);
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse, koywe],
      identityStore: makeIdentityStore(),
    });

    const q = await ramp.quote({
      direction: "onramp",
      country: "BR",
      fiat: "BRL",
      fiatAmount: "100",
    });

    expect(q.providerId).toBe("koywe");
    expect(q.fiat).toBe("BRL");
    expect(koywe.quote).toHaveBeenCalledOnce();
    expect(etherfuse.quote).not.toHaveBeenCalled();
  });

  it("país com múltiplos providers escolhe o de menor custo", async () => {
    const koywe = makeProvider("koywe", ["BR"], { feeBps: 50 });
    const manteca = makeProvider("manteca", ["BR"], { feeBps: 20 });
    const ramp = createRamp({
      mode: "live",
      providers: [koywe, manteca],
      identityStore: makeIdentityStore(),
    });

    const q = await ramp.quote({
      direction: "onramp",
      country: "BR",
      fiat: "BRL",
      fiatAmount: "100",
    });

    expect(q.providerId).toBe("manteca"); // feeBps 20 < 50
  });

  it("país sem cobertura falha com no_provider_for_country sem chamar rede", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
    });

    await expect(
      ramp.quote({
        direction: "onramp",
        country: "AR",
        fiat: "ARS",
        fiatAmount: "100",
      }),
    ).rejects.toMatchObject({ code: "no_provider_for_country" });
    expect(etherfuse.quote).not.toHaveBeenCalled();
  });
});

describe("router — failover (spec router.feature)", () => {
  it("provider fora do ar tem failover para o próximo do mesmo país", async () => {
    const koywe = makeProvider("koywe", ["BR"], { failQuote: true });
    const manteca = makeProvider("manteca", ["BR"]);
    const ramp = createRamp({
      mode: "live",
      providers: [koywe, manteca],
      identityStore: makeIdentityStore(),
    });

    const q = await ramp.quote({
      direction: "onramp",
      country: "BR",
      fiat: "BRL",
      fiatAmount: "100",
    });

    expect(q.providerId).toBe("manteca");
  });

  it("todos os providers de um país falharem agrega o erro all_providers_failed", async () => {
    const koywe = makeProvider("koywe", ["BR"], { failQuote: true });
    const manteca = makeProvider("manteca", ["BR"], { failQuote: true });
    const ramp = createRamp({
      mode: "live",
      providers: [koywe, manteca],
      identityStore: makeIdentityStore(),
    });

    await expect(
      ramp.quote({
        direction: "onramp",
        country: "BR",
        fiat: "BRL",
        fiatAmount: "100",
      }),
    ).rejects.toMatchObject({
      code: "all_providers_failed",
      details: { country: "BR" },
    });
  });
});
