import {
  MockStablebondProvider,
  type MockStablebondOptions,
} from "../adapters/mock/mock-stablebond-provider";
import type { Allocation } from "../domain/config";
import type { StablebondProvider } from "../domain/ports/stablebond-provider";
import { createYieldEngine, type YieldEngine } from "./yield-engine";

const DEFAULT_ALLOCATION: Allocation = {
  BR: "TESOURO",
  MX: "CETES",
  US: "USTRY",
};

export type StellarYieldOptions =
  | { mode: "mock"; mock?: MockStablebondOptions; allocation?: Allocation }
  | {
      mode: "live";
      provider: StablebondProvider;
      allocation?: Allocation;
      strategy?: { bufferUsdcPct?: number };
    };

export function createStellarYield(opts: StellarYieldOptions): YieldEngine {
  if (opts.mode === "mock") {
    return createYieldEngine({
      mode: "mock",
      provider: new MockStablebondProvider(opts.mock),
      allocation: opts.allocation ?? DEFAULT_ALLOCATION,
    });
  }

  if (!opts.provider) {
    throw new Error(
      "createStellarYield: modo live exige provider (StablebondProvider)",
    );
  }
  if (!opts.allocation) {
    throw new Error("createStellarYield: modo live exige allocation");
  }

  return createYieldEngine({
    mode: "live",
    provider: opts.provider,
    allocation: opts.allocation,
    ...(opts.strategy ? { strategy: opts.strategy } : {}),
  });
}
