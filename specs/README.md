# Specs — Track SDK (Ramp)

Camada **SDD** de comportamento: Gherkin BDD no idioma do consumidor (`# language: pt`). Cada cenário alimenta um teste TDD (Vitest) em `packages/sdk/tests`.

## Features

| Feature              | Cobre                                 | Especifica                                                           |
| -------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `quote.feature`      | Cotação fiat↔USDC                     | Seleção por país, coerência de montantes, cap sandbox                |
| `router.feature`     | Roteamento multi-anchor               | Escolha por custo, failover, erro `no_provider_for_country`          |
| `onramp.feature`     | fiat → USDC                           | Ciclo `created→funded→completed`, identidade reusada, webhook        |
| `offramp.feature`    | USDC → fiat                           | Burn, payout, `burnTransaction` regenerável, saldo insuficiente      |
| `onboarding.feature` | customer/bank/KYC                     | 1× por usuário, IdentityStore injetável, RFC placeholder             |
| `mock-mode.feature`  | Demo offline                          | Determinístico, taxas realistas, mesmo shape do live                 |
| `yield.feature`      | Track Yield (autoPark/NAV/liquidação) | Alocação por país, NAV por token, liquidate JIT, mock determinístico |

## Mapa ADR ↔ Spec

- ADR-002 (`RampProvider` port) → `quote`, `router`
- ADR-003 (USDC contrato entre tracks) → todas (USDC como entrada/saída)
- ADR-004 (mock mode) → `mock-mode`
- ADR-005 (identidades reusadas) → `onboarding`, `onramp`
- ADR-006 (pathfinding) → swaps internos (ver `offramp` burn)
- ADR-007 (keys server-side) → cross-cutting (fora das features, guarda de `createRamp`)
- ADR-009 (`StablebondProvider` port) → `yield`
- ADR-010 (yield por NAV, não rebase) → `yield` (balance)
- ADR-011 (liquidação JIT) → `yield` (liquidate)
- ADR-012 (alocação por país + mock determinístico) → `yield` (autoPark)
