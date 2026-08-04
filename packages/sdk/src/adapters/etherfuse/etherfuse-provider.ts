import { randomUUID } from "node:crypto";
import {
  type BankAccountDetails,
  validateBankAccountDetails,
} from "../../domain/entities/bank-account";
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
 * Etherfuse adapter — first real provider of the Track SDK (ADR-002).
 *
 * Transport confirmed by research/playbook:
 *  - base: api.sand.etherfuse.com (sandbox) | api.etherfuse.com (prod)
 *  - auth: header `Authorization: <key>` WITHOUT "Bearer" (playbook §1)
 *  - endpoints: /ramp/quote, /ramp/order, /ramp/assets, webhooks
 *  - guard: 500 MXN/quote cap in sandbox (playbook §2)
 *  - sandbox: simulated deposit via POST /ramp/order/fiat_received
 *
 * TODO(sandbox): the EXACT shape of responses must be confirmed with a real
 * API key via `GET /ramp/assets` (research pending item #1). The normalizers
 * below follow the nested pattern (unwrap `onramp`/`offramp`,
 * orderId/id/order_id) documented in playbook §5.
 */
export interface EtherfuseProviderOptions {
  baseUrl: string;
  environment: "sandbox" | "prod";
  countries: CountryCode[];
  /** Keys via SecretProvider — ADR-007 (server-side only). */
  secrets: SecretProvider;
  keyName?: string;
  /**
   * Type of organization/customer created (ADR-005) — confirmed in sandbox:
   * business accepts country+taxId and is born eligible to receive a bank
   * account; personal requires userInfo.email. Default business.
   */
  accountType?: "personal" | "business";
  /** Destination USDC asset for onramp — identifier "SYM:ISSUER" (bare "USDC" is rejected). */
  usdcAsset?: string;
  /** Blockchain for quote/order. Default stellar. */
  blockchain?: string;
  /** Email for personal org (required by Etherfuse — userInfo.email). */
  customerEmail?: string;
}

const SANDBOX_QUOTE_CAP = "500"; // MXN — playbook §2
const DEFAULT_USDC_ASSET =
  "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"; // devnet (sandbox)

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
        "ETHERFUSE_API_KEY not configured via SecretProvider (ADR-007)",
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
    // Known sandbox guard (playbook §2).
    if (
      this.opts.environment === "sandbox" &&
      req.fiat === "MXN" &&
      req.fiatAmount
    ) {
      if (lt(SANDBOX_QUOTE_CAP, req.fiatAmount))
        throw err.sandboxQuoteLimit(`${SANDBOX_QUOTE_CAP} MXN`);
    }
    // Real sandbox shape (04/08/2026): the API requires the org to exist
    // before quoting (customerId) — RampService guarantees it via ensureOrganization.
    if (!req.customerId) throw err.quoteRequiresCustomer();
    const usdc = this.opts.usdcAsset ?? DEFAULT_USDC_ASSET;
    const raw = await this.request<unknown>("POST", "/ramp/quote", {
      quoteId: randomUUID(), // our idempotency key
      customerId: req.customerId,
      blockchain: this.opts.blockchain ?? "stellar",
      wallet: req.pubkey ?? "",
      sourceAmount: req.fiatAmount ?? req.usdcAmount ?? "0",
      quoteAssets: {
        type: req.direction,
        // onramp: fiat → USDC (validated in sandbox). offramp: USDC → fiat
        // (approximately symmetric shape — TODO(sandbox): confirm offramp variant).
        sourceAsset: req.direction === "onramp" ? req.fiat : usdc,
        targetAsset: req.direction === "onramp" ? usdc : req.fiat,
      },
    });
    return normalizeQuote(raw, req, this.id);
  }

  async createOnrampOrder(req: OnrampOrderRequest): Promise<Order> {
    // Real 2-pass flow in sandbox: the order references a quoteId from a REAL quote.
    const raw = await this.request<unknown>("POST", "/ramp/order", {
      orderId: randomUUID(), // our idempotency key
      quoteId: req.quote.quoteId,
      customerId: req.customerId,
      bankAccountId: req.bankAccountId,
      blockchain: this.opts.blockchain ?? "stellar",
      wallet: req.pubkey,
    });
    return normalizeOrder(raw, this.id, "onramp");
  }

  async createOfframpOrder(req: OfframpOrderRequest): Promise<Order> {
    const raw = await this.request<unknown>("POST", "/ramp/order", {
      orderId: randomUUID(),
      quoteId: req.quote.quoteId,
      customerId: req.customerId,
      bankAccountId: req.bankAccountId,
      blockchain: this.opts.blockchain ?? "stellar",
      wallet: req.pubkey,
    });
    return normalizeOrder(raw, this.id, "offramp");
  }

  async getOrder(orderId: string): Promise<Order> {
    const raw = await this.request<unknown>("GET", `/ramp/order/${orderId}`);
    return normalizeOrder(raw, this.id, "onramp"); // TODO(sandbox): confirm shape
  }

  /** Sandbox-only: simulates the fiat deposit (playbook §4). In prod, SPEI detects it on its own. */
  async simulateFiatDeposit(orderId: string): Promise<Order> {
    if (this.opts.environment !== "sandbox") {
      throw new Error(
        "simulateFiatDeposit is sandbox-only (prod detects via SPEI)",
      );
    }
    const raw = await this.request<unknown>(
      "POST",
      `/ramp/order/${orderId}/fiat_received`,
    );
    return normalizeOrder(raw, this.id, "onramp");
  }

  async createCustomer(p: {
    pubkey: string;
    kyc: KycData;
  }): Promise<{ customerId: string }> {
    // Real sandbox behavior (04/08/2026): POST /ramp/organization accepts an
    // `id` WE generate (becomes the organizationId = customer_id used everywhere — ADR-005).
    const id = randomUUID();
    const isBusiness = (this.opts.accountType ?? "business") !== "personal";
    const raw = await this.request<unknown>("POST", "/ramp/organization", {
      id,
      accountType: this.opts.accountType ?? "business",
      ...(isBusiness
        ? {
            country: p.kyc.country,
            taxId: p.kyc.taxId,
            displayName: p.kyc.fullName ?? "Customer",
          }
        : {
            displayName: p.kyc.fullName ?? "Customer",
            userInfo: {
              displayName: p.kyc.fullName ?? "Customer",
              email: p.kyc.email ?? this.opts.customerEmail,
            },
          }),
    });
    return { customerId: pickId(unwrap(raw), id) };
  }

  async createBankAccount(p: {
    customerId: string;
    country: CountryCode;
    fiat: string;
    details?: BankAccountDetails;
  }): Promise<{ bankAccountId: string }> {
    if (!p.details) throw err.bankAccountDetailsRequired(p.country);
    const problems = validateBankAccountDetails(p.details);
    if (problems.length > 0) throw err.bankAccountDetailsInvalid(problems);
    // Real per-customer endpoint (doc 03/08/2026); `transactionId` is OUR
    // idempotency key (uuid), not returned by the API.
    const path = `/ramp/customer/${p.customerId}/bank-account`;
    const raw = await this.request<unknown>("POST", path, {
      account: toEtherfuseAccount(p.details),
      skipAutoApproval: false,
    });
    return { bankAccountId: pickBankId(unwrap(raw), path) }; // TODO(sandbox): confirm shape
  }
}

// --- normalizers (playbook §5 patterns: nested responses, variable id) ---

type Json = Record<string, unknown>;

function unwrap(raw: unknown): Json {
  if (raw && typeof raw === "object" && "onramp" in (raw as Json))
    return (raw as Json).onramp as Json;
  if (raw && typeof raw === "object" && "offramp" in (raw as Json))
    return (raw as Json).offramp as Json;
  return (raw ?? {}) as Json;
}

/**
 * Maps `BankAccountDetails` to the flattened `account` object expected by
 * Etherfuse (oneOf inferred from the fields — `kind` is not sent in the
 * payload). `transactionId` is the idempotency key we generate (doc 03/08/2026).
 */
function toEtherfuseAccount(d: BankAccountDetails): Json {
  const transactionId = randomUUID();
  switch (d.kind) {
    case "pix_personal":
      return {
        transactionId,
        firstName: d.firstName,
        lastName: d.lastName,
        cpf: d.cpf,
        pixKey: d.pixKey,
        pixKeyType: d.pixKeyType,
      };
    case "pix_business":
      return {
        transactionId,
        name: d.name,
        cnpj: d.cnpj,
        pixKey: d.pixKey,
        pixKeyType: d.pixKeyType,
      };
    case "spei_personal":
      return {
        transactionId,
        firstName: d.firstName,
        paternalLastName: d.paternalLastName,
        maternalLastName: d.maternalLastName,
        birthDate: d.birthDate,
        birthCountryIsoCode: d.birthCountryIsoCode,
        curp: d.curp,
        rfc: d.rfc,
        clabe: d.clabe,
      };
  }
}

/**
 * The bank may return the id as bankAccountId/id/order_id (playbook §5).
 * If no key matches, THROW instead of returning "" — persisting "" in the
 * IdentityStore would recreate the "Bank account not found" gotcha of ADR-005.
 */
function pickBankId(obj: Json, path: string): string {
  const id = obj.bankAccountId ?? obj.id ?? obj.orderId ?? obj.order_id;
  if (id === undefined || id === null || String(id).trim() === "")
    throw err.bankAccountResponseUnrecognized(path);
  return String(id);
}

function pickId(obj: Json, fallback = ""): string {
  return String(
    obj.organizationId ?? obj.orderId ?? obj.id ?? obj.order_id ?? fallback,
  );
}

function pickStatus(obj: Json): Order["status"] {
  const s = String(obj.status ?? "created") as Order["status"];
  return s;
}

/**
 * Normalizes the REAL sandbox quote (04/08/2026): the response carries
 * `quoteId`, `sourceAmount`, `destinationAmount`, `feeBps`, `feeAmount`.
 * onramp: sourceAmount = fiat in, destinationAmount = USDC out.
 */
function normalizeQuote(
  raw: unknown,
  req: QuoteRequest,
  providerId: string,
): Quote {
  const o = unwrap(raw);
  const feeBps = Number(o.feeBps ?? 25);
  const isOnramp = req.direction === "onramp";
  const fiatAmount = String(
    o.sourceAmount ?? o.fiatAmount ?? req.fiatAmount ?? "0",
  );
  const usdcAmount = String(
    isOnramp
      ? (o.destinationAmount ?? req.usdcAmount ?? "0")
      : (o.sourceAmount ?? req.usdcAmount ?? "0"),
  );
  return {
    quoteId: String(o.quoteId ?? ""),
    providerId,
    direction: req.direction,
    country: req.country,
    fiat: req.fiat,
    fiatAmount,
    usdcAmount,
    feeBps,
    fee: String(o.feeAmount ?? o.fee ?? "0"),
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
