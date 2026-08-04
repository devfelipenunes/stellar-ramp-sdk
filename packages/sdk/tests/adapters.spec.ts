import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEtherfuseProvider } from "../src/adapters/etherfuse/etherfuse-provider";
import { MockProvider } from "../src/adapters/mock/mock-provider";
import { validateBankAccountDetails } from "../src/domain/entities/bank-account";
import type { Quote, QuoteRequest } from "../src/domain/entities/quote";
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

  it("createBankAccount BRL/PIX: path por customer + payload account (doc 03/08/2026)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        bankAccountId: "6e422a25-1d68-4caf-9906-d441f85bb86d",
      }),
    });

    const res = await provider.createBankAccount({
      customerId: "cust-1",
      country: "BR",
      fiat: "BRL",
      details: {
        kind: "pix_personal",
        firstName: "Fulano",
        lastName: "De Tal",
        cpf: "12345678909",
        pixKey: "fulano@exemplo.com",
        pixKeyType: "EMAIL",
      },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.sand.etherfuse.com/ramp/customer/cust-1/bank-account",
    );
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.skipAutoApproval).toBe(false);
    expect(body.account).toMatchObject({
      firstName: "Fulano",
      lastName: "De Tal",
      cpf: "12345678909",
      pixKey: "fulano@exemplo.com",
      pixKeyType: "EMAIL",
    });
    expect(body.account.transactionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(res.bankAccountId).toBe("6e422a25-1d68-4caf-9906-d441f85bb86d");
  });

  it("createBankAccount sem details → erro claro e sem chamar rede", async () => {
    await expect(
      provider.createBankAccount({
        customerId: "cust-1",
        country: "BR",
        fiat: "BRL",
      }),
    ).rejects.toMatchObject({ code: "bank_account_details_required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("createBankAccount MXN/SPEI: envia campos CLABE/RFC no payload", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ bankAccountId: "bank-mx-1" }),
    });

    await provider.createBankAccount({
      customerId: "cust-1",
      country: "MX",
      fiat: "MXN",
      details: {
        kind: "spei_personal",
        firstName: "Juan",
        paternalLastName: "Pérez",
        maternalLastName: "López",
        birthDate: "19900101",
        birthCountryIsoCode: "MX",
        curp: "PELJ900101HDFRRL05",
        rfc: "XEXX010101000",
        clabe: "012180015000000001",
      },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.account).toMatchObject({
      clabe: "012180015000000001",
      rfc: "XEXX010101000",
      curp: "PELJ900101HDFRRL05",
      birthCountryIsoCode: "MX",
    });
  });

  it("createBankAccount com CLABE inválida → fail-fast sem chamar rede", async () => {
    await expect(
      provider.createBankAccount({
        customerId: "cust-1",
        country: "MX",
        fiat: "MXN",
        details: {
          kind: "spei_personal",
          firstName: "Juan",
          paternalLastName: "Pérez",
          maternalLastName: "López",
          birthDate: "19900101",
          birthCountryIsoCode: "MX",
          curp: "PELJ900101HDFRRL05",
          rfc: "XEXX010101000",
          clabe: "123", // CLABE exige 18 dígitos
        },
      }),
    ).rejects.toMatchObject({ code: "bank_account_details_invalid" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("createCustomer cria organização com id que GERAMOS (POST /ramp/organization)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        organizationId: "org-123",
        displayName: "Customer for zolvency",
        accountType: "business",
      }),
    });

    const res = await provider.createCustomer({
      pubkey: "G-X",
      kyc: { fullName: "Demo", country: "MX", taxId: "XEXX010101000" },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sand.etherfuse.com/ramp/organization");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.accountType).toBe("business"); // default
    expect(body.country).toBe("MX");
    expect(body.taxId).toBe("XEXX010101000");
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(res.customerId).toBe("org-123");
  });

  it("quote sem customerId → erro claro (a API cota com org real)", async () => {
    await expect(
      provider.quote({
        direction: "onramp",
        country: "MX",
        fiat: "MXN",
        fiatAmount: "300",
      }),
    ).rejects.toMatchObject({ code: "quote_requires_customer" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("quote monta o shape real (quoteAssets, sourceAmount no raiz)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        quoteId: "q-1",
        sourceAmount: "300",
        destinationAmount: "17.31",
        feeBps: "20",
        feeAmount: "0.60",
        createdAt: "2026-08-04T00:00:00Z",
      }),
    });

    const res = await provider.quote({
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "300",
      pubkey: "G-X",
      customerId: "org-1",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.customerId).toBe("org-1");
    expect(body.wallet).toBe("G-X");
    expect(body.blockchain).toBe("stellar");
    expect(body.sourceAmount).toBe("300");
    expect(body.quoteAssets).toEqual({
      type: "onramp",
      sourceAsset: "MXN",
      targetAsset:
        "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    });
    expect(res.quoteId).toBe("q-1");
    expect(res.fiatAmount).toBe("300");
    expect(res.usdcAmount).toBe("17.31");
    expect(res.feeBps).toBe(20);
  });

  it("createOnrampOrder referencia quoteId real (2-pass) + orderId nosso", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        orderId: "o-1",
        status: "created",
        country: "MX",
        fiat: "MXN",
      }),
    });
    const quote: Quote = {
      quoteId: "q-1",
      providerId: "etherfuse",
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "300",
      usdcAmount: "17.31",
      feeBps: 20,
      fee: "0.60",
      createdAt: "2026-08-04T00:00:00Z",
    };

    await provider.createOnrampOrder({
      quote,
      pubkey: "G-X",
      customerId: "org-1",
      bankAccountId: "bank-1",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.quoteId).toBe("q-1");
    expect(body.customerId).toBe("org-1");
    expect(body.bankAccountId).toBe("bank-1");
    expect(body.wallet).toBe("G-X");
    expect(body.blockchain).toBe("stellar");
    expect(body.orderId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("getOrder detecta a direção da resposta (offramp), não força onramp", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        orderId: "o-off",
        type: "offramp",
        status: "completed",
        country: "MX",
        fiat: "MXN",
      }),
    });

    const res = await provider.getOrder("o-off");

    expect(res.direction).toBe("offramp");
    expect(res.status).toBe("completed");
  });

  it("createBankAccount sem id reconhecível na resposta → erro, não persiste ''", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "pending" }), // shape inesperado
    });

    await expect(
      provider.createBankAccount({
        customerId: "cust-1",
        country: "BR",
        fiat: "BRL",
        details: {
          kind: "pix_personal",
          firstName: "Fulano",
          lastName: "De Tal",
          cpf: "12345678909",
          pixKey: "fulano@exemplo.com",
          pixKeyType: "EMAIL",
        },
      }),
    ).rejects.toMatchObject({ code: "bank_account_response_unrecognized" });
  });
});

describe("validateBankAccountDetails — fail-fast por país", () => {
  it("aceita PIX pessoa física válida", () => {
    expect(
      validateBankAccountDetails({
        kind: "pix_personal",
        firstName: "Fulano",
        lastName: "De Tal",
        cpf: "123.456.789-09", // formatação aceita, dígitos contam
        pixKey: "fulano@exemplo.com",
        pixKeyType: "EMAIL",
      }),
    ).toEqual([]);
  });

  it("rejeita CPF curto e pixKey vazia", () => {
    const problems = validateBankAccountDetails({
      kind: "pix_personal",
      firstName: "Fulano",
      lastName: "De Tal",
      cpf: "123",
      pixKey: "",
      pixKeyType: "EMAIL",
    });
    expect(problems).toEqual(
      expect.arrayContaining(["cpf must have 11 digits", "pixKey is required"]),
    );
  });

  it("rejeita SPEI com CLABE errada, RFC inválido e birthDate fora de faixa", () => {
    const problems = validateBankAccountDetails({
      kind: "spei_personal",
      firstName: "Juan",
      paternalLastName: "Pérez",
      maternalLastName: "López",
      birthDate: "19901301", // mês 13
      birthCountryIsoCode: "mexico", // minúsculo/por extenso
      curp: "curp-curta",
      rfc: "123",
      clabe: "012180015000000001",
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        "birthDate has an invalid month",
        "birthCountryIsoCode must be ISO 3166-1 alpha-2 (e.g. MX)",
        "curp must have 18 alphanumeric characters",
        "rfc must have 12–13 characters",
      ]),
    );
  });
});
