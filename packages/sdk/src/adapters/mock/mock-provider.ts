import type { BankAccountDetails } from "../../domain/entities/bank-account";
import type { CountryCode } from "../../domain/entities/country";
import { RampError, err } from "../../domain/entities/errors";
import type { KycData } from "../../domain/entities/identity";
import { div, mul, sub } from "../../domain/lib/decimal";
import type { Order } from "../../domain/entities/order";
import type { Quote, QuoteRequest } from "../../domain/entities/quote";
import type {
  EmbeddedWalletProvider,
  OfframpOrderRequest,
  OnrampOrderRequest,
  RampProvider,
  SignedApproval,
  SimulatableProvider,
} from "../../domain/ports/ramp-provider";

export interface MockRate {
  fiat: string;

  cryptoPerFiat: string;
  feeBps: number;
}

const DEFAULT_RATES: MockRate[] = [
  { fiat: "BRL", cryptoPerFiat: "5.50", feeBps: 50 },
  { fiat: "MXN", cryptoPerFiat: "18.00", feeBps: 25 },
  { fiat: "USD", cryptoPerFiat: "1.00", feeBps: 25 },
  { fiat: "ARS", cryptoPerFiat: "1200", feeBps: 50 },
];

const DEFAULT_MOCK_ASSET = "USDC:MOCK-ISSUER";

export interface MockProviderOptions {
  id?: string;
  countries?: CountryCode[];
  rates?: MockRate[];
}

export class MockProvider
  implements RampProvider, SimulatableProvider, EmbeddedWalletProvider
{
  readonly id: string;
  readonly countries: CountryCode[];
  private readonly rates: Map<string, MockRate>;
  private readonly orders = new Map<string, Order>();
  private seq = 0;

  constructor(opts: MockProviderOptions = {}) {
    this.id = opts.id ?? "mock";
    this.countries = opts.countries ?? [
      "BR",
      "MX",
      "US",
      "AR",
      "CO",
      "PE",
      "CL",
      "GB",
      "KR",
      "EU",
      "EC",
    ];
    this.rates = new Map((opts.rates ?? DEFAULT_RATES).map((r) => [r.fiat, r]));
  }

  async quote(req: QuoteRequest): Promise<Quote> {
    const rate = this.rateFor(req.fiat);
    const cryptoAsset = req.cryptoAsset ?? DEFAULT_MOCK_ASSET;
    let fiatAmount: string;
    let cryptoAmount: string;
    if (req.direction === "onramp") {
      fiatAmount = req.fiatAmount ?? "0";
      const fee = this.fee(fiatAmount, rate.feeBps);
      cryptoAmount = div(sub(fiatAmount, fee), rate.cryptoPerFiat);
    } else {
      cryptoAmount = req.cryptoAmount ?? "0";
      const fee = this.fee(cryptoAmount, rate.feeBps);
      fiatAmount = mul(sub(cryptoAmount, fee), rate.cryptoPerFiat);
    }
    return {
      quoteId: `${this.id}-quote-${this.seq++}`,
      providerId: this.id,
      direction: req.direction,
      country: req.country,
      fiat: req.fiat,
      fiatAmount,
      cryptoAmount,
      cryptoAsset,
      feeBps: rate.feeBps,

      fee: this.fee(
        req.direction === "onramp" ? fiatAmount : cryptoAmount,
        rate.feeBps,
      ),
      createdAt: now(),
    };
  }

  async createOnrampOrder(req: OnrampOrderRequest): Promise<Order> {
    const order = this.order(req.quote, "onramp", "created");
    this.orders.set(order.id, order);
    return order;
  }

  async createOfframpOrder(req: OfframpOrderRequest): Promise<Order> {
    const order = this.order(req.quote, "offramp", "created");
    this.orders.set(order.id, order);
    return order;
  }

  async getOrder(orderId: string): Promise<Order> {
    const order = this.orders.get(orderId);
    if (!order) throw err.orderNotFound(orderId);
    return order;
  }

  async simulateFiatDeposit(orderId: string): Promise<Order> {
    const order = await this.getOrder(orderId);
    const updated: Order = {
      ...order,
      status: "funded",
      updatedAt: now(),
      approval: {
        approvalMessageId: `${this.id}-approval-${this.seq++}`,
        approvalMessage: JSON.stringify({
          type: "ACTIVITY_TYPE_APPROVE_ACTIVITY",
          timestampMs: String(Date.now()),
        }),
        summary: `Claim ${order.cryptoAmount} ${order.cryptoAsset.split(":")[0]}`,
      },
      stellarClaimableBalanceId: `${this.id}-claimable-${orderId}`,
    };
    this.orders.set(orderId, updated);
    return updated;
  }

  async submitApproval(
    orderId: string,
    signed: SignedApproval,
  ): Promise<{ approvalMessageId: string; completed: boolean }> {
    const order = await this.getOrder(orderId);
    this.orders.set(orderId, { ...order, status: "completed", updatedAt: now() });
    return { approvalMessageId: signed.approvalMessageId, completed: true };
  }

  async provisionWallet(
    _signerPublicKeyPem: string,
  ): Promise<{ walletId: string; publicKey: string }> {
    return {
      walletId: `${this.id}-wallet-${this.seq++}`,
      publicKey: `G-MOCK-${this.id.toUpperCase()}`,
    };
  }

  async createCustomer(_p: { pubkey: string; kyc: KycData }) {
    return { customerId: `${this.id}-cust-${this.seq++}` };
  }

  async createBankAccount(_p: {
    customerId: string;
    country: CountryCode;
    fiat: string;
    details?: BankAccountDetails;
  }) {
    return { bankAccountId: `${this.id}-bank-${this.seq++}` };
  }

  private rateFor(fiat: string): MockRate {
    const rate = this.rates.get(fiat);
    if (!rate)
      throw new RampError(
        "unsupported_fiat",
        `No mock rate for fiat: ${fiat}`,
        {
          fiat,
        },
      );
    return rate;
  }

  private fee(amount: string, feeBps: number): string {
    return div(mul(amount, String(feeBps)), "10000");
  }

  private order(
    quote: Quote,
    direction: Order["direction"],
    status: Order["status"],
    extra: Partial<Order> = {},
  ): Order {
    return {
      id: this.nextId(),
      providerId: this.id,
      direction,
      country: quote.country,
      fiat: quote.fiat,
      fiatAmount: quote.fiatAmount,
      cryptoAmount: quote.cryptoAmount,
      cryptoAsset: quote.cryptoAsset,
      status,
      createdAt: now(),
      updatedAt: now(),
      ...extra,
    };
  }

  private nextId(): string {
    return `${this.id}-order-${this.seq++}`;
  }
}

const now = (): string => new Date().toISOString();
