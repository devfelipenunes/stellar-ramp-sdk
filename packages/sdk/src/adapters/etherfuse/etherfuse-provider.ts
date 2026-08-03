import type { CountryCode } from "../../domain/entities/country";
import { err } from "../../domain/entities/errors";
import type { KycData } from "../../domain/entities/identity";
import { lt } from "../../domain/lib/decimal";
import type { Order } from "../../domain/entities/order";
import type { Quote, QuoteRequest } from "../../domain/entities/quote";
import type { SecretProvider } from "../../domain/ports/secret-provider";
import type {
  OfframpOrderRequest,
  OnrampOrderRequest,
  RampProvider,
} from "../../domain/ports/ramp-provider";

/**
 * Adapter Etherfuse — 1º provider real da Track SDK (ADR-002).
 *
 * Transporte confirmado pela pesquisa/playbook:
 *  - base: api.sand.etherfuse.com (sandbox) | api.etherfuse.com (prod)
 *  - auth: header `Authorization: <key>` SEM "Bearer" (playbook §1)
 *  - endpoints: /ramp/quote, /ramp/order, /ramp/assets, webhooks
 *  - guarda: cap 500 MXN/quote na sandbox (playbook §2)
 *  - sandbox: depósito simulado via POST /ramp/order/fiat_received
 *
 * TODO(sandbox): o shape EXATO das respostas precisa ser confirmado com uma
 * API key real via `GET /ramp/assets` (pendência nº 1 da pesquisa). Os
 * normalizers abaixo seguem o padrão aninhado (unwrap `onramp`/`offramp`,
 * orderId/id/order_id) documentado no playbook §5.
 */
export interface EtherfuseProviderOptions {
  baseUrl: string;
  environment: "sandbox" | "prod";
  countries: CountryCode[];
  /** Keys via SecretProvider — ADR-007 (server-side only). */
  secrets: SecretProvider;
  keyName?: string;
}

const SANDBOX_QUOTE_CAP = "500"; // MXN — playbook §2

export function createEtherfuseProvider(
  opts: EtherfuseProviderOptions,
): RampProvider {
  return new EtherfuseProvider(opts);
}

class EtherfuseProvider implements RampProvider {
  readonly id = "etherfuse";
  readonly countries: CountryCode[];

  constructor(private readonly opts: EtherfuseProviderOptions) {
    this.countries = opts.countries;
  }

  private async headers(): Promise<Record<string, string>> {
    const key = await this.opts.secrets.get(
      this.opts.keyName ?? "ETHERFUSE_API_KEY",
    );
    if (!key)
      throw new Error(
        "ETHERFUSE_API_KEY não configurada via SecretProvider (ADR-007)",
      );
    return { Authorization: key, "Content-Type": "application/json" };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      method,
      headers: await this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`etherfuse ${method} ${path} → HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async quote(req: QuoteRequest): Promise<Quote> {
    // Guarda conhecida da sandbox (playbook §2).
    if (
      this.opts.environment === "sandbox" &&
      req.fiat === "MXN" &&
      req.fiatAmount
    ) {
      if (lt(SANDBOX_QUOTE_CAP, req.fiatAmount))
        throw err.sandboxQuoteLimit(`${SANDBOX_QUOTE_CAP} MXN`);
    }

    const raw = await this.request<unknown>("POST", "/ramp/quote", { ...req });
    return normalizeQuote(raw, req, this.id); // TODO(sandbox): confirmar shape
  }

  async createOnrampOrder(req: OnrampOrderRequest): Promise<Order> {
    const raw = await this.request<unknown>("POST", "/ramp/order", {
      type: "onramp",
      customerId: req.customerId,
      bankAccountId: req.bankAccountId,
      destinationPubkey: req.pubkey,
      ...req.quote,
    });
    return normalizeOrder(raw, this.id, "onramp"); // TODO(sandbox): confirmar shape
  }

  async createOfframpOrder(req: OfframpOrderRequest): Promise<Order> {
    const raw = await this.request<unknown>("POST", "/ramp/order", {
      type: "offramp",
      customerId: req.customerId,
      bankAccountId: req.bankAccountId,
      sourcePubkey: req.pubkey,
      usdcAsset: req.usdcAsset,
      ...req.quote,
    });
    return normalizeOrder(raw, this.id, "offramp"); // TODO(sandbox): confirmar shape
  }

  async getOrder(orderId: string): Promise<Order> {
    const raw = await this.request<unknown>("GET", `/ramp/order/${orderId}`);
    return normalizeOrder(raw, this.id, "onramp"); // TODO(sandbox): confirmar shape
  }

  /** Sandbox-only: simula o depósito fiat (playbook §4). Em prod, SPEI detecta sozinho. */
  async simulateFiatDeposit(orderId: string): Promise<Order> {
    if (this.opts.environment !== "sandbox") {
      throw new Error(
        "simulateFiatDeposit é sandbox-only (prod detecta via SPEI)",
      );
    }
    const raw = await this.request<unknown>(
      "POST",
      `/ramp/order/${orderId}/fiat_received`,
    );
    return normalizeOrder(raw, this.id, "onramp");
  }

  async createCustomer(p: { pubkey: string; kyc: KycData }) {
    const raw = await this.request<unknown>("POST", "/idv/customers", {
      pubkey: p.pubkey,
      country: p.kyc.country,
      // RFC placeholder auto-aprova banco MX (playbook §3)
      taxId: p.kyc.taxId,
      kyc: { status: "approved" },
    });
    return { customerId: pickId(unwrap(raw)) }; // TODO(sandbox): confirmar shape
  }

  async createBankAccount(p: {
    customerId: string;
    country: CountryCode;
    fiat: string;
  }) {
    const raw = await this.request<unknown>("POST", "/ramp/bank_accounts", p);
    return { bankAccountId: pickId(unwrap(raw)) }; // TODO(sandbox): confirmar shape
  }
}

// --- normalizers (padrões do playbook §5: respostas aninhadas, id variável) ---

type Json = Record<string, unknown>;

function unwrap(raw: unknown): Json {
  if (raw && typeof raw === "object" && "onramp" in (raw as Json))
    return (raw as Json).onramp as Json;
  if (raw && typeof raw === "object" && "offramp" in (raw as Json))
    return (raw as Json).offramp as Json;
  return (raw ?? {}) as Json;
}

function pickId(obj: Json): string {
  return String(obj.orderId ?? obj.id ?? obj.order_id ?? "");
}

function pickStatus(obj: Json): Order["status"] {
  const s = String(obj.status ?? "created") as Order["status"];
  return s;
}

function normalizeQuote(
  raw: unknown,
  req: QuoteRequest,
  providerId: string,
): Quote {
  const o = unwrap(raw);
  const feeBps = Number(o.feeBps ?? 25);
  return {
    providerId,
    direction: req.direction,
    country: req.country,
    fiat: req.fiat,
    fiatAmount: String(o.fiatAmount ?? req.fiatAmount ?? "0"),
    usdcAmount: String(o.usdcAmount ?? req.usdcAmount ?? "0"),
    feeBps,
    fee: String(o.fee ?? "0"),
    createdAt: String(o.createdAt ?? new Date().toISOString()),
  };
}

function normalizeOrder(
  raw: unknown,
  providerId: string,
  direction: Order["direction"],
): Order {
  const o = unwrap(raw);
  const id = pickId(o);
  return {
    id,
    providerId,
    direction,
    country: String(o.country ?? "MX"),
    fiat: String(o.fiat ?? "MXN"),
    fiatAmount: String(o.fiatAmount ?? "0"),
    usdcAmount: String(o.usdcAmount ?? "0"),
    status: pickStatus(o),
    createdAt: String(o.createdAt ?? new Date().toISOString()),
    updatedAt: String(o.updatedAt ?? o.createdAt ?? new Date().toISOString()),
    statusPageUrl: typeof o.statusPage === "string" ? o.statusPage : undefined,
  };
}
