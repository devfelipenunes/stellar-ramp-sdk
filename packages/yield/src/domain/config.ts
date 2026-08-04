import type { CountryCode } from "./entities/country";
import type { StablebondCode } from "./entities/stablebond";
import type { StablebondProvider } from "./ports/stablebond-provider";

export type YieldMode = "mock" | "live";

export type Allocation = Record<CountryCode, StablebondCode>;

export interface YieldConfig {
  mode: YieldMode;
  provider: StablebondProvider;
  allocation: Allocation;

  strategy?: {

    bufferUsdcPct?: number;
  };
}
