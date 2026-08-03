# ADR-011: Liquidação just-in-time (100% auto-park no MVP)

|            |                       |
| ---------- | --------------------- |
| **Status** | Aceita                |
| **Data**   | 2026-08-03            |
| **Tipo**   | Estratégia de produto |

## Contexto

A pesquisa levantou a decisão de design: **saldo 100% em stablebond vs buffer USDC**. O conceito do produto é "dinheiro nunca fica parado" — o usuário quer máximo yield; mas liquidez de stablebond no Stellar é fina (pool CETES/XLM ~768 CETES), então liquidar grande volume de uma vez é arriscado.

## Decisão

- **MVP: 100% auto-park com liquidação just-in-time.** Quando o usuário gasta, `liquidate()` converte stablebond→USDC no momento do gasto (JIT). Buffer USDC = 0.
- A decisão é **configurável** no `YieldConfig` (campo `strategy`), mas o default e a demo usam 100% JIT.
- Guarda de volume: o liquidate delega ao provider; providers reais (Etherfuse) têm seus limites; mock respeita o mesmo contrato.

## Consequências

- **+** Narrativa clara: "entrou, rende; gastou, liquidou" (composição PIX→USDC→TESOURO→gasto).
- **+** Máximo yield no saldo parado.
- **−** O gasto paga uma perna extra (stablebond→USDC) → latência de segundos no JIT (aceitável).
- **−** Risco de liquidez em volume grande → mitigado por limites do provider + JIT (nunca liquida o que não está sendo gasto).

## Referências

- Nota: `30 - Projects/Stellar SDK + Yield - Divisão de Tracks` (decisão de design nº 1)
- Spec: `specs/features/yield.feature` (cenário de liquidação)
