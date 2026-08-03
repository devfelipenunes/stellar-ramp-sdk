# ADR-012: Alocação por país + mock determinístico (Yield)

|            |                    |
| ---------- | ------------------ |
| **Status** | Aceita             |
| **Data**   | 2026-08-03         |
| **Tipo**   | Estratégia técnica |

## Contexto

O conceito final: `autoPark(USDC, país)` aloca o saldo no stablebond soberano do país (BR→TESOURO, MX→CETES, US→USTRY). E, como na Track SDK, a demo precisa rodar offline sem faucet/liquidez testnet (ADR-004) — o mesmo princípio vale aqui.

## Decisão

- **Alocação por país** é uma regra de domínio pura: `allocation: Record<CountryCode, StablebondCode>`, injetada no `YieldConfig` e testável sem provider.
- **MockStablebondProvider** (ADR-009) usa NAVs e câmbios **realistas** da pesquisa (TESOURO 1,23677 BRL · CETES 1,174751 MXN · USTRY 1,07127 USD; BRL/USD 5,5 · MXN/USD 18) e é **determinístico** (mesma entrada → mesma saída).
- `mode: "mock" | "live"` no `createYieldEngine` — mesmo contrato de dados do live.

## Consequências

- **+** Demo offline determinística (jurados entendem: leg fiat simulado, NAV realista).
- **+** Regra de alocação isolada e testável (custo baixo).
- **−** Mock não cobre movimentação real de NAV/drift; o demo pode injetar um mock com drift para "ver o saldo crescer".

## Referências

- [ADR-004 — Mock mode por design (SDK)](#)
- [ADR-010 — yield por NAV](#)
- Spec: `specs/features/yield.feature`
