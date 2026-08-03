import { vi } from "vitest";
import type { Identity, KycData } from "../src/domain/entities/identity";
import type {
  Order,
  OrderDirection,
  OrderStatus,
} from "../src/domain/entities/order";
import type { Quote, QuoteRequest } from "../src/domain/entities/quote";
import type { IdentityStore } from "../src/domain/ports/identity-store";
import type {
  OfframpOrderRequest,
  OnrampOrderRequest,
  RampProvider,
} from "../src/domain/ports/ramp-provider";

export const TS = "2026-08-03T00:00:00.000Z";

export interface ProviderOpts {
  feeBps?: number;
  /** Simula provider fora do ar (spec router — failover). */
  failQuote?: boolean;
}

/** Provider fake que implementa o port RampProvider (ADR-002). */
export function makeProvider(
  id: string,
  countries: string[],
  opts: ProviderOpts = {},
): RampProvider {
  return {
    id,
    countries,
    quote: vi.fn(async (req: QuoteRequest): Promise<Quote> => {
      if (opts.failQuote) throw new Error(`[${id}] rede indisponível`);
      return {
        providerId: id,
        direction: req.direction,
        country: req.country,
        fiat: req.fiat,
        fiatAmount: req.fiatAmount ?? "0",
        usdcAmount: req.usdcAmount ?? "0",
        feeBps: opts.feeBps ?? 25,
        fee: "1.00",
        createdAt: TS,
      };
    }),
    createOnrampOrder: vi.fn(async (_req: OnrampOrderRequest): Promise<Order> =>
      makeOrder(id, "onramp", "created"),
    ),
    createOfframpOrder: vi.fn(
      async (_req: OfframpOrderRequest): Promise<Order> =>
        makeOrder(id, "offramp", "created", {
          burnTransaction: {
            envelopeXdr: `AAAA-burn-${id}`,
            expiresAt: TS,
            orderId: `${id}-order-1`,
          },
        }),
    ),
    getOrder: vi.fn(async (orderId: string): Promise<Order> =>
      makeOrder(id, "onramp", "completed"),
    ),
    createCustomer: vi.fn(async (_p: { pubkey: string; kyc: KycData }) => ({
      customerId: `${id}-cust-1`,
    })),
    createBankAccount: vi.fn(async () => ({ bankAccountId: `${id}-bank-1` })),
  };
}

export function makeOrder(
  providerId: string,
  direction: OrderDirection,
  status: OrderStatus,
  overrides: Partial<Order> = {},
): Order {
  return {
    id: `${providerId}-order-1`,
    providerId,
    direction,
    country: "MX",
    fiat: "MXN",
    fiatAmount: "300",
    usdcAmount: "35.00",
    status,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

/** IdentityStore fake com mapa em memória — injetável nos testes (spec onboarding). */
export function makeIdentityStore(
  initial: Identity[] = [],
): IdentityStore & { map: Map<string, Identity> } {
  const map = new Map<string, Identity>();
  for (const identity of initial)
    map.set(key(identity.pubkey, identity.providerId), identity);
  return {
    map,
    getIdentity: vi.fn(async (pubkey: string, providerId: string) =>
      map.get(key(pubkey, providerId)),
    ),
    saveIdentity: vi.fn(async (identity: Identity) => {
      map.set(key(identity.pubkey, identity.providerId), identity);
    }),
  };
}

const key = (pubkey: string, providerId: string) => `${pubkey}:${providerId}`;
