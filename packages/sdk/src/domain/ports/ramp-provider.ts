import type { BankAccountDetails } from "../entities/bank-account";
import type { CountryCode } from "../entities/country";
import type { KycData } from "../entities/identity";
import type { Amount, FiatCode } from "../entities/money";
import type { Order } from "../entities/order";
import type { Quote, QuoteRequest } from "../entities/quote";

export interface RampProvider {
  readonly id: string;

  readonly countries: CountryCode[];

  quote(req: QuoteRequest): Promise<Quote>;

  createOnrampOrder(req: OnrampOrderRequest): Promise<Order>;
  createOfframpOrder(req: OfframpOrderRequest): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;

  createCustomer(params: {
    pubkey: string;
    kyc: KycData;
  }): Promise<{ customerId: string }>;
  createBankAccount(params: {
    customerId: string;
    country: CountryCode;
    fiat: FiatCode;

    details?: BankAccountDetails;
  }): Promise<{ bankAccountId: string }>;
}

export interface OnrampOrderRequest {
  quote: Quote;

  pubkey: string;
  customerId: string;
  bankAccountId: string;

  cryptoWalletId?: string;
}

export interface OfframpOrderRequest {
  quote: Quote;

  pubkey: string;
  customerId: string;
  bankAccountId: string;

  usdcAsset: string;
  cryptoWalletId?: string;
}

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

export interface EmbeddedWalletProvider extends RampProvider {
  provisionWallet(): Promise<{ walletId: string; publicKey: string }>;
}

export function isEmbeddedWalletProvider(
  p: RampProvider,
): p is RampProvider & EmbeddedWalletProvider {
  return typeof (p as EmbeddedWalletProvider).provisionWallet === "function";
}
