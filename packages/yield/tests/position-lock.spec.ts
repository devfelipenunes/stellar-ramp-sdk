import { describe, expect, it, vi } from "vitest";
import { createYieldEngine } from "../src/application/yield-engine";
import { MockStablebondProvider } from "../src/adapters/mock/mock-stablebond-provider";
import type { StablebondProvider } from "../src/domain/ports/stablebond-provider";

const allocation = { BR: "TESOURO", MX: "CETES", US: "USTRY" };
const engine = () =>
  createYieldEngine({
    mode: "mock",
    provider: new MockStablebondProvider(),
    allocation,
  });

function providerWithRisingNav(): StablebondProvider {
  const base = new MockStablebondProvider();
  return {
    ...base,
    getNav: vi
      .fn()
      .mockResolvedValueOnce({
        code: "TESOURO",
        nav: "1.23677",
        updatedAt: "t0",
      })
      .mockResolvedValue({ code: "TESOURO", nav: "1.25000", updatedAt: "t1" }),
    quote: base.quote.bind(base),
    swapUsdcToBond: base.swapUsdcToBond.bind(base),
    swapBondToUsdc: base.swapBondToUsdc.bind(base),
  };
}

describe("lock — reserva tokens de uma posição (spec position-lock.feature)", () => {
  it("trava tokens e reduz o saldo disponível", async () => {
    const e = engine();
    const pos = await e.autoPark({ usdcAmount: "100", country: "BR" });

    const lock = await e.lock({
      lockId: "ref-1",
      code: "TESOURO",
      tokens: "40",
    });

    expect(lock.lockId).toBe("ref-1");
    expect(lock.tokens).toBe("40");
    expect(lock.navAtLock).toBe("1.23677");
    expect(Number(lock.tokens)).toBeLessThan(Number(pos.tokens));
  });

  it("travar mais do que a posição total falha com insufficient_balance_to_lock", async () => {
    const e = engine();
    await e.autoPark({ usdcAmount: "100", country: "BR" });

    await expect(
      e.lock({ lockId: "ref-1", code: "TESOURO", tokens: "999" }),
    ).rejects.toMatchObject({ code: "insufficient_balance_to_lock" });
  });

  it("travar num bond sem posição falha com insufficient_balance_to_lock", async () => {
    await expect(
      engine().lock({ lockId: "ref-1", code: "TESOURO", tokens: "1" }),
    ).rejects.toMatchObject({ code: "insufficient_balance_to_lock" });
  });
});

describe("liquidate respeita locks ativos", () => {
  it("recusa liquidar tokens travados com insufficient_unlocked_balance", async () => {
    const e = engine();
    const pos = await e.autoPark({ usdcAmount: "100", country: "BR" });
    await e.lock({ lockId: "ref-1", code: "TESOURO", tokens: pos.tokens });

    await expect(
      e.liquidate({ code: "TESOURO", usdcAmount: "1" }),
    ).rejects.toMatchObject({ code: "insufficient_unlocked_balance" });
  });

  it("liquidate funciona normalmente dentro do saldo destravado", async () => {
    const e = engine();
    await e.autoPark({ usdcAmount: "100", country: "BR" });
    await e.lock({ lockId: "ref-1", code: "TESOURO", tokens: "40" });

    const usdc = await e.liquidate({ code: "TESOURO", usdcAmount: "5" });
    expect(Number(usdc)).toBeGreaterThan(0);
  });
});

describe("unlock — libera tokens e reporta o rendimento acumulado", () => {
  it("libera os tokens e calcula yieldAccrued = tokens × (navFinal − navInicial)", async () => {
    const e = createYieldEngine({
      mode: "mock",
      provider: providerWithRisingNav(),
      allocation,
    });
    await e.autoPark({ usdcAmount: "100", country: "BR" });
    const lock = await e.lock({
      lockId: "ref-1",
      code: "TESOURO",
      tokens: "40",
    });
    expect(lock.navAtLock).toBe("1.23677");

    const result = await e.unlock("ref-1");
    expect(result.tokensReleased).toBe("40");
    expect(Number(result.yieldAccrued)).toBeCloseTo(40 * (1.25 - 1.23677), 4);
  });

  it("destravar libera o saldo pra liquidate de novo", async () => {
    const e = engine();
    await e.autoPark({ usdcAmount: "100", country: "BR" });
    await e.lock({ lockId: "ref-1", code: "TESOURO", tokens: "75" });
    await e.unlock("ref-1");

    const usdc = await e.liquidate({ code: "TESOURO", usdcAmount: "50" });
    expect(Number(usdc)).toBeGreaterThan(0);
  });

  it("destravar um lockId inexistente falha com lock_not_found", async () => {
    await expect(engine().unlock("nunca-existiu")).rejects.toMatchObject({
      code: "lock_not_found",
    });
  });
});
