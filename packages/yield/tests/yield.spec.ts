import { describe, expect, it } from "vitest";
import { createYieldEngine } from "../src/application/yield-engine";
import { MockStablebondProvider } from "../src/adapters/mock/mock-stablebond-provider";

const allocation = { BR: "TESOURO", MX: "CETES", US: "USTRY" };
const engine = () =>
  createYieldEngine({
    mode: "mock",
    provider: new MockStablebondProvider(),
    allocation,
  });

const coerente = (tokens: string, nav: string, fiatValue: string) =>
  Math.abs(Number(tokens) * Number(nav) - Number(fiatValue)) < 0.01;

describe("autoPark — alocação por país (ADR-012)", () => {
  it("aloca USDC no stablebond do país (BR→TESOURO)", async () => {
    const pos = await engine().autoPark({ usdcAmount: "100", country: "BR" });

    expect(pos.code).toBe("TESOURO");
    expect(pos.fiat).toBe("BRL");
    expect(Number(pos.tokens)).toBeGreaterThan(0);
    expect(coerente(pos.tokens, pos.nav, pos.fiatValue)).toBe(true);
  });

  it("aloca MX→CETES e US→USTRY", async () => {
    const e = engine();
    await expect(
      e.autoPark({ usdcAmount: "50", country: "MX" }),
    ).resolves.toMatchObject({ code: "CETES" });
    await expect(
      e.autoPark({ usdcAmount: "50", country: "US" }),
    ).resolves.toMatchObject({ code: "USTRY" });
  });

  it("país sem alocação falha com no_allocation_for_country", async () => {
    await expect(
      engine().autoPark({ usdcAmount: "100", country: "AR" }),
    ).rejects.toMatchObject({
      code: "no_allocation_for_country",
    });
  });
});

describe("quote — conversão no NAV (spec yield.feature)", () => {
  it("retorna tokens, nav e fiatValue coerentes", async () => {
    const q = await engine().quote("TESOURO", "100");

    expect(q.code).toBe("TESOURO");
    expect(q.nav).toBe("1.23677");
    expect(Number(q.tokens)).toBeGreaterThan(0);
    expect(coerente(q.tokens, q.nav, q.fiatValue)).toBe(true);
  });

  it("stablebond não suportado falha com unsupported_bond", async () => {
    await expect(engine().quote("XYZ", "100")).rejects.toMatchObject({
      code: "unsupported_bond",
    });
  });
});

describe("balance — NAV ao vivo (ADR-010)", () => {
  it("fiatValue = tokens × NAV (nunca preço spot)", async () => {
    const e = engine();
    await e.autoPark({ usdcAmount: "100", country: "BR" });

    const [p] = await e.balance();
    expect(p!.code).toBe("TESOURO");
    expect(p!.fiat).toBe("BRL");
    expect(coerente(p!.tokens, p!.nav, p!.fiatValue)).toBe(true);
  });
});

describe("liquidate — just-in-time (ADR-011)", () => {
  it("converte stablebond→USDC e reduz a posição", async () => {
    const e = engine();
    await e.autoPark({ usdcAmount: "100", country: "BR" });

    const usdc = await e.liquidate({ code: "TESOURO", usdcAmount: "20" });
    expect(Number(usdc)).toBeGreaterThan(0);

    const totalTokens100 = (await e.quote("TESOURO", "100")).tokens;
    const [restante] = await e.balance();
    expect(Number(restante!.tokens)).toBeLessThan(Number(totalTokens100));
  });

  it("sem usdcAmount liquida tudo (volta ~100 USDC)", async () => {
    const e = engine();
    await e.autoPark({ usdcAmount: "100", country: "BR" });

    const usdc = await e.liquidate({ code: "TESOURO" });
    expect(Math.abs(Number(usdc) - 100)).toBeLessThan(0.01);
    expect(await e.balance()).toHaveLength(0);
  });
});

describe("mock determinístico (spec yield.feature)", () => {
  it("duas quotes idênticas → mesmo resultado", async () => {
    const a = await engine().quote("TESOURO", "100");
    const b = await engine().quote("TESOURO", "100");
    expect(a.tokens).toBe(b.tokens);
    expect(a.fiatValue).toBe(b.fiatValue);
  });
});
