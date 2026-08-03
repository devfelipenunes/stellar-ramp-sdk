// @stellar-ramp/sdk — entrada pública da Track SDK (Ramp).
//
// Design SDD/TDD: os contracts de domínio (entities/ports) emergem dos
// cenários Gherkin em /specs; os testes em /tests definem o contrato antes
// do código (fase red → green). ADRs em /docs/adr.
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
export { InMemoryIdentityStore } from "./adapters/memory/in-memory-identity-store";
export * from "./domain";
