import type { Nav, StablebondCode } from "../entities/stablebond";

/**
 * Fonte de NAV (ADR-010) — qualquer provedor de NAV de stablebond:
 * Etherfuse (/lookup/stablebonds), oráculo próprio, agregação externa.
 * O oráculo multi-fonte consulta várias destas e usa mediana robusta.
 */
export interface NavSource {
  readonly id: string;
  getNav(code: StablebondCode): Promise<Nav>;
}
