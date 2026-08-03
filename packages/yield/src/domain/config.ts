import type { CountryCode } from "./entities/country";
import type { StablebondCode } from "./entities/stablebond";
import type { StablebondProvider } from "./ports/stablebond-provider";

export type YieldMode = "mock" | "live";

/** Alocação por país (ADR-012): BR→TESOURO, MX→CETES, US→USTRY. */
export type Allocation = Record<CountryCode, StablebondCode>;

export interface YieldConfig {
  mode: YieldMode;
  provider: StablebondProvider;
  allocation: Allocation;
  /** ADR-011: MVP = 100% auto-park (buffer USDC 0). */
  strategy?: {
    /** % de buffer em USDC (0 no MVP). */
    bufferUsdcPct?: number;
  };
}
