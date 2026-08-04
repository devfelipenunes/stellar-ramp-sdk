import type { Nav, StablebondCode } from "../entities/stablebond";

/**
 * NAV source (ADR-010) — any stablebond NAV provider:
 * Etherfuse (/lookup/stablebonds), a custom oracle, or external aggregation.
 * The multi-source oracle queries several of these and uses a robust median.
 */
export interface NavSource {
  readonly id: string;
  getNav(code: StablebondCode): Promise<Nav>;
}
