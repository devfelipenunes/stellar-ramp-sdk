// @stellar-ramp/yield — entrada pública da Track Yield (Engine).
//
// Design SDD/TDD: contracts de domínio emergem de specs/features/*.feature;
// testes em /tests definem o contrato (red → green). ADRs 009–012 em /docs/adr.
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
export * from "./domain";
