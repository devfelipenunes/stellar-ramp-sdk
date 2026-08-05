# ADR-003: USDC é o contrato entre as tracks

|            |             |
| ---------- | ----------- |
| **Status** | Superseded por ADR-015 |
| **Data**   | 2026-08-03  |
| **Tipo**   | Arquitetura |

## Contexto

O projeto foi dividido em duas tracks independentes: **Track SDK (Ramp)** — `fiat ↔ USDC` — e **Track Yield (Engine)** — `USDC → stablebond rendendo → liquidação JIT`. A app final compõe as duas: `PIX → USDC → TESOURO → gasto`. Para as tracks serem submetíveis separadamente e intercambiáveis (qualquer ramp provider / qualquer stablebond), precisam de uma **interface comum bem definida**.

## Decisão

**USDC é o contrato entre as tracks.**

- A Track SDK conversa APENAS com USDC: `ramp.in(fiat) → USDC`, `ramp.out(USDC) → fiat`. Ela não sabe o que acontece depois que entrega USDC.
- A Track Yield assume USDC na entrada: `autoPark(USDC) → stablebond`, `liquidate(USDC)`. Ela não entra/sai fiat.
- Nenhuma das duas referencia a outra. A app (ou um orquestrador fino) faz o wire.

## Consequências

- **+** Substituir Etherfuse por Koywe (ramp) não toca o yield; trocar TESOURO por USTRY não toca o ramp.
- **+** Cada track submete-se sozinha ao hackathon (lane própria).
- **+** A interface vira a narrativa: "dinheiro nunca fica parado".
- **−** Uma perna extra (swap) quando a app compõe: fiat → USDC → stablebond. Custo aceito (pernas já existem no Stellar: onramp + swap).

## Referências

- Nota: `30 - Projects/Stellar SDK + Yield - Divisão de Tracks`
- [ADR-008 — Stack TS](#)
