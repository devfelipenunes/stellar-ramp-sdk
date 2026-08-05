import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveStellarWallet } from "../src/adapters/stellar/live-stellar-wallet";

describe("createLiveStellarWallet", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("retorna o saldo USDC do issuer correto", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        balances: [
          { asset_code: "XLM" },
          { asset_code: "USDC", asset_issuer: "GISS", balance: "18.09090909" },
        ],
      }),
    });

    const wallet = createLiveStellarWallet({ horizonUrl: "https://h" });
    const bal = await wallet.getBalance("G-USER", "USDC:GISS");

    expect(bal).toBe("18.09090909");
    expect(fetchMock).toHaveBeenCalledWith("https://h/accounts/G-USER");
  });

  it("conta sem a moeda → 0; conta inexistente (404) → 0", async () => {
    const wallet = createLiveStellarWallet({ horizonUrl: "https://h" });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ balances: [{ asset_code: "XLM" }] }),
    });
    expect(await wallet.getBalance("G-USER", "USDC:GISS")).toBe("0");

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    });
    expect(await wallet.getBalance("G-MISSING", "USDC:GISS")).toBe("0");
  });
});
