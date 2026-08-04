import type { Amount } from "../entities/money";
import type { BondPosition, BondQuote } from "../entities/position";
import type { Nav, Stablebond, StablebondCode } from "../entities/stablebond";

/**
 * Track Yield port (ADR-009). Any RWA/stablebond issuer implements this
 * (Etherfuse, Mock). The domain only knows USDC↔Stablebond.
 */
export interface StablebondProvider {
  readonly id: string; // "etherfuse" | "mock"
  /** Supported stablebonds (code + NAV + currency). */
  readonly bonds: Stablebond[];

  /** NAV of 1 token (ADR-010: /lookup/stablebonds, ~5min cache). */
  getNav(code: StablebondCode): Promise<Nav>;

  /** USDC → stablebond estimate at NAV (without moving funds). */
  quote(code: StablebondCode, usdcAmount: Amount): Promise<BondQuote>;

  /** autoPark: USDC → stablebond. */
  swapUsdcToBond(
    usdcAmount: Amount,
    code: StablebondCode,
  ): Promise<BondPosition>;

  /** liquidate JIT: stablebond → USDC (returns the USDC received). */
  swapBondToUsdc(bondAmount: Amount, code: StablebondCode): Promise<Amount>;
}
