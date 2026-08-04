import { MockProvider } from "../adapters/mock/mock-provider";
import type { BankAccountDetails } from "../domain/entities/bank-account";
import type { RampConfig } from "../domain/config";
import { err } from "../domain/entities/errors";
import type { KycData } from "../domain/entities/identity";
import { lt } from "../domain/lib/decimal";
import type { Order } from "../domain/entities/order";
import type { Quote, QuoteRequest } from "../domain/entities/quote";
import type { RampProvider } from "../domain/ports/ramp-provider";
import { Router } from "./router";

export interface OnrampInput {
  quote: Quote;
  /** Destination Stellar wallet for the USDC. */
  pubkey: string;
  /**
   * Bank account details (BRL/PIX...). Required on the first onboarding with
   * a real provider (ADR-005); mock/demo do not need them.
   */
  bankAccount?: BankAccountDetails;
}

export interface OfframpInput {
  quote: Quote;
  /** Source Stellar wallet for the USDC (burn). */
  pubkey: string;
  usdcAsset: string; // "USDC:ISSUER"
  bankAccount?: BankAccountDetails;
}

/**
 * Public API of the Track SDK (Ramp):
 *   quote    → picks provider by country, returns a quote (ADR-002)
 *   onramp   → fiat → USDC
 *   offramp  → USDC → fiat
 *   getOrder → status/tracking
 */
export interface RampService {
  quote(req: QuoteRequest): Promise<Quote>;
  onramp(input: OnrampInput): Promise<Order>;
  offramp(input: OfframpInput): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;
}

/**
 * SDK factory — GREEN phase. Dependency injection (ADR-001):
 * providers, identityStore, secretProvider and stellarWallet arrive via config;
 * the domain imports no adapter.
 *
 * In "mock" mode (ADR-004) real providers are NOT used: the router and the
 * services operate on a deterministic MockProvider.
 */
export function createRamp(cfg: RampConfig): RampService {
  const providers = cfg.mode === "mock" ? [new MockProvider()] : cfg.providers;
  return new RampServiceImpl(cfg, providers, new Router(providers));
}

class RampServiceImpl implements RampService {
  /** orderId → providerId, so `getOrder` knows where to look. */
  private readonly orderProvider = new Map<string, string>();

  constructor(
    private readonly cfg: RampConfig,
    private readonly providers: RampProvider[],
    private readonly router: Router,
  ) {}

  quote(req: QuoteRequest): Promise<Quote> {
    // With pubkey: ensures the org on each candidate provider (the org is
    // per-provider — ADR-005) and injects the customerId into the quote.
    // Without pubkey: direct lookup (mock/demo — real providers require pubkey).
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
    // Real 2-pass flow of the API: the order references a quoteId from a FRESH
    // quote (the input quote may have expired — ~2min TTL in sandbox).
    const fresh = await provider.quote({
      direction: input.quote.direction,
      country: input.quote.country,
      fiat: input.quote.fiat,
      fiatAmount: input.quote.fiatAmount,
      usdcAmount: input.quote.usdcAmount,
      pubkey: input.pubkey,
      customerId: ident.customerId,
    });
    const order = await provider.createOnrampOrder({
      quote: fresh,
      pubkey: input.pubkey,
      customerId: ident.customerId,
      bankAccountId: ident.bankAccountId,
    });
    this.orderProvider.set(order.id, provider.id);
    return order;
  }

  async offramp(input: OfframpInput): Promise<Order> {
    const provider = this.providerFor(input.quote.providerId);
    // Balance guard (offramp spec) — only when the app provides chain access.
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
      customerId: ident.customerId,
    });
    const order = await provider.createOfframpOrder({
      quote: fresh,
      pubkey: input.pubkey,
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
    // Fallback: unknown provider (external order) → try all.
    for (const p of this.providers) {
      try {
        return await p.getOrder(orderId);
      } catch {
        /* try the next one */
      }
    }
    throw err.orderNotFound(orderId);
  }

  private providerFor(providerId: string): RampProvider {
    const provider = this.providers.find((p) => p.id === providerId);
    if (!provider) throw err.orderNotFound(`provider:${providerId}`);
    return provider;
  }

  /**
   * Ensures only the user's ORGANIZATION (customer) — used by the real quote,
   * which requires the org to exist before quoting. The bank account is left
   * for onramp. ADR-005: customer created ONCE per (pubkey, provider).
   */
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

  /**
   * ADR-005 + ADR-013: customer created ONCE per (pubkey, provider); bank
   * account created ONCE PER COUNTRY. Reuses the customer + country account
   * when they exist; if the country is new, creates ONLY the bank account
   * (same customer). Fake KYC auto-approved in sandbox (playbook §3); RFC
   * placeholder for MX.
   */
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
      // New country: same customer, new bank account (ADR-013).
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
