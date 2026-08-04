import type { BankAccountDetails } from "../../domain/entities/bank-account";
import type { CountryCode } from "../../domain/entities/country";
import { RampError } from "../../domain/entities/errors";
import type { KycData } from "../../domain/entities/identity";
import { div, mul, sub } from "../../domain/lib/decimal";
import type { Order } from "../../domain/entities/order";
import type { Quote, QuoteRequest } from "../../domain/entities/quote";
import type {
  OfframpOrderRequest,
  OnrampOrderRequest,
  RampProvider,
} from "../../domain/ports/ramp-provider";

/**
 * MockProvider (ADR-004) — a first-class citizen, not an improvised fallback.
 * - Deterministic: same input → same output (mock-mode spec).
 * - REALISTIC rates within the Etherfuse range (0.25%–1.5%).
 * - Same data contract as live (RampProvider).
 * In "mock" mode the router does NOT touch real providers.
 */
export interface MockRate {
  fiat: string;
  /** 1 USDC = N fiat. */
  usdcPerFiat: string;
  feeBps: number;
}

const DEFAULT_RATES: MockRate[] = [
  { fiat: "BRL", usdcPerFiat: "5.50", feeBps: 50 }, // 0.50%
  { fiat: "MXN", usdcPerFiat: "18.00", feeBps: 25 }, // 0.25% (Etherfuse MXN)
  { fiat: "USD", usdcPerFiat: "1.00", feeBps: 25 },
  { fiat: "ARS", usdcPerFiat: "1200", feeBps: 50 },
];

export interface MockProviderOptions {
  id?: string;
  countries?: CountryCode[];
  rates?: MockRate[];
}

export class MockProvider implements RampProvider {
  readonly id: string;
  readonly countries: CountryCode[];
  private readonly rates: Map<string, MockRate>;
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
    let fiatAmount: string;
    let usdcAmount: string;
    if (req.direction === "onramp") {
      fiatAmount = req.fiatAmount ?? "0";
      const fee = this.fee(fiatAmount, rate.feeBps);
      usdcAmount = div(sub(fiatAmount, fee), rate.usdcPerFiat);
    } else {
      usdcAmount = req.usdcAmount ?? "0";
      const fee = this.fee(usdcAmount, rate.feeBps);
      fiatAmount = mul(sub(usdcAmount, fee), rate.usdcPerFiat);
    }
    return {
      quoteId: `${this.id}-quote-${this.seq++}`,
      providerId: this.id,
      direction: req.direction,
      country: req.country,
      fiat: req.fiat,
      fiatAmount,
      usdcAmount,
      feeBps: rate.feeBps,
      // fee in the currency of the input leg (quote spec: fiat on onramp, USDC on offramp)
      fee: this.fee(
        req.direction === "onramp" ? fiatAmount : usdcAmount,
        rate.feeBps,
      ),
      createdAt: now(),
    };
  }

  async createOnrampOrder(req: OnrampOrderRequest): Promise<Order> {
    return this.order(req.quote, "onramp", "created");
  }

  async createOfframpOrder(req: OfframpOrderRequest): Promise<Order> {
    const id = this.nextId();
    return this.order(req.quote, "offramp", "created", {
      id,
      burnTransaction: {
        envelopeXdr: `AAAA-mock-burn-${id}`,
        expiresAt: now(),
        orderId: id,
      },
    });
  }

  async getOrder(orderId: string): Promise<Order> {
    return {
      id: orderId,
      providerId: this.id,
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "0",
      usdcAmount: "0",
      status: "completed",
      createdAt: now(),
      updatedAt: now(),
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
      usdcAmount: quote.usdcAmount,
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
