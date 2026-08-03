import type { CountryCode } from "../entities/country";
import type { KycData } from "../entities/identity";
import type { Amount, FiatCode } from "../entities/money";
import type { Order } from "../entities/order";
import type { Quote, QuoteRequest } from "../entities/quote";

/**
 * Port da Track SDK — ADR-002. Qualquer provider de ramp implementa isto
 * (Etherfuse, Koywe, Manteca, MockProvider). O domínio só conhece este
 * contrato, nunca o provider em runtime.
 */
export interface RampProvider {
  readonly id: string; // "etherfuse" | "koywe" | "manteca" | "mock"
  /** Países onde o provider cobre fiat (on/off-ramp). */
  readonly countries: CountryCode[];

  quote(req: QuoteRequest): Promise<Quote>;

  createOnrampOrder(req: OnrampOrderRequest): Promise<Order>;
  createOfframpOrder(req: OfframpOrderRequest): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;

  // Identidade (ADR-005): criadas 1× por usuário e persistidas pelo SDK.
  createCustomer(params: {
    pubkey: string;
    kyc: KycData;
  }): Promise<{ customerId: string }>;
  createBankAccount(params: {
    customerId: string;
    country: CountryCode;
    fiat: FiatCode;
  }): Promise<{ bankAccountId: string }>;
}

export interface OnrampOrderRequest {
  quote: Quote;
  /** Carteira Stellar destino dos USDC. */
  pubkey: string;
  customerId: string;
  bankAccountId: string;
}

export interface OfframpOrderRequest {
  quote: Quote;
  /** Carteira Stellar origem dos USDC (burn). */
  pubkey: string;
  customerId: string;
  bankAccountId: string;
  /** Asset USDC na forma "USDC:ISSUER". */
  usdcAsset: string;
}

/**
 * Hook opcional de sandbox: simula o depósito fiat (POST /ramp/order/fiat_received
 * da Etherfuse). Em live, o provider detecta o depósito sozinho (SPEI) — spec onramp.
 */
export interface SimulatableProvider {
  simulateFiatDeposit(orderId: string): Promise<Order>;
}

export function isSimulatable(
  p: RampProvider,
): p is RampProvider & SimulatableProvider {
  return (
    typeof (p as unknown as SimulatableProvider).simulateFiatDeposit ===
    "function"
  );
}
