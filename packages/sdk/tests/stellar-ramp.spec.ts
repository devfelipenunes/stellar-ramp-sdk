import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEnvSecretProvider } from "../src/adapters/memory/env-secret-provider";
import { MockProvider } from "../src/adapters/mock/mock-provider";
import type { RampProvider } from "../src/domain/ports/ramp-provider";
import { createStellarRamp } from "../src/application/stellar-ramp";

describe("createStellarRamp — factory mock (DX)", () => {
  it("mode=mock monta um RampService funcional sem config extra", async () => {
    const ramp = createStellarRamp({ mode: "mock" });

    const q = await ramp.quote({
      direction: "onramp",
      country: "BR",
      fiat: "BRL",
      fiatAmount: "100",
    });

    expect(q.providerId).toBe("mock");
    expect(Number(q.cryptoAmount)).toBeGreaterThan(0);
    expect(Number(q.fee)).toBeGreaterThan(0);
  });

  it("quote é determinístico em duas instâncias mock", async () => {
    const a = await createStellarRamp({ mode: "mock" }).quote({
      direction: "onramp",
      country: "BR",
      fiat: "BRL",
      fiatAmount: "100",
    });
    const b = await createStellarRamp({ mode: "mock" }).quote({
      direction: "onramp",
      country: "BR",
      fiat: "BRL",
      fiatAmount: "100",
    });

    expect(a.cryptoAmount).toBe(b.cryptoAmount);
    expect(a.fee).toBe(b.fee);
  });

  it("mock honra as opções do MockProvider (countries)", async () => {
    const ramp = createStellarRamp({
      mode: "mock",
      mock: { countries: ["BR"] },
    });

    await expect(
      ramp.quote({
        direction: "onramp",
        country: "AR",
        fiat: "ARS",
        fiatAmount: "100",
      }),
    ).rejects.toMatchObject({ code: "no_provider_for_country" });

    const q = await ramp.quote({
      direction: "onramp",
      country: "BR",
      fiat: "BRL",
      fiatAmount: "100",
    });
    expect(q.providerId).toBe("mock");
  });
});

describe("createStellarRamp — validação fail-fast (live)", () => {
  it("live sem providers e sem etherfuse → erro na construção", () => {
    expect(() => createStellarRamp({ mode: "live" })).toThrow(
      /createStellarRamp: modo live exige ao menos um provider/,
    );
  });

  it("live com etherfuse sem apiKey e sem apiKeyEnv → erro", () => {
    expect(() =>
      createStellarRamp({
        mode: "live",
        etherfuse: { environment: "sandbox" },
      }),
    ).toThrow(/etherfuse\.apiKey ou etherfuse\.apiKeyEnv/);
  });
});

describe("createStellarRamp — live com etherfuse (fetch mock)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function mockChain() {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/ramp/organization")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            organizationId: "org-1",
            displayName: "X",
            accountType: "business",
          }),
        };
      }
      if (url.includes("/ramp/quote")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            quoteId: "q-1",
            sourceAmount: "100",
            destinationAmount: "17.31",
            feeBps: "20",
            feeAmount: "0.20",
            createdAt: "2026-08-04T00:00:00Z",
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  }

  it("apiKeyEnv: lê a chave da env e usa o baseUrl do sandbox", async () => {
    vi.stubEnv("EF_KEY", "api_sand_abc123");
    mockChain();
    const ramp = createStellarRamp({
      mode: "live",
      etherfuse: {
        environment: "sandbox",
        countries: ["MX"],
        apiKeyEnv: "EF_KEY",
      },
    });

    const q = await ramp.quote({
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "300",
      pubkey: "G-X",
    });

    expect(q.providerId).toBe("etherfuse");
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("api.sand.etherfuse.com");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "api_sand_abc123",
    );
  });

  it("apiKey inline: usa a chave e o baseUrl de prod", async () => {
    mockChain();
    const ramp = createStellarRamp({
      mode: "live",
      etherfuse: {
        environment: "prod",
        countries: ["US"],
        apiKey: "prod_key",
      },
    });

    await ramp.quote({
      direction: "onramp",
      country: "US",
      fiat: "USD",
      fiatAmount: "100",
      pubkey: "G-X",
    });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("api.etherfuse.com");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "prod_key",
    );
  });
});

describe("createStellarRamp — live com providers customizados", () => {
  it("roteia para o provider custom sem rede", async () => {
    const koywe = {
      id: "koywe",
      countries: ["BR"],
      quote: async () => ({
        quoteId: "k-1",
        providerId: "koywe",
        direction: "onramp" as const,
        country: "BR" as const,
        fiat: "BRL" as const,
        fiatAmount: "100",
        cryptoAmount: "18",
        cryptoAsset: "USDC:ISSUER",
        feeBps: 30,
        fee: "0.3",
        createdAt: "2026-08-04T00:00:00Z",
      }),
      createOnrampOrder: async () => ({}),
      createOfframpOrder: async () => ({}),
      getOrder: async () => ({}),
      submitApproval: async () => ({ approvalMessageId: "a-1", completed: true }),
      createCustomer: async () => ({ customerId: "c-1" }),
      createBankAccount: async () => ({ bankAccountId: "b-1" }),
    } as unknown as RampProvider;

    const ramp = createStellarRamp({ mode: "live", providers: [koywe] });

    const q = await ramp.quote({
      direction: "onramp",
      country: "BR",
      fiat: "BRL",
      fiatAmount: "100",
    });
    expect(q.providerId).toBe("koywe");
  });
});

describe("createEnvSecretProvider", () => {
  it("lê de um source injetado", async () => {
    const secrets = createEnvSecretProvider({ ETHERFUSE_API_KEY: "v1" });

    expect(await secrets.get("ETHERFUSE_API_KEY")).toBe("v1");
    expect(await secrets.get("MISSING")).toBeUndefined();
  });

  it("default lê process.env", async () => {
    vi.stubEnv("EF_TEST", "envval");
    const secrets = createEnvSecretProvider();

    expect(await secrets.get("EF_TEST")).toBe("envval");
    vi.unstubAllEnvs();
  });
});
