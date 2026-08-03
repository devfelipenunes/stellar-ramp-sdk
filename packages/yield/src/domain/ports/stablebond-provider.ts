import type { Amount } from "../entities/money";
import type { BondPosition, BondQuote } from "../entities/position";
import type { Nav, Stablebond, StablebondCode } from "../entities/stablebond";

/**
 * Port da Track Yield (ADR-009). Qualquer emissor de RWA/stablebond
 * implementa isto (Etherfuse, Mock). O domínio conhece só USDC↔Stablebond.
 */
export interface StablebondProvider {
  readonly id: string; // "etherfuse" | "mock"
  /** Stablebonds suportados (code + NAV + moeda). */
  readonly bonds: Stablebond[];

  /** NAV de 1 token (ADR-010: /lookup/stablebonds, cache ~5min). */
  getNav(code: StablebondCode): Promise<Nav>;

  /** Estimativa USDC → stablebond no NAV (sem mover fundos). */
  quote(code: StablebondCode, usdcAmount: Amount): Promise<BondQuote>;

  /** autoPark: USDC → stablebond. */
  swapUsdcToBond(
    usdcAmount: Amount,
    code: StablebondCode,
  ): Promise<BondPosition>;

  /** liquidate JIT: stablebond → USDC (devolve USDC recebido). */
  swapBondToUsdc(bondAmount: Amount, code: StablebondCode): Promise<Amount>;
}
