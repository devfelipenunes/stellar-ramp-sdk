import type { CountryCode } from "./entities/country";
import type { StablebondCode } from "./entities/stablebond";
import type { StablebondProvider } from "./ports/stablebond-provider";

export type YieldMode = "mock" | "live";

/** Per-country allocation (ADR-012): BR→TESOURO, MX→CETES, US→USTRY. */
export type Allocation = Record<CountryCode, StablebondCode>;

export interface YieldConfig {
  mode: YieldMode;
  provider: StablebondProvider;
  allocation: Allocation;
  /** ADR-011: MVP = 100% auto-park (0 USDC buffer). */
  strategy?: {
    /** USDC buffer % (0 in the MVP). */
    bufferUsdcPct?: number;
  };
}
