import { YieldError, yerr } from "../../domain/entities/errors";
import type { Amount } from "../../domain/entities/money";
import { div, mul } from "../../domain/lib/decimal";
import type { BondPosition, BondQuote } from "../../domain/entities/position";
import type {
  Nav,
  Stablebond,
  StablebondCode,
} from "../../domain/entities/stablebond";
import type { StablebondProvider } from "../../domain/ports/stablebond-provider";

/**
 * MockStablebondProvider (ADR-012) — determinístico, NAVs e câmbios REALISTAS
 * da pesquisa (ago/2026). Mesmo contrato de dados do live (ADR-009).
 */
export interface MockStablebondOptions {
  navs?: Partial<
    Record<StablebondCode, { nav: string; fiat: string; apyPct?: number }>
  >;
  /** Câmbio fiat por 1 USD (para converter USDC → fiat → tokens). */
  fx?: Record<string, string>;
}

const DEFAULT_BONDS: Stablebond[] = [
  {
    code: "TESOURO",
    asset: "TESOURO:GCRYUGD5NVARGXT56XEZI5CIFCQETYHAPQQTHO2O3IQZTHDH4LATMYWC",
    fiat: "BRL",
    nav: "1.23677",
    apyPct: 13.06,
  },
  {
    code: "CETES",
    asset: "CETES:GCRYUGD5NVARGXT56XEZI5CIFCQETYHAPQQTHO2O3IQZTHDH4LATMYWC",
    fiat: "MXN",
    nav: "1.174751",
    apyPct: 5.78,
  },
  {
    code: "USTRY",
    asset: "USTRY:GCRYUGD5NVARGXT56XEZI5CIFCQETYHAPQQTHO2O3IQZTHDH4LATMYWC",
    fiat: "USD",
    nav: "1.07127",
    apyPct: 3.23,
  },
];

const DEFAULT_FX: Record<string, string> = { BRL: "5.5", MXN: "18", USD: "1" };

export class MockStablebondProvider implements StablebondProvider {
  readonly id = "mock";
  readonly bonds: Stablebond[];
  private readonly fx: Record<string, string>;

  constructor(opts: MockStablebondOptions = {}) {
    this.bonds = DEFAULT_BONDS.map((b) => {
      const override = opts.navs?.[b.code];
      return override
        ? {
            ...b,
            nav: override.nav,
            fiat: override.fiat,
            apyPct: override.apyPct ?? b.apyPct,
          }
        : b;
    });
    this.fx = { ...DEFAULT_FX, ...(opts.fx ?? {}) };
  }

  async getNav(code: StablebondCode): Promise<Nav> {
    const bond = this.bond(code);
    return { code, nav: bond.nav, updatedAt: now() };
  }

  async quote(code: StablebondCode, usdcAmount: Amount): Promise<BondQuote> {
    const bond = this.bond(code);
    const fiatValue = mul(usdcAmount, this.fxFor(bond.fiat));
    const tokens = div(fiatValue, bond.nav);
    return {
      code,
      usdcAmount,
      tokens,
      nav: bond.nav,
      fiatValue,
      fiat: bond.fiat,
    };
  }

  async swapUsdcToBond(
    usdcAmount: Amount,
    code: StablebondCode,
  ): Promise<BondPosition> {
    const q = await this.quote(code, usdcAmount);
    return {
      providerId: this.id,
      code,
      tokens: q.tokens,
      nav: q.nav,
      fiatValue: q.fiatValue,
      fiat: q.fiat,
      createdAt: now(),
    };
  }

  async swapBondToUsdc(
    bondAmount: Amount,
    code: StablebondCode,
  ): Promise<Amount> {
    const bond = this.bond(code);
    const fiatValue = mul(bondAmount, bond.nav);
    return div(fiatValue, this.fxFor(bond.fiat));
  }

  private bond(code: StablebondCode): Stablebond {
    const bond = this.bonds.find((b) => b.code === code);
    if (!bond) throw yerr.unsupportedBond(code);
    return bond;
  }

  private fxFor(fiat: string): string {
    const fx = this.fx[fiat];
    if (!fx)
      throw new YieldError("unsupported_bond", `Sem câmbio mock para ${fiat}`, {
        fiat,
      });
    return fx;
  }
}

const now = (): string => new Date().toISOString();
