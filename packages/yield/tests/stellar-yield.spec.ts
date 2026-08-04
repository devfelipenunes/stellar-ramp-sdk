import { describe, expect, it } from "vitest";
import { MockStablebondProvider } from "../src/adapters/mock/mock-stablebond-provider";
import { createStellarYield } from "../src/application/stellar-yield";

describe("createStellarYield — factory mock (DX)", () => {
  it("mode=mock monta engine funcional (autoPark BR→TESOURO + balance)", async () => {
    const engine = createStellarYield({ mode: "mock" });

    const pos = await engine.autoPark({ usdcAmount: "100", country: "BR" });
    expect(pos.code).toBe("TESOURO");
    expect(Number(pos.tokens)).toBeGreaterThan(0);

    const bal = await engine.balance();
    expect(bal).toHaveLength(1);
  });

  it("usa a allocation default (MX→CETES, US→USTRY)", async () => {
    const engine = createStellarYield({ mode: "mock" });

    expect(
      (await engine.autoPark({ usdcAmount: "100", country: "MX" })).code,
    ).toBe("CETES");
    expect(
      (await engine.autoPark({ usdcAmount: "100", country: "US" })).code,
    ).toBe("USTRY");
  });
});

describe("createStellarYield — validação fail-fast (live)", () => {
  it("live sem provider → erro na construção", () => {
    expect(() => createStellarYield({ mode: "live" } as never)).toThrow(
      /createStellarYield: modo live exige provider/,
    );
  });

  it("live sem allocation → erro na construção", () => {
    expect(() =>
      createStellarYield({
        mode: "live",
        provider: new MockStablebondProvider(),
      } as never),
    ).toThrow(/createStellarYield: modo live exige allocation/);
  });
});

describe("createStellarYield — live com provider e allocation", () => {
  it("autoPark funciona", async () => {
    const engine = createStellarYield({
      mode: "live",
      provider: new MockStablebondProvider(),
      allocation: { BR: "TESOURO", MX: "CETES", US: "USTRY" },
    });

    const pos = await engine.autoPark({ usdcAmount: "100", country: "BR" });
    expect(pos.code).toBe("TESOURO");
  });
});
