import type { Amount } from "../entities/money";
import type { BondPosition, BondQuote } from "../entities/position";
import type { Nav, Stablebond, StablebondCode } from "../entities/stablebond";

export interface StablebondProvider {
  readonly id: string;

  readonly bonds: Stablebond[];

  getNav(code: StablebondCode): Promise<Nav>;

  quote(code: StablebondCode, usdcAmount: Amount): Promise<BondQuote>;

  swapUsdcToBond(
    usdcAmount: Amount,
    code: StablebondCode,
  ): Promise<BondPosition>;

  swapBondToUsdc(bondAmount: Amount, code: StablebondCode): Promise<Amount>;
}
