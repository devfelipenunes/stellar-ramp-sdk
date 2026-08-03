# ADR-006: Pathfinding dinâmico (nunca hardcode)

|            |                    |
| ---------- | ------------------ |
| **Status** | Aceita             |
| **Data**   | 2026-08-03         |
| **Tipo**   | Integração Stellar |

## Contexto

Swaps no Stellar exigem um **path** de ativos. Gotcha do sandbox: swap testnet falha `op_no_path` (pool só em mainnet) e, em prod, hardcodear path quebra quando a liquidez se move. O FAQ da Etherfuse recomenda explicitamente pathfinding via `pathPaymentStrictSend` + Horizon `/paths/strict-send`.

## Decisão

- **Nunca hardcodear path.** Path é resolvido dinamicamente: `pathPaymentStrictSend` com path vazio = direto no orderbook; para rotas multi-hop, consultar Horizon `/paths/strict-send`.
- O pathfinding vive no adapter Stellar (não no domínio); o domínio pede "swap X→Y de montante M", o adapter resolve o caminho.
- Testnet sem liquidez → o demo usa **mock mode** (ADR-004) com as taxas realistas; prod usa pathfinding real.

## Consequências

- **+** Swaps resilientes a movimentação de liquidez.
- **+** Regra de domínio permanece limpa ("swap de valor v"), transporte resolve como.
- **−** Latência extra de 1 call a `/paths` por swap (aceitável).
- **−** Testnet não exercita o pathfinding real (cobertura via mock + testes de contrato no Horizon testnet com USDC canônico).

## Referências

- Spec: `specs/features/swap.feature` (se aplicável)
- Playbook: §5 gotchas (pathfinding) e §6 (fragmentação USDC testnet)
