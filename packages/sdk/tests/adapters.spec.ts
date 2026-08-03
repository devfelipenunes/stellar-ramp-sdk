import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEtherfuseProvider } from "../src/adapters/etherfuse/etherfuse-provider";
import { MockProvider } from "../src/adapters/mock/mock-provider";
import type { QuoteRequest } from "../src/domain/entities/quote";
import type { SecretProvider } from "../src/domain/ports/secret-provider";

/**
 * Testes dos adapters (green por construção) — spec mock-mode.feature +
 * transporte Etherfuse (playbook §1–2).
 */
describe("MockProvider — determinístico e realista (spec mock-mode.feature)", () => {
  const mock = new MockProvider();

  it("quote onramp é determinístico com taxa na faixa realista", async () => {
    const req: QuoteRequest = {
      direction: "onramp",
      country: "BR",
      fiat: "BRL",
      fiatAmount: "100",
    };
    const a = await mock.quote(req);
    const b = await mock.quote(req);

    expect(a.usdcAmount).toBe(b.usdcAmount);
    expect(a.fee).toBe(b.fee);
    expect(a.feeBps).toBeGreaterThanOrEqual(0);
    expect(a.feeBps).toBeLessThanOrEqual(150); // faixa Etherfuse 0.25–1.5%
    expect(Number(a.usdcAmount)).toBeGreaterThan(0);
    expect(Number(a.fee)).toBeGreaterThan(0);
  });

  it("quote offramp calcula fiatReceive a partir do USDC líquido", async () => {
    const q = await mock.quote({
      direction: "offramp",
      country: "MX",
      fiat: "MXN",
      usdcAmount: "200",
    });
    // fee 25bps = 0.50 USDC → net 199.50 → × 18 = 3591 MXN
    expect(q.fiatAmount).toBe("3591");
    expect(q.feeBps).toBe(25);
  });

  it("moeda sem taxa falha com unsupported_fiat", async () => {
    await expect(
      mock.quote({
        direction: "onramp",
        country: "BR",
        fiat: "EUR",
        fiatAmount: "100",
      }),
    ).rejects.toMatchObject({ code: "unsupported_fiat" });
  });
});

describe("EtherfuseProvider — transporte (playbook §1–2)", () => {
  const fetchMock = vi.fn();
  let provider: ReturnType<typeof createEtherfuseProvider>;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    const secrets: SecretProvider = { get: async () => "api_sand_abc123" };
    provider = createEtherfuseProvider({
      baseUrl: "https://api.sand.etherfuse.com",
      environment: "sandbox",
      countries: ["MX"],
      secrets,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("envia auth SEM 'Bearer' (playbook §1)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ onramp: { orderId: "o1", status: "created" } }),
    });

    await provider.getOrder("o1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.sand.etherfuse.com");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "api_sand_abc123",
    );
  });

  it("rejeita quote sandbox acima do cap 500 MXN sem chamar rede (playbook §2)", async () => {
    await expect(
      provider.quote({
        direction: "onramp",
        country: "MX",
        fiat: "MXN",
        fiatAmount: "600",
      }),
    ).rejects.toMatchObject({ code: "sandbox_quote_limit" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
