# ADR-001: Arquitetura hexagonal no SDK

|            |             |
| ---------- | ----------- |
| **Status** | Aceita      |
| **Data**   | 2026-08-03  |
| **Tipo**   | Arquitetura |

## Contexto

O SDK integra múltiplos providers de ramp (Etherfuse, Koywe, Manteca) com contratos e gotchas muito diferentes, exige mock mode para testnet e precisa ser testável via TDD. Sem separação de fronteiras, a lógica de negócio vira refém de cada SDK de provider.

## Decisão

Adotar **arquitetura hexagonal** (portas e adaptadores), espelhando o padrão já usado no projeto `cortes-automatizados`:

```
src/
  domain/          # puro, SEM dependências externas
    ports/         # interfaces (contratos) — RampProvider, Storage, ...
    entities/      # tipos/objetos de domínio — Quote, Order, Customer, ...
  application/     # services de orquestração — RampService, Router
  adapters/
    driving/       # exposição — createRamp (factory), cliente do SDK
    driven/        # implementações externas — etherfuse/, koywe/, manteca/, mock/
```

- `domain` não importa nada externo (sem axios, sem js-stellar-sdk). Só tipos TS puros.
- Adapters implementam os ports e são injetados via factory (`createRamp`).
- O domínio é o único lugar com regras de negócio; tudo que é I/O vive nos adapters.

## Consequências

- **+** Testável: testes de domínio usam mocks dos ports, sem rede/chain.
- **+** Providers swappable: novo provider = novo adapter, zero mudança em domínio.
- **+** Mock mode é só mais um adapter (ADR-004).
- **−** Mais arquivos/indireção que uma implementação inline.
- **−** Custo de setup inicial (factories, injeção).

## Referências

- [ADR-002 — RampProvider como port](#)
- [ADR-004 — Mock mode por design](#)
- [ADR-007 — API keys server-side](#)
