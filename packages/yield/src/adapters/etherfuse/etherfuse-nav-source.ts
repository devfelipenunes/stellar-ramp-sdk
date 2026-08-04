import { YieldError } from "../../domain/entities/errors";
import type { Nav, StablebondCode } from "../../domain/entities/stablebond";
import type { NavSource } from "../../domain/ports/nav-source";

/**
 * REAL Etherfuse NAV source — `GET /lookup/stablebonds` is PUBLIC
 * (no auth). Shape confirmed on 03/08/2026:
 *
 *   { calculatedAt, stablebonds: [{ symbol, tokenPriceDecimal, bondCurrency, ... }] }
 *
 * ~5min cache (ADR-010). On-chain swaps still sit behind the API key;
 * read-only NAV is open.
 */
export interface EtherfuseNavSourceOptions {
  /** Default: production. */
  baseUrl?: string;
  /** Cache TTL in ms (default 5min — ADR-010). */
  cacheTtlMs?: number;
}

interface LookupResponse {
  calculatedAt?: string;
  stablebonds?: Array<{ symbol: string; tokenPriceDecimal: string }>;
}

export function createEtherfuseNavSource(
  opts: EtherfuseNavSourceOptions = {},
): NavSource {
  return new EtherfuseNavSource(opts);
}

class EtherfuseNavSource implements NavSource {
  readonly id = "etherfuse";
  private readonly baseUrl: string;
  private readonly cacheTtlMs: number;
  private cache?: {
    at: number;
    bonds: Record<string, string>;
    calculatedAt: string;
  };

  constructor(opts: EtherfuseNavSourceOptions = {}) {
    this.baseUrl = opts.baseUrl ?? "https://api.etherfuse.com";
    this.cacheTtlMs = opts.cacheTtlMs ?? 5 * 60_000;
  }

  async getNav(code: StablebondCode): Promise<Nav> {
    const bonds = await this.fetchBonds();
    const tokenPrice = bonds[code.toUpperCase()];
    if (!tokenPrice) {
      throw new YieldError(
        "unsupported_bond",
        `Etherfuse does not expose NAV for ${code}`,
        { code },
      );
    }
    return {
      code,
      nav: tokenPrice,
      updatedAt: this.cache?.calculatedAt ?? now(),
    };
  }

  private async fetchBonds(): Promise<Record<string, string>> {
    if (this.cache && Date.now() - this.cache.at < this.cacheTtlMs)
      return this.cache.bonds;

    const res = await fetch(`${this.baseUrl}/lookup/stablebonds`);
    if (!res.ok)
      throw new Error(`etherfuse /lookup/stablebonds → HTTP ${res.status}`);
    const data = (await res.json()) as LookupResponse;

    const bonds: Record<string, string> = {};
    for (const b of data.stablebonds ?? [])
      bonds[b.symbol.toUpperCase()] = b.tokenPriceDecimal;

    this.cache = {
      at: Date.now(),
      bonds,
      calculatedAt: data.calculatedAt ?? now(),
    };
    return bonds;
  }
}

const now = (): string => new Date().toISOString();
