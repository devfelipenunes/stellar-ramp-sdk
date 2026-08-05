import { createHmac } from "node:crypto";
import canonicalize from "canonicalize";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEtherfuseStablebondProvider } from "../src/adapters/etherfuse/etherfuse-stablebond-provider";
import type { NavSource } from "../src/domain/ports/nav-source";
import type { SecretProvider } from "../src/domain/ports/secret-provider";
import type { StellarSigner } from "../src/domain/ports/stellar-signer";

const PUBLIC_KEY = "GBJSNIYHTK764KVZJ6HF4FECYCABZOHLVBE3SHQYIGDP6L7ZRTVVMHXY";
const USDC_ID = "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const TESOURO_ID = "TESOURO:GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4";

const ASSETS_RESPONSE = {
  assets: [
    { symbol: "USDC", identifier: USDC_ID, currency: "usd" },
    { symbol: "TESOURO", identifier: TESOURO_ID, currency: "brl" },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function emptyBodyResponse(status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    },
    text: async () => "",
  };
}

describe("EtherfuseStablebondProvider", () => {
  const fetchMock = vi.fn();
  const secrets: SecretProvider = { get: async () => "api_sand_abc123" };
  const navSource: NavSource = {
    id: "etherfuse-mock",
    getNav: vi.fn(async (code) => ({
      code,
      nav: "1.23677",
      updatedAt: "2026-08-05T00:00:00.000Z",
    })),
  };
  const signer: StellarSigner = {
    publicKey: PUBLIC_KEY,
    sign: vi.fn(async (xdr: string) => `signed(${xdr})`),
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  function makeProvider() {
    return createEtherfuseStablebondProvider({
      baseUrl: "https://api.sand.etherfuse.com",
      secrets,
      customerId: "customer-1",
      signer,
      navSource,
      horizonUrl: "https://horizon-testnet.stellar.org",
    });
  }

  describe("getNav", () => {
    it("delega para o NavSource, nunca chama /ramp/quote ou /ramp/swap", async () => {
      const provider = makeProvider();
      const nav = await provider.getNav("TESOURO");

      expect(nav.nav).toBe("1.23677");
      expect(navSource.getNav).toHaveBeenCalledWith("TESOURO");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("quote", () => {
    it("resolve os ativos via /ramp/assets e chama /ramp/quote com o shape real", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(ASSETS_RESPONSE))
        .mockResolvedValueOnce(
          jsonResponse({
            quoteId: "q-1",
            destinationAmount: "43.857142042715950847115040764",
            expiresAt: "2026-08-05T00:02:00.000Z",
          }),
        );

      const provider = makeProvider();
      const q = await provider.quote("TESOURO", "10");

      expect(q.code).toBe("TESOURO");
      expect(q.tokens).toBe("43.857142042715950847115040764");

      const [assetsUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(assetsUrl).toContain("/ramp/assets?blockchain=stellar");
      expect(assetsUrl).toContain(`wallet=${PUBLIC_KEY}`);

      const [quoteUrl, quoteInit] = fetchMock.mock.calls[1] as [
        string,
        RequestInit,
      ];
      expect(quoteUrl).toContain("/ramp/quote");
      const body = JSON.parse(quoteInit.body as string);
      expect(body.customerId).toBe("customer-1");
      expect(body.blockchain).toBe("stellar");
      expect(body.quoteAssets).toEqual({
        type: "swap",
        sourceAsset: USDC_ID,
        targetAsset: TESOURO_ID,
      });
      expect(body.sourceAmount).toBe("10");
      expect(typeof body.quoteId).toBe("string");
    });

    it("ativo não encontrado falha com asset_not_found", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ assets: [{ symbol: "USDC", identifier: USDC_ID }] }),
      );

      await expect(makeProvider().quote("TESOURO", "10")).rejects.toMatchObject(
        { code: "asset_not_found" },
      );
    });
  });

  describe("swapUsdcToBond / swapBondToUsdc", () => {
    it("swapUsdcToBond chama assets → quote → swap em sequência", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(ASSETS_RESPONSE))
        .mockResolvedValueOnce(
          jsonResponse({ quoteId: "q-1", destinationAmount: "43.85" }),
        )
        .mockResolvedValueOnce(emptyBodyResponse());

      const provider = makeProvider();
      const position = await provider.swapUsdcToBond("10", "TESOURO");

      expect(position.code).toBe("TESOURO");
      expect(position.tokens).toBe("43.85");
      expect(position.providerId).toBe("etherfuse");
      expect(fetchMock).toHaveBeenCalledTimes(3);

      const [, quoteInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      const quoteBody = JSON.parse(quoteInit.body as string);

      const [swapUrl, swapInit] = fetchMock.mock.calls[2] as [
        string,
        RequestInit,
      ];
      expect(swapUrl).toContain("/ramp/swap");
      const body = JSON.parse(swapInit.body as string);
      expect(body.publicKey).toBe(PUBLIC_KEY);
      expect(body.blockchain).toBe("stellar");
      expect(body.quoteId).toBe(quoteBody.quoteId);
    });

    it("swapBondToUsdc inverte sourceAsset/targetAsset", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(ASSETS_RESPONSE))
        .mockResolvedValueOnce(
          jsonResponse({ quoteId: "q-2", destinationAmount: "9.90" }),
        )
        .mockResolvedValueOnce(emptyBodyResponse());

      const provider = makeProvider();
      const usdc = await provider.swapBondToUsdc("40", "TESOURO");

      expect(usdc).toBe("9.90");
      const [, quoteInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      const body = JSON.parse(quoteInit.body as string);
      expect(body.quoteAssets).toEqual({
        type: "swap",
        sourceAsset: TESOURO_ID,
        targetAsset: USDC_ID,
      });
    });
  });

  describe("balanceOf", () => {
    it("lê Horizon direto, sem enviar Authorization", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(ASSETS_RESPONSE))
        .mockResolvedValueOnce(
          jsonResponse({
            balances: [
              { asset_type: "native", balance: "9999" },
              {
                asset_code: "TESOURO",
                asset_issuer:
                  "GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4",
                balance: "43.9491545",
              },
            ],
          }),
        );

      const provider = makeProvider();
      const balance = await provider.balanceOf(PUBLIC_KEY, "TESOURO");

      expect(balance).toBe("43.9491545");
      const [, horizonInit] = fetchMock.mock.calls[1] as [
        string,
        RequestInit | undefined,
      ];
      expect(
        (horizonInit?.headers as Record<string, string> | undefined)
          ?.Authorization,
      ).toBeUndefined();
    });

    it("conta sem a trustline devolve 0", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(ASSETS_RESPONSE))
        .mockResolvedValueOnce(jsonResponse({ balances: [] }));

      expect(await makeProvider().balanceOf(PUBLIC_KEY, "TESOURO")).toBe("0");
    });
  });

  describe("confirmSwapWebhook", () => {
    const WEBHOOK_SECRET_B64 = Buffer.from("webhook-secret").toString(
      "base64",
    );

    function signedEvent(event: unknown) {
      const canonical = canonicalize(event)!;
      const digest = createHmac(
        "sha256",
        Buffer.from(WEBHOOK_SECRET_B64, "base64"),
      )
        .update(canonical)
        .digest("hex");
      return { body: JSON.stringify(event), signature: `sha256=${digest}` };
    }

    function makeProviderWithWebhookSecret() {
      return createEtherfuseStablebondProvider({
        baseUrl: "https://api.sand.etherfuse.com",
        secrets,
        customerId: "customer-1",
        signer,
        navSource,
        horizonUrl: "https://horizon-testnet.stellar.org",
        webhookSecretBase64: WEBHOOK_SECRET_B64,
      });
    }

    it("assinatura inválida lança invalid_webhook_signature", async () => {
      const provider = makeProviderWithWebhookSecret();
      await expect(
        provider.confirmSwapWebhook("{}", "sha256=deadbeef"),
      ).rejects.toMatchObject({ code: "invalid_webhook_signature" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("evento sem sendTransaction devolve null, sem assinar nada", async () => {
      const provider = makeProviderWithWebhookSecret();
      const { body, signature } = signedEvent({
        swap_updated: { orderId: "o-1", status: "created" },
      });

      const result = await provider.confirmSwapWebhook(body, signature);

      expect(result).toBeNull();
      expect(signer.sign).not.toHaveBeenCalled();
    });

    it("evento com sendTransaction assina e submete à Stellar", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ hash: "tx-hash-1", successful: true }),
      );
      const provider = makeProviderWithWebhookSecret();
      const { body, signature } = signedEvent({
        swap_updated: {
          orderId: "o-1",
          status: "pending",
          sendTransaction: "UNSIGNED_XDR",
        },
      });

      const result = await provider.confirmSwapWebhook(body, signature);

      expect(signer.sign).toHaveBeenCalledWith(
        "UNSIGNED_XDR",
        expect.any(String),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/transactions");
      const submitted = new URLSearchParams(init.body as string);
      expect(submitted.get("tx")).toBe("signed(UNSIGNED_XDR)");
      expect(result?.orderId).toBe("o-1");
    });
  });
});
