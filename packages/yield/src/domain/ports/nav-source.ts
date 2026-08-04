import type { Nav, StablebondCode } from "../entities/stablebond";

export interface NavSource {
  readonly id: string;
  getNav(code: StablebondCode): Promise<Nav>;
}
