import { randomUUID } from "node:crypto";
import { Networks } from "@stellar/stellar-base";
import { yerr } from "../../domain/entities/errors";
import type { Amount } from "../../domain/entities/money";
import type { BondPosition, BondQuote } from "../../domain/entities/position";
import type { Stablebond, StablebondCode } from "../../domain/entities/stablebond";
import type { NavSource } from "../../domain/ports/nav-source";
import type { SecretProvider } from "../../domain/ports/secret-provider";
import type { StablebondProvider } from "../../domain/ports/stablebond-provider";
import type { StellarSigner } from "../../domain/ports/stellar-signer";
import { createEtherfuseNavSource } from "./etherfuse-nav-source";
import { parseSwapUpdatedEvent, verifyEtherfuseWebhookSignature } from "./webhook";

export interface EtherfuseStablebondProviderOptions {
  baseUrl?: string;
  secrets: SecretProvider;
  keyName?: string;
  customerId: string;
  signer: StellarSigner;
  navSource?: NavSource;
  horizonUrl?: string;
  blockchain?: string;
  networkPassphrase?: string;
  webhookSecretBase64?: string;
  bonds?: Stablebond[];
}

export interface SwapConfirmation {
  orderId: string;
  hash: string;
}

const DEFAULT_BONDS: Stablebond[] = [
  { code: "TESOURO", asset: "TESOURO", fiat: "BRL", nav: "1", apyPct: 13.06 },
  { code: "CETES", asset: "CETES", fiat: "MXN", nav: "1", apyPct: 5.78 },
  { code: "USTRY", asset: "USTRY", fiat: "USD", nav: "1", apyPct: 3.23 },
];

interface AssetInfo {
  symbol: string;
  identifier: string;
}

export function createEtherfuseStablebondProvider(
  opts: EtherfuseStablebondProviderOptions,
): StablebondProvider & {
  balanceOf(pubkey: string, code: StablebondCode): Promise<Amount>;
  confirmSwapWebhook(
    rawBody: string,
    signatureHeader: string | null,
  ): Promise<SwapConfirmation | null>;
} {
  return new EtherfuseStablebondProvider(opts);
}

class EtherfuseStablebondProvider implements StablebondProvider {
  readonly id = "etherfuse";
  readonly bonds: Stablebond[];

  private readonly baseUrl: string;
  private readonly horizonUrl: string;
  private readonly blockchain: string;
  private readonly networkPassphrase: string;
  private readonly navSource: NavSource;
  private assetsCache?: AssetInfo[];

  constructor(private readonly opts: EtherfuseStablebondProviderOptions) {
    this.bonds = opts.bonds ?? DEFAULT_BONDS;
    this.baseUrl = opts.baseUrl ?? "https://api.sand.etherfuse.com";
    this.horizonUrl = opts.horizonUrl ?? "https://horizon-testnet.stellar.org";
    this.blockchain = opts.blockchain ?? "stellar";
    this.networkPassphrase = opts.networkPassphrase ?? Networks.TESTNET;
    this.navSource = opts.navSource ?? createEtherfuseNavSource();
  }

  async getNav(code: StablebondCode) {
    return this.navSource.getNav(code);
  }

  async quote(code: StablebondCode, usdcAmount: Amount): Promise<BondQuote> {
    const { usdc, target } = await this.resolveAssets(code);
    const raw = await this.postQuote(usdc.identifier, target.identifier, usdcAmount);
    const nav = await this.getNav(code);
    const bond = this.bond(code);
    const tokens = String(raw.destinationAmount ?? "0");
    return {
      code,
      usdcAmount,
      tokens,
      nav: nav.nav,
      fiatValue: String(Number(tokens) * Number(nav.nav)),
      fiat: bond.fiat,
    };
  }

  async swapUsdcToBond(
    usdcAmount: Amount,
    code: StablebondCode,
  ): Promise<BondPosition> {
    const { usdc, target } = await this.resolveAssets(code);
    const quoteId = randomUUID();
    const raw = await this.postQuote(
      usdc.identifier,
      target.identifier,
      usdcAmount,
      quoteId,
    );
    await this.postSwap(quoteId);

    const nav = await this.getNav(code);
    const bond = this.bond(code);
    const tokens = String(raw.destinationAmount ?? "0");
    return {
      providerId: this.id,
      code,
      tokens,
      nav: nav.nav,
      fiatValue: String(Number(tokens) * Number(nav.nav)),
      fiat: bond.fiat,
      createdAt: new Date().toISOString(),
    };
  }

  async swapBondToUsdc(
    bondAmount: Amount,
    code: StablebondCode,
  ): Promise<Amount> {
    const { usdc, target } = await this.resolveAssets(code);
    const quoteId = randomUUID();
    const raw = await this.postQuote(
      target.identifier,
      usdc.identifier,
      bondAmount,
      quoteId,
    );
    await this.postSwap(quoteId);
    return String(raw.destinationAmount ?? "0");
  }

  async balanceOf(pubkey: string, code: StablebondCode): Promise<Amount> {
    const { target } = await this.resolveAssets(code);
    const [assetCode, assetIssuer] = target.identifier.split(":");

    const res = await fetch(`${this.horizonUrl}/accounts/${pubkey}`);
    if (res.status === 404) return "0";
    if (!res.ok) throw new Error(`horizon ${res.status}`);

    const account = (await res.json()) as {
      balances?: { asset_code?: string; asset_issuer?: string; balance?: string }[];
    };
    const balance = (account.balances ?? []).find(
      (b) => b.asset_code === assetCode && b.asset_issuer === assetIssuer,
    );
    return balance?.balance ? String(balance.balance) : "0";
  }

  async confirmSwapWebhook(
    rawBody: string,
    signatureHeader: string | null,
  ): Promise<SwapConfirmation | null> {
    const webhookSecret = requireWebhookSecret(this.opts.webhookSecretBase64);
    if (!verifyEtherfuseWebhookSignature(rawBody, signatureHeader, webhookSecret)) {
      throw yerr.invalidWebhookSignature();
    }

    const event = parseSwapUpdatedEvent(rawBody);
    if (!event || !event.sendTransaction) return null;

    const signedXdr = await this.opts.signer.sign(
      event.sendTransaction,
      this.networkPassphrase,
    );

    const res = await fetch(`${this.horizonUrl}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ tx: signedXdr }).toString(),
    });
    if (!res.ok) throw new Error(`horizon submit ${res.status}`);
    const result = (await res.json()) as { hash?: string };

    return { orderId: event.orderId, hash: result.hash ?? "" };
  }

  private bond(code: StablebondCode): Stablebond {
    const bond = this.bonds.find((b) => b.code === code);
    if (!bond) throw yerr.unsupportedBond(code);
    return bond;
  }

  private async resolveAssets(
    code: StablebondCode,
  ): Promise<{ usdc: AssetInfo; target: AssetInfo }> {
    const assets = await this.fetchAssets();
    const usdc = assets.find((a) => a.symbol === "USDC");
    const target = assets.find((a) => a.symbol === code);
    if (!usdc) throw yerr.assetNotFound("USDC");
    if (!target) throw yerr.assetNotFound(code);
    return { usdc, target };
  }

  private async fetchAssets(): Promise<AssetInfo[]> {
    if (this.assetsCache) return this.assetsCache;

    const url =
      `${this.baseUrl}/ramp/assets?blockchain=${this.blockchain}` +
      `&currency=usd&wallet=${this.opts.signer.publicKey}`;
    const res = await this.request<{ assets: AssetInfo[] }>("GET", url);
    this.assetsCache = res.assets;
    return res.assets;
  }

  private async postQuote(
    sourceAsset: string,
    targetAsset: string,
    sourceAmount: Amount,
    quoteId: string = randomUUID(),
  ): Promise<{ quoteId: string; destinationAmount: string; expiresAt?: string }> {
    return this.request(
      "POST",
      `${this.baseUrl}/ramp/quote`,
      {
        quoteId,
        customerId: this.opts.customerId,
        blockchain: this.blockchain,
        quoteAssets: { type: "swap", sourceAsset, targetAsset },
        sourceAmount,
      },
    );
  }

  private async postSwap(quoteId: string): Promise<void> {
    const url = `${this.baseUrl}/ramp/swap`;
    const res = await fetch(url, {
      method: "POST",
      headers: await this.headers(),
      body: JSON.stringify({
        orderId: randomUUID(),
        quoteId,
        publicKey: this.opts.signer.publicKey,
        blockchain: this.blockchain,
      }),
    });
    if (!res.ok) {
      throw new Error(`etherfuse POST ${url} → HTTP ${res.status}`);
    }
  }

  private async headers(): Promise<Record<string, string>> {
    const key = await this.opts.secrets.get(this.opts.keyName ?? "ETHERFUSE_API_KEY");
    if (!key) {
      throw new Error(
        "ETHERFUSE_API_KEY not configured via SecretProvider (ADR-007)",
      );
    }
    return { Authorization: key, "Content-Type": "application/json" };
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await fetch(url, {
      method,
      headers: await this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`etherfuse ${method} ${url} → HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }
}

function requireWebhookSecret(webhookSecretBase64: string | undefined): string {
  if (!webhookSecretBase64) {
    throw new Error(
      "webhookSecretBase64 not configured (ETHERFUSE_WEBHOOK_SECRET)",
    );
  }
  return webhookSecretBase64;
}
