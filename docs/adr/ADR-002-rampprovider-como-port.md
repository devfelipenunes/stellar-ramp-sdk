# ADR-002: `RampProvider` como port — providers swappable

|            |             |
| ---------- | ----------- |
| **Status** | Aceita      |
| **Data**   | 2026-08-03  |
| **Tipo**   | Arquitetura |

## Contexto

A pesquisa mostrou que **nenhum provider cobre o Brasil hoje**: Etherfuse tem API completa mas só MXN/SPEI live (BRL/PIX _upcoming_); Koywe e Manteca têm PIX live. Um SDK amarrado a um provider quebra quando o roadmap muda. O produto final é multi-anchor.

## Decisão

`RampProvider` é um **port** do domínio com um contrato mínimo:

```ts
interface RampProvider {
  readonly id: string; // "etherfuse" | "koywe" | "manteca"
  readonly countries: CountryCode[]; // países onde atua
  quote(req: QuoteRequest): Promise<Quote>;
  createOrder(req: CreateOrderRequest): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;
  // hooks de sandbox/lifecycle específicos de provider, se existirem
}
```

- `createRamp({ providers })` injeta a lista; o **router** (application service) escolhe o provider por país/quota (ver spec `quote.feature`).
- Etherfuse é o **primeiro adapter** (sandbox MXN, caminho mais testado). Koywe/Manteca são adapters seguintes para PIX real.
- O SDK NÃO conhece o provider em runtime: tudo passa pelo port.

## Consequências

- **+** Roteamento por país vira regra de domínio pura (testável com mocks).
- **+** Adicionar PIX = `npm i` de um adapter, não refactor.
- **+** Diferencial competitivo: "router multi-anchor" é a lacuna identificada na pesquisa.
- **−** Mínimo denominador comum na interface (funcionalidades específicas de um provider ficam fora do port ou em método opcional).

## Referências

- Spec: `specs/features/quote.feature`, `specs/features/router.feature`
- [ADR-001 — Arquitetura hexagonal](#)
