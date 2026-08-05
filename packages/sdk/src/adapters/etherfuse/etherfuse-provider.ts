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
  EmbeddedWalletProvider,
  OfframpOrderRequest,
  OnrampOrderRequest,
  RampProvider,
  SignedApproval,
  SimulatableProvider,
} from "../../domain/ports/ramp-provider";

export interface EtherfuseProviderOptions {
  baseUrl: string;
  environment: "sandbox" | "prod";
  countries: CountryCode[];

  secrets: SecretProvider;
  keyName?: string;

  accountType?: "personal" | "business";

  defaultCryptoAsset?: string;

  blockchain?: string;

  customerEmail?: string;
}

const SANDBOX_QUOTE_CAP = "500";
const DEFAULT_USDC_ASSET =
  "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export function createEtherfuseProvider(
  opts: EtherfuseProviderOptions,
): RampProvider & EmbeddedWalletProvider & SimulatableProvider {
  return new EtherfuseProvider(opts);
}

class EtherfuseProvider
  implements RampProvider, EmbeddedWalletProvider, SimulatableProvider
{
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
    return {
      Authorization: key,
      "Content-Type": "application/json",
      // Sem isso, o sandbox às vezes nunca dispara o job assíncrono que gera a
      // aprovação (a ordem trava em "funded" para sempre) quando a chamada reaproveita
      // uma conexão keep-alive do undici — confirmado ao vivo comparando com curl
      // (que fecha a conexão a cada request por padrão).
      Connection: "close",
    };
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
    try {
      return (await res.json()) as T;
    } catch {
      return {} as T;
    }
  }

  async quote(req: QuoteRequest): Promise<Quote> {

    if (
      this.opts.environment === "sandbox" &&
      req.fiat === "MXN" &&
      req.fiatAmount
    ) {
      if (lt(SANDBOX_QUOTE_CAP, req.fiatAmount))
        throw err.sandboxQuoteLimit(`${SANDBOX_QUOTE_CAP} MXN`);
    }

    if (!req.customerId) throw err.quoteRequiresCustomer();
    const cryptoAsset =
      req.cryptoAsset ?? this.opts.defaultCryptoAsset ?? DEFAULT_USDC_ASSET;
    const raw = await this.request<unknown>("POST", "/ramp/quote", {
      quoteId: randomUUID(),
      customerId: req.customerId,
      blockchain: this.opts.blockchain ?? "stellar",

      ...(req.walletAddress
        ? { walletAddress: req.walletAddress }
        : { wallet: req.pubkey ?? "" }),
      sourceAmount: req.fiatAmount ?? req.cryptoAmount ?? "0",
      quoteAssets: {
        type: req.direction,

        sourceAsset: req.direction === "onramp" ? req.fiat : cryptoAsset,
        targetAsset: req.direction === "onramp" ? cryptoAsset : req.fiat,
      },
    });
    return normalizeQuote(raw, req, this.id, cryptoAsset);
  }

  async createOnrampOrder(req: OnrampOrderRequest): Promise<Order> {

    const raw = await this.request<unknown>("POST", "/ramp/order", {
      orderId: randomUUID(),
      quoteId: req.quote.quoteId,
      customerId: req.customerId,
      bankAccountId: req.bankAccountId,
      blockchain: this.opts.blockchain ?? "stellar",

      ...(req.cryptoWalletId
        ? { cryptoWalletId: req.cryptoWalletId }
        : { publicKey: req.pubkey }),
    });
    return normalizeOrder(raw, this.id, "onramp", req.quote.cryptoAsset);
  }

  async createOfframpOrder(req: OfframpOrderRequest): Promise<Order> {
    const raw = await this.request<unknown>("POST", "/ramp/order", {
      orderId: randomUUID(),
      quoteId: req.quote.quoteId,
      customerId: req.customerId,
      bankAccountId: req.bankAccountId,
      blockchain: this.opts.blockchain ?? "stellar",
      ...(req.cryptoWalletId
        ? { cryptoWalletId: req.cryptoWalletId }
        : { publicKey: req.pubkey }),
    });
    return normalizeOrder(raw, this.id, "offramp", req.quote.cryptoAsset);
  }

  async provisionWallet(
    signerPublicKeyPem: string,
  ): Promise<{ walletId: string; publicKey: string }> {
    const raw = await this.request<Record<string, unknown>>(
      "POST",
      "/ramp/wallet",
      {
        walletId: randomUUID(),
        signer: { signerPublicKeyPem },
      },
    );
    return {
      walletId: String(raw.walletId ?? ""),
      publicKey: String(raw.publicKey ?? ""),
    };
  }

  async getOrder(orderId: string): Promise<Order> {
    const raw = await this.request<unknown>("GET", `/ramp/order/${orderId}`);
    return normalizeOrder(raw, this.id, "onramp");
  }

  async submitApproval(
    orderId: string,
    signed: SignedApproval,
  ): Promise<{ approvalMessageId: string; completed: boolean }> {
    const raw = await this.request<Record<string, unknown>>(
      "POST",
      `/ramp/order/${orderId}/approvals`,
      signed,
    );
    return {
      approvalMessageId: String(
        raw.approvalMessageId ?? signed.approvalMessageId,
      ),
      completed: Boolean(raw.completed),
    };
  }

  async simulateFiatDeposit(orderId: string): Promise<Order> {
    if (this.opts.environment !== "sandbox") {
      throw new Error(
        "simulateFiatDeposit is sandbox-only (prod detects via SPEI)",
      );
    }
    const raw = await this.request<unknown>("POST", "/ramp/order/fiat_received", {
      orderId,
    });
    return normalizeOrder(raw, this.id, "onramp");
  }

  async createCustomer(p: {
    pubkey: string;
    kyc: KycData;
  }): Promise<{ customerId: string }> {

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

    const path = `/ramp/customer/${p.customerId}/bank-account`;
    const raw = await this.request<unknown>("POST", path, {
      account: toEtherfuseAccount(p.details),
      skipAutoApproval: false,
    });

    return { bankAccountId: pickBankId(unwrap(raw), path) };
  }
}

type Json = Record<string, unknown>;

function unwrap(raw: unknown): Json {
  if (raw && typeof raw === "object" && "onramp" in (raw as Json))
    return (raw as Json).onramp as Json;
  if (raw && typeof raw === "object" && "offramp" in (raw as Json))
    return (raw as Json).offramp as Json;
  return (raw ?? {}) as Json;
}

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

function normalizeQuote(
  raw: unknown,
  req: QuoteRequest,
  providerId: string,
  cryptoAsset: string,
): Quote {
  const o = unwrap(raw);
  const feeBps = Number(o.feeBps ?? 25);
  const isOnramp = req.direction === "onramp";
  const fiatAmount = String(
    o.sourceAmount ?? o.fiatAmount ?? req.fiatAmount ?? "0",
  );
  const cryptoAmount = String(
    isOnramp
      ? (o.destinationAmount ?? req.cryptoAmount ?? "0")
      : (o.sourceAmount ?? req.cryptoAmount ?? "0"),
  );
  return {
    quoteId: String(o.quoteId ?? ""),
    providerId,
    direction: req.direction,
    country: req.country,
    fiat: req.fiat,
    fiatAmount,
    cryptoAmount,
    cryptoAsset,
    feeBps,
    fee: String(o.feeAmount ?? o.fee ?? "0"),
    createdAt: String(o.createdAt ?? new Date().toISOString()),
  };
}

function normalizeOrder(
  raw: unknown,
  providerId: string,
  direction: Order["direction"],
  cryptoAsset = DEFAULT_USDC_ASSET,
): Order {
  const o = unwrap(raw);
  const id = pickId(o);

  const type = String(o.type ?? o.direction ?? "").toLowerCase();
  const actualDirection: Order["direction"] =
    type === "offramp" ? "offramp" : type === "onramp" ? "onramp" : direction;

  const approvalRaw = o.approval as Json | undefined;
  const approval = approvalRaw
    ? {
        approvalMessageId: String(approvalRaw.approvalMessageId ?? ""),
        approvalMessage: String(approvalRaw.approvalMessage ?? ""),
        summary: String(approvalRaw.summary ?? ""),
      }
    : undefined;

  return {
    id,
    providerId,
    direction: actualDirection,
    country: String(o.country ?? "MX"),
    fiat: String(o.fiat ?? "MXN"),
    fiatAmount: String(o.fiatAmount ?? o.amountInFiat ?? "0"),
    cryptoAmount: String(o.cryptoAmount ?? o.amountInTokens ?? "0"),
    cryptoAsset: String(o.targetAsset ?? o.sourceAsset ?? cryptoAsset),
    status: pickStatus(o),
    createdAt: String(o.createdAt ?? new Date().toISOString()),
    updatedAt: String(o.updatedAt ?? o.createdAt ?? new Date().toISOString()),
    statusPageUrl: typeof o.statusPage === "string" ? o.statusPage : undefined,
    approval,
    stellarClaimableBalanceId:
      typeof o.stellarClaimableBalanceId === "string"
        ? o.stellarClaimableBalanceId
        : undefined,
  };
}
