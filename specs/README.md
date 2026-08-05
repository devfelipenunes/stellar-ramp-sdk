# Specs — SDK (Ramp, embedded wallet)

Camada **SDD** de comportamento: Gherkin BDD no idioma do consumidor (`# language: pt`). Cada cenário alimenta um teste TDD (Vitest) em `packages/sdk/tests`.

## Features

| Feature              | Cobre                             | Especifica                                                                |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `quote.feature`       | Cotação fiat↔cripto                | Seleção por país, coerência de montantes, cap sandbox                     |
| `router.feature`      | Roteamento multi-anchor            | Escolha por custo, failover, erro `no_provider_for_country`               |
| `onramp.feature`      | fiat → cripto (embedded wallet)    | Ciclo `created→funded(approval)→completed`, aprovação P-256, timeout      |
| `offramp.feature`     | cripto → fiat (embedded wallet)    | Mesmo mecanismo de aprovação, burn, saldo insuficiente                    |
| `onboarding.feature`  | customer/bank                      | 1× por usuário, IdentityStore injetável                                   |
| `mock-mode.feature`   | Demo offline                       | Determinístico, taxas realistas, mesmo shape do live                      |

## Mapa ADR ↔ Spec

- ADR-002 (`RampProvider` port) → `quote`, `router`
- ADR-004 (mock mode) → `mock-mode`
- ADR-005 (identidades reusadas) → `onboarding`, `onramp`
- ADR-007 (keys server-side) → cross-cutting (guarda de `createRamp`)
- ADR-013 (contas bancárias por país) → `onboarding`, `onramp`, `offramp`
- ADR-015 (embedded wallet + aprovação P-256, ativo genérico) → `onramp`, `offramp` (substitui ADR-003/009/010/011/014)

Specs do antigo pacote `@stellar-ramp/yield` (`yield.feature`, `nav-oracle.feature`,
`sep38.feature`, `etherfuse-stablebond.feature`, `position-lock.feature`) foram removidas
junto com o pacote — ver ADR-015 e `plan-refactor.md`.
