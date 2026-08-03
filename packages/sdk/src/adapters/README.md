# Adapters (Track SDK)

Providers implementando o port `RampProvider` (ADR-002). O domínio nunca os conhece — tudo injetado via `createRamp`.

| Adapter      | Status                             | Nota                                                                                                                              |
| ------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `mock/`      | ✅ Implementado e testado          | Determinístico, taxas realistas (ADR-004). Demo offline.                                                                          |
| `etherfuse/` | 🚧 Esqueleto com transporte pronto | Endpoints/auth confirmados pela pesquisa; **shapes de resposta a confirmar** com API key (`GET /ramp/assets`). Sandbox: MXN/SPEI. |
| `koywe/`     | ⏳ Pendente                        | PIX live (BR). Requer credenciais e mapeamento da API para implementar.                                                           |
| `manteca/`   | ⏳ Pendente                        | PIX live (BR). Requer credenciais e mapeamento da API para implementar.                                                           |

## Como adicionar um provider (TDD)

1. Spec Gherkin em `specs/features/` descreve o comportamento esperado.
2. Implementa `RampProvider` (`quote`, `createOnrampOrder`, `createOfframpOrder`, `getOrder`, `createCustomer`, `createBankAccount`).
3. Teste em `packages/sdk/tests/` valida o contrato com fetch mocked.
4. Exporta a factory em `src/index.ts`.
