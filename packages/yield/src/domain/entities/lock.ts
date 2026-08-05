import type { Amount } from "./money";
import type { StablebondCode } from "./stablebond";

export interface PositionLock {
  lockId: string;
  code: StablebondCode;
  tokens: Amount;
  navAtLock: Amount;
  lockedAt: string;
  reason?: string;
}
