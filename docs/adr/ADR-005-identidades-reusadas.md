# ADR-005: Identidades de cliente geradas 1× e reusadas

|            |                      |
| ---------- | -------------------- |
| **Status** | Aceita               |
| **Data**   | 2026-08-03           |
| **Tipo**   | Dados / consistência |

## Contexto

Gotcha nº 1 do FAQ comunitário da Etherfuse: `customer_id` e `bank_account_id` são gerados **uma vez** pelo app consumidor e devem ser **reusados para sempre** — recriá-los quebra com "Bank account not found". Se o SDK esquecer isso, a demo quebra na segunda ordem.

## Decisão

- O SDK **persiste** o mapeamento `pubkey do usuário → { customerId, bankAccountId }` via um port `IdentityStore`.
- `IdentityStore` é injetado (hexagonal) — impl: KV em memória (demo) ou SQLite/Redis (server).
- `createRamp({ identityStore })`; o fluxo de onboarding consulta antes de criar: se existe, reusa; senão cria e grava.
- O mapeamento é **por usuário do app**, não por dispositivo/instância — chaveado pela chave pública Stellar do usuário.

## Consequências

- **+** Idempotência: N ordens do mesmo usuário não duplicam identidade.
- **+** Onboarding "1× por usuário" vira regra de domínio testável.
- **−** Novo port = nova dependência injetada (custo de setup baixo).
- **−** Demo precisa de storage persistente mínima (senão perde identidade ao recarregar — aceitável em mock).

## Referências

- Spec: `specs/features/onboarding.feature`
- Playbook: `80 - Playbooks/Etherfuse Sandbox - Onboarding e Gotchas` (§5 gotchas)
