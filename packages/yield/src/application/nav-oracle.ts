import { YieldError } from "../domain/entities/errors";
import { fromN, toN } from "../domain/lib/decimal";
import type { Nav, StablebondCode } from "../domain/entities/stablebond";
import type { NavSource } from "../domain/ports/nav-source";

const SCALE = 1_000_000_000n;
const absN = (n: bigint): bigint => (n < 0n ? -n : n);

export interface NavOracleOptions {
  /** Desvio máximo vs mediana para marcar outlier (default 5%). */
  maxDeviationPct?: number;
}

export interface NavOracleResult {
  nav: Nav;
  /** Fontes que entraram na mediana final. */
  sourcesUsed: string[];
  /** Fontes descartadas como outlier (possível manipulação). */
  outliers: string[];
}

export interface NavOracle {
  getNav(code: StablebondCode): Promise<NavOracleResult>;
}

/**
 * Oráculo multi-fonte (ADR-010) — mitigação do exploit da Blend (fev/2026):
 * um oráculo VWAP spot único foi manipulado (USTRY $1,06 → $106,74).
 * Aqui o NAV é a mediana robusta de N fontes, com outliers descartados.
 */
export function createNavOracle(
  sources: NavSource[],
  opts: NavOracleOptions = {},
): NavOracle {
  return new MultiSourceNavOracle(sources, opts);
}

class MultiSourceNavOracle implements NavOracle {
  private readonly threshold: bigint;

  constructor(
    private readonly sources: NavSource[],
    opts: NavOracleOptions = {},
  ) {
    const pct = opts.maxDeviationPct ?? 0.05;
    this.threshold = BigInt(Math.round(pct * 1e9));
  }

  async getNav(code: StablebondCode): Promise<NavOracleResult> {
    const settled = await Promise.allSettled(
      this.sources.map((s) => s.getNav(code)),
    );

    const readings: { id: string; nav: string }[] = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled")
        readings.push({ id: this.sources[i]!.id, nav: r.value.nav });
    });

    if (readings.length === 0) {
      throw new YieldError(
        "no_nav_source_available",
        `Nenhuma fonte de NAV disponível para ${code}`,
        {
          code,
        },
      );
    }

    const m0 = toN(medianOf(readings.map((r) => r.nav)));
    const outliers: string[] = [];
    const kept = readings.filter((r) => {
      const dev = (absN(toN(r.nav) - m0) * SCALE) / m0;
      if (dev > this.threshold) {
        outliers.push(r.id);
        return false;
      }
      return true;
    });

    const used = kept.length > 0 ? kept : readings;
    const finalNav = medianOf(used.map((r) => r.nav));

    return {
      nav: { code, nav: finalNav, updatedAt: now() },
      sourcesUsed: used.map((r) => r.id),
      outliers,
    };
  }
}

function medianOf(navs: string[]): string {
  const sorted = navs.map(toN).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return fromN(sorted[mid]!);
  return fromN((sorted[mid - 1]! + sorted[mid]!) / 2n);
}

const now = (): string => new Date().toISOString();
