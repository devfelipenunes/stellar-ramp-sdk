# ADR-010: Yield no Stellar = NAV por token (não rebase on-chain)

|            |                              |
| ---------- | ---------------------------- |
| **Status** | Aceita                       |
| **Data**   | 2026-08-03                   |
| **Tipo**   | Integração / modelo de dados |

## Contexto

No Stellar, Stablebonds da Etherfuse são **assets clássicos** (trustline, `CODE:ISSUER`) com SAC/SEP-41 — o yield **não** é rebase global on-chain. O rendimento aparece como **NAV crescente por token** (CETES 1,174751 MXN · USTRY 1,07127 USD · TESOURO 1,23677 BRL), observável via `GET /lookup/stablebonds` (cache ~5min). A pesquisa também registrou: o exploit da Blend (fev/2026, ~$10,8M) veio de oráculo **VWAP spot** manipulado.

## Decisão

- O Yield Engine calcula valor via **NAV por token**, nunca via preço de mercado spot.
- `balance()` faz `tokens × NAV` com o NAV do provider (cache ~5min). Nada de VWAP.
- A fonte de NAV é **injetável** (`StablebondProvider.getNav`), permitindo oráculo multi-fonte no futuro (lição do exploit).
- Exibir o yield ao vivo = polling de NAV + variação acumulada desde a entrada; **não** esperar rebase on-chain.

## Consequências

- **+** Valor "rendendo" observável e auditável (mesma matemática da Etherfuse).
- **+** Seguro contra oráculo spot manipulável (ADR explícita a lição da Blend).
- **−** Cache de ~5min = leves atrasos no NAV exibido (aceitável para demo/UX).

## Referências

- Nota: `30 - Projects/Stellar Brazil Ramps - Pesquisa` (§Composabilidade — liquidez fina, exploit Blend)
- [ADR-012 — alocação por país + mock determinístico](#)
