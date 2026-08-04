// @stellar-ramp/yield — public entry point of the Track Yield (Engine).
//
// SDD/TDD design: domain contracts emerge from specs/features/*.feature;
// tests in /tests define the contract (red → green). ADRs 009–012 in /docs/adr.
export { createYieldEngine } from "./application/yield-engine";
export type {
  YieldEngine,
  AutoParkInput,
  LiquidateInput,
} from "./application/yield-engine";
export { MockStablebondProvider } from "./adapters/mock/mock-stablebond-provider";
export type { MockStablebondOptions } from "./adapters/mock/mock-stablebond-provider";
export { createNavOracle } from "./application/nav-oracle";
export type {
  NavOracle,
  NavOracleOptions,
  NavOracleResult,
} from "./application/nav-oracle";
export { toSep38Quote, sep38Amount } from "./application/sep38-quote";
export type { Sep38Config } from "./application/sep38-quote";
export { createEtherfuseNavSource } from "./adapters/etherfuse/etherfuse-nav-source";
export type { EtherfuseNavSourceOptions } from "./adapters/etherfuse/etherfuse-nav-source";
export * from "./domain";
