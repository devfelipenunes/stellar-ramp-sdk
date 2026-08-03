import { MockProvider } from "../adapters/mock/mock-provider";
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
  /** Carteira Stellar destino dos USDC. */
  pubkey: string;
}

export interface OfframpInput {
  quote: Quote;
  /** Carteira Stellar origem dos USDC (burn). */
  pubkey: string;
  usdcAsset: string; // "USDC:ISSUER"
}

/**
 * API pública da Track SDK (Ramp):
 *   quote    → escolhe provider por país, retorna cotação (ADR-002)
 *   onramp   → fiat → USDC
 *   offramp  → USDC → fiat
 *   getOrder → status/rastreio
 */
export interface RampService {
  quote(req: QuoteRequest): Promise<Quote>;
  onramp(input: OnrampInput): Promise<Order>;
  offramp(input: OfframpInput): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;
}

/**
 * Factory do SDK — fase GREEN. Injeção de dependência (ADR-001):
 * providers, identityStore, secretProvider e stellarWallet chegam via config;
 * o domínio não importa nenhum adapter.
 *
 * Em modo "mock" (ADR-004) os providers reais NÃO são usados: o router e os
 * services operam sobre um MockProvider determinístico.
 */
export function createRamp(cfg: RampConfig): RampService {
  const providers = cfg.mode === "mock" ? [new MockProvider()] : cfg.providers;
  return new RampServiceImpl(cfg, providers, new Router(providers));
}

class RampServiceImpl implements RampService {
  /** orderId → providerId, para `getOrder` saber onde consultar. */
  private readonly orderProvider = new Map<string, string>();

  constructor(
    private readonly cfg: RampConfig,
    private readonly providers: RampProvider[],
    private readonly router: Router,
  ) {}

  quote(req: QuoteRequest): Promise<Quote> {
    return this.router.quote(req);
  }

  async onramp(input: OnrampInput): Promise<Order> {
    const provider = this.providerFor(input.quote.providerId);
    const ident = await this.ensureIdentity(
      provider,
      input.pubkey,
      input.quote.country,
      input.quote.fiat,
    );
    const order = await provider.createOnrampOrder({
      quote: input.quote,
      pubkey: input.pubkey,
      customerId: ident.customerId,
      bankAccountId: ident.bankAccountId,
    });
    this.orderProvider.set(order.id, provider.id);
    return order;
  }

  async offramp(input: OfframpInput): Promise<Order> {
    const provider = this.providerFor(input.quote.providerId);
    // Guarda de saldo (spec offramp) — só quando o app fornece acesso à chain.
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
    );
    const order = await provider.createOfframpOrder({
      quote: input.quote,
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
    // Fallback: provider desconhecido (ordem externa) → tenta todos.
    for (const p of this.providers) {
      try {
        return await p.getOrder(orderId);
      } catch {
        /* tenta o próximo */
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
   * ADR-005: identidade criada UMA vez por (pubkey, provider) e reusada.
   * KYC fake auto-aprovado na sandbox (playbook §3); RFC placeholder p/ MX.
   */
  private async ensureIdentity(
    provider: RampProvider,
    pubkey: string,
    country: string,
    fiat: string,
  ): Promise<{ customerId: string; bankAccountId: string }> {
    const existing = await this.cfg.identityStore.getIdentity(
      pubkey,
      provider.id,
    );
    if (existing)
      return {
        customerId: existing.customerId,
        bankAccountId: existing.bankAccountId,
      };

    const kyc: KycData = {
      fullName: "Demo User",
      country,
      taxId: country === "MX" ? "XEXX010101000" : undefined,
    };
    const { customerId } = await provider.createCustomer({ pubkey, kyc });
    const { bankAccountId } = await provider.createBankAccount({
      customerId,
      country,
      fiat,
    });
    await this.cfg.identityStore.saveIdentity({
      pubkey,
      providerId: provider.id,
      customerId,
      bankAccountId,
      createdAt: new Date().toISOString(),
    });
    return { customerId, bankAccountId };
  }
}
