import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEtherfuseNavSource } from "../src/adapters/etherfuse/etherfuse-nav-source";
import { createNavOracle } from "../src/application/nav-oracle";

/**
 * Fixture com o shape REAL do GET /lookup/stablebonds (confirmado 03/08/2026).
 */
const LOOKUP_FIXTURE = {
  calculatedAt: "2026-08-03T18:37:09.495Z",
  stablebonds: [
    { symbol: "TESOURO", tokenPriceDecimal: "1.236815", bondCurrency: "BRL" },
    { symbol: "CETES", tokenPriceDecimal: "1.174769", bondCurrency: "MXN" },
    { symbol: "USTRY", tokenPriceDecimal: "1.071279", bondCurrency: "USD" },
    { symbol: "GILTS", tokenPriceDecimal: "1.063857", bondCurrency: "GBP" },
  ],
};

describe("EtherfuseNavSource — NAV real público (/lookup/stablebonds)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lê o NAV real (tokenPriceDecimal) sem auth", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => LOOKUP_FIXTURE,
    });

    const nav = await createEtherfuseNavSource().getNav("TESOURO");

    expect(nav.nav).toBe("1.236815");
    expect(nav.updatedAt).toBeTruthy();
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://api.etherfuse.com/lookup/stablebonds",
    );
  });

  it("símbolo ausente no lookup → unsupported_bond", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => LOOKUP_FIXTURE,
    });

    await expect(
      createEtherfuseNavSource().getNav("XYZ"),
    ).rejects.toMatchObject({
      code: "unsupported_bond",
    });
  });

  it("cache de 5min: 2 chamadas → 1 fetch", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => LOOKUP_FIXTURE,
    });

    const src = createEtherfuseNavSource();
    await src.getNav("CETES");
    await src.getNav("CETES");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await src.getNav("CETES")).nav).toBe("1.174769");
  });

  it("HTTP de erro → rejeita", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(createEtherfuseNavSource().getNav("TESOURO")).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it("integra no NavOracle: fonte real + fontes locais → mediana robusta", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => LOOKUP_FIXTURE,
    });

    const oracle = createNavOracle([
      createEtherfuseNavSource(),
      {
        id: "mock-a",
        getNav: async () => ({
          code: "TESOURO",
          nav: "1.236815",
          updatedAt: "t",
        }),
      },
      {
        id: "mock-b",
        getNav: async () => ({
          code: "TESOURO",
          nav: "1.23690",
          updatedAt: "t",
        }),
      },
    ]);

    const res = await oracle.getNav("TESOURO");

    expect(res.nav.nav).toBe("1.236815");
    expect(res.outliers).toHaveLength(0);
  });
});
