import { MockProvider } from "../adapters/mock/mock-provider";
import type { BankAccountDetails } from "../domain/entities/bank-account";
import type { RampConfig } from "../domain/config";
import { err } from "../domain/entities/errors";
import type { KycData } from "../domain/entities/identity";
import { lt } from "../domain/lib/decimal";
import type { Order } from "../domain/entities/order";
import type { Quote, QuoteRequest } from "../domain/entities/quote";
import {
  isEmbeddedWalletProvider,
  type RampProvider,
} from "../domain/ports/ramp-provider";
import { Router } from "./router";

export interface OnrampInput {
  quote: Quote;

  pubkey: string;

  cryptoWalletId?: string;

  walletAddress?: string;

  bankAccount?: BankAccountDetails;
}

export interface OfframpInput {
  quote: Quote;

  pubkey: string;
  usdcAsset: string;
  cryptoWalletId?: string;
  walletAddress?: string;
  bankAccount?: BankAccountDetails;
}

export interface RampService {
  quote(req: QuoteRequest): Promise<Quote>;
  onramp(input: OnrampInput): Promise<Order>;
  offramp(input: OfframpInput): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;

  provisionWallet(providerId: string): Promise<{
    walletId: string;
    publicKey: string;
  }>;
}

export function createRamp(cfg: RampConfig): RampService {

  const providers =
    cfg.mode === "mock"
      ? [
          cfg.providers.find((p) => p instanceof MockProvider) ??
            new MockProvider(),
        ]
      : cfg.providers;
  return new RampServiceImpl(cfg, providers, new Router(providers));
}

class RampServiceImpl implements RampService {

  private readonly orderProvider = new Map<string, string>();

  constructor(
    private readonly cfg: RampConfig,
    private readonly providers: RampProvider[],
    private readonly router: Router,
  ) {}

  quote(req: QuoteRequest): Promise<Quote> {

    if (!req.pubkey) return this.router.quote(req);
    return this.router.quote(req, async (p, r) => {
      const customerId = await this.ensureOrganization(
        p,
        req.pubkey!,
        req.country,
      );
      return { ...r, customerId, pubkey: req.pubkey };
    });
  }

  async onramp(input: OnrampInput): Promise<Order> {
    const provider = this.providerFor(input.quote.providerId);
    const ident = await this.ensureIdentity(
      provider,
      input.pubkey,
      input.quote.country,
      input.quote.fiat,
      input.bankAccount,
    );

    const fresh = await provider.quote({
      direction: input.quote.direction,
      country: input.quote.country,
      fiat: input.quote.fiat,
      fiatAmount: input.quote.fiatAmount,
      usdcAmount: input.quote.usdcAmount,
      pubkey: input.pubkey,
      walletAddress: input.walletAddress,
      customerId: ident.customerId,
    });
    const order = await provider.createOnrampOrder({
      quote: fresh,
      pubkey: input.pubkey,
      cryptoWalletId: input.cryptoWalletId,
      customerId: ident.customerId,
      bankAccountId: ident.bankAccountId,
    });
    this.orderProvider.set(order.id, provider.id);
    return order;
  }

  async offramp(input: OfframpInput): Promise<Order> {
    const provider = this.providerFor(input.quote.providerId);

    if (this.cfg.stellarWallet) {
      const have = await this.cfg.stellarWallet.getUsdcBalance(
        input.pubkey,
        input.usdcAsset,
      );
      if (lt(have, input.quote.usdcAmount))
        throw err.insufficientBalance(have, input.quote.usdcAmount);
    }
    const ident = await this.ensureIdentity(
      provider,
      input.pubkey,
      input.quote.country,
      input.quote.fiat,
      input.bankAccount,
    );
    const fresh = await provider.quote({
      direction: input.quote.direction,
      country: input.quote.country,
      fiat: input.quote.fiat,
      fiatAmount: input.quote.fiatAmount,
      usdcAmount: input.quote.usdcAmount,
      pubkey: input.pubkey,
      walletAddress: input.walletAddress,
      customerId: ident.customerId,
    });
    const order = await provider.createOfframpOrder({
      quote: fresh,
      pubkey: input.pubkey,
      cryptoWalletId: input.cryptoWalletId,
      customerId: ident.customerId,
      bankAccountId: ident.bankAccountId,
      usdcAsset: input.usdcAsset,
    });
    this.orderProvider.set(order.id, provider.id);
    return order;
  }

  async getOrder(orderId: string): Promise<Order> {
    const known = this.orderProvider.get(orderId);
    if (known) return this.providerFor(known).getOrder(orderId);

    for (const p of this.providers) {
      try {
        return await p.getOrder(orderId);
      } catch {

      }
    }
    throw err.orderNotFound(orderId);
  }

  async provisionWallet(providerId: string): Promise<{
    walletId: string;
    publicKey: string;
  }> {
    const provider = this.providerFor(providerId);
    if (!isEmbeddedWalletProvider(provider)) {
      throw new Error(
        `provider ${providerId} does not support embedded wallets (provisionWallet)`,
      );
    }
    return provider.provisionWallet();
  }

  private providerFor(providerId: string): RampProvider {
    const provider = this.providers.find((p) => p.id === providerId);
    if (!provider) throw err.orderNotFound(`provider:${providerId}`);
    return provider;
  }

  private async ensureOrganization(
    provider: RampProvider,
    pubkey: string,
    country: string,
  ): Promise<string> {
    const existing = await this.cfg.identityStore.getIdentity(
      pubkey,
      provider.id,
    );
    if (existing) return existing.customerId;

    const { customerId } = await provider.createCustomer({
      pubkey,
      kyc: this.kycFor(country),
    });
    await this.cfg.identityStore.saveIdentity({
      pubkey,
      providerId: provider.id,
      customerId,
      bankAccounts: [],
      createdAt: new Date().toISOString(),
    });
    return customerId;
  }

  private async ensureIdentity(
    provider: RampProvider,
    pubkey: string,
    country: string,
    fiat: string,
    details?: BankAccountDetails,
  ): Promise<{ customerId: string; bankAccountId: string }> {
    const existing = await this.cfg.identityStore.getIdentity(
      pubkey,
      provider.id,
    );
    if (existing) {
      const account = existing.bankAccounts.find((a) => a.country === country);
      if (account)
        return {
          customerId: existing.customerId,
          bankAccountId: account.bankAccountId,
        };

      const { bankAccountId } = await provider.createBankAccount({
        customerId: existing.customerId,
        country,
        fiat,
        details,
      });
      existing.bankAccounts.push({
        bankAccountId,
        providerId: provider.id,
        country,
        fiat,
      });
      await this.cfg.identityStore.saveIdentity(existing);
      return { customerId: existing.customerId, bankAccountId };
    }

    const { customerId } = await provider.createCustomer({
      pubkey,
      kyc: this.kycFor(country),
    });
    const { bankAccountId } = await provider.createBankAccount({
      customerId,
      country,
      fiat,
      details,
    });
    await this.cfg.identityStore.saveIdentity({
      pubkey,
      providerId: provider.id,
      customerId,
      bankAccounts: [{ bankAccountId, providerId: provider.id, country, fiat }],
      createdAt: new Date().toISOString(),
    });
    return { customerId, bankAccountId };
  }

  private kycFor(country: string): KycData {
    return {
      fullName: "Demo User",
      country,
      taxId: country === "MX" ? "XEXX010101000" : undefined,
      email: "demo@example.com",
    };
  }
}
