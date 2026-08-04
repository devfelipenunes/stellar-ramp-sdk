import type { BankAccountDetails } from "../entities/bank-account";
import type { CountryCode } from "../entities/country";
import type { KycData } from "../entities/identity";
import type { Amount, FiatCode } from "../entities/money";
import type { Order } from "../entities/order";
import type { Quote, QuoteRequest } from "../entities/quote";

/**
 * Track SDK port — ADR-002. Any ramp provider implements this
 * (Etherfuse, Koywe, Manteca, MockProvider). The domain only knows this
 * contract, never the provider at runtime.
 */
export interface RampProvider {
  readonly id: string; // "etherfuse" | "koywe" | "manteca" | "mock"
  /** Countries where the provider covers fiat (on/off-ramp). */
  readonly countries: CountryCode[];

  quote(req: QuoteRequest): Promise<Quote>;

  createOnrampOrder(req: OnrampOrderRequest): Promise<Order>;
  createOfframpOrder(req: OfframpOrderRequest): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;

  // Identity (ADR-005): created 1× per user and persisted by the SDK.
  createCustomer(params: {
    pubkey: string;
    kyc: KycData;
  }): Promise<{ customerId: string }>;
  createBankAccount(params: {
    customerId: string;
    country: CountryCode;
    fiat: FiatCode;
    /**
     * Per-country bank account details (BRL/PIX, MXN/SPEI...). A real
     * provider (Etherfuse) requires them; mock ignores. The SDK only sends
     * them on 1st onboarding (ADR-005) — afterwards the persisted
     * bankAccountId is reused.
     */
    details?: BankAccountDetails;
  }): Promise<{ bankAccountId: string }>;
}

export interface OnrampOrderRequest {
  quote: Quote;
  /** Stellar wallet receiving the USDC. */
  pubkey: string;
  customerId: string;
  bankAccountId: string;
}

export interface OfframpOrderRequest {
  quote: Quote;
  /** Stellar wallet source of the USDC (burn). */
  pubkey: string;
  customerId: string;
  bankAccountId: string;
  /** USDC asset in the form "USDC:ISSUER". */
  usdcAsset: string;
}

/**
 * Optional sandbox hook: simulates the fiat deposit (Etherfuse
 * POST /ramp/order/fiat_received). In live, the provider detects the deposit
 * itself (SPEI) — onramp spec.
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
