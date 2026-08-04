// @stellar-ramp/sdk — public entry point of the Track SDK (Ramp).
//
// SDD/TDD design: domain contracts (entities/ports) emerge from the Gherkin
// scenarios in /specs; tests in /tests define the contract before the code
// (red → green phase). ADRs in /docs/adr.
export { createRamp } from "./application/ramp-service";
export type {
  RampService,
  OnrampInput,
  OfframpInput,
} from "./application/ramp-service";
export { Router } from "./application/router";
export { MockProvider } from "./adapters/mock/mock-provider";
export type {
  MockProviderOptions,
  MockRate,
} from "./adapters/mock/mock-provider";
export { createEtherfuseProvider } from "./adapters/etherfuse/etherfuse-provider";
export type { EtherfuseProviderOptions } from "./adapters/etherfuse/etherfuse-provider";
export {
  buildIdvLaunchHtml,
  createIdvLaunch,
  type IdvLaunch,
  type IdvLaunchOptions,
} from "./adapters/etherfuse/idv-launch";
export { InMemoryIdentityStore } from "./adapters/memory/in-memory-identity-store";
export * from "./domain";
