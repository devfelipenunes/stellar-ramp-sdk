# ADR-014: `EtherfuseStablebondProvider` real — swap sem estado formal + lock por bookkeeping custodial

|            |             |
| ---------- | ----------- |
| **Status** | Superseded por ADR-015 |
| **Data**   | 2026-08-05  |
| **Tipo**   | Arquitetura |

## Contexto

`MockStablebondProvider` era a única implementação de `StablebondProvider` (ADR-009) — sem
swap real. O `EtherfuseStablebondProvider` fecha isso, mas dois problemas reais apareceram na
pesquisa validada contra o sandbox (documentada em `zolvency-yield-ramp/pesquisa/plan/
track-yield-engine.md` §3.1.1, projeto irmão):

1. **O swap `POST /ramp/swap` é assíncrono.** A resposta é `200` vazio — só "aceito". O
   resultado (a transação Stellar pra assinar) chega minutos depois via webhook
   `swap_updated`. Não existe polling (`GET /ramp/order/{id}` devolve 404 pra um swap) nem
   WebSocket viável (testado ao vivo, só cobre `order_updated`).
2. **Nenhum caso de uso do MVP precisa de lock on-chain.** O caso de uso motivador (travar
   saldo como garantia — ex. caução de leilão) exige que o usuário não consiga sacar um valor
   por um período, mas o modelo de custódia já escolhido (empresa detém a chave da wallet do
   usuário) já resolve isso na prática.

## Decisão

### Swap em duas fases, sem campo `status` formal em `BondPosition`

`swapUsdcToBond`/`swapBondToUsdc` pedem quote + swap e devolvem a **estimativa** da quote
imediatamente — não esperam o webhook. `confirmSwapWebhook(rawBody, signatureHeader)` é um
método à parte (não faz parte do port `StablebondProvider`, é específico deste adapter):
verifica a assinatura HMAC-SHA256 sobre o JSON canonicalizado (RFC 8785), extrai
`swap_updated.sendTransaction` (o tipo do evento é a própria chave do objeto, não um campo
`eventType` — confirmado ao vivo), assina via `StellarSigner` injetado e submete ao Horizon.

**Não adicionamos `status: "pending" | "settled"` a `BondPosition`.** Em vez de rastrear
estado de assentamento internamente, `balanceOf(pubkey, code)` (novo método do adapter, fora
do port também) lê o saldo **direto da Stellar via Horizon** — nunca confia em contabilidade
própria. "Ainda não apareceu no saldo" e "já apareceu" resolvem o problema do assíncrono sem
precisar de máquina de estado.

### `lock`/`unlock` como bookkeeping em memória, não on-chain

`YieldEngine` ganha `lock(lockId, code, tokens, reason?)` e `unlock(lockId)`. Isso é um
registro simples (`Map` interno) — não move nada on-chain, não usa Claimable Balance nem
contrato de escrow. `liquidate()` calcula `saldo destravado = posição total − soma dos locks
ativos daquele bond` e recusa (`insufficient_unlocked_balance`) qualquer pedido que exceda
isso.

Isso é seguro na prática porque o modelo de custódia do MVP (`KeypairStellarSigner`) já
concentra a única chave capaz de assinar transações daquela wallet na aplicação que usa o
SDK — o usuário não tem canal independente pra mover o saldo. "Travado" = "o SDK recusa
`liquidate()` sobre esses tokens", e isso já é uma garantia real dado esse modelo de custódia,
não uma promessa vazia.

`lock`/`unlock` não sabem nada sobre o motivo do lock — não há conceito de "leilão" em lugar
nenhum do pacote. Aplicações compõem a regra de negócio por cima.

## Consequências

- **+** Nenhum estado de sincronização pra manter consistente entre o adapter e a chain — a
  fonte de verdade é sempre a Stellar.
- **+** `lock`/`unlock` reaproveitáveis por qualquer aplicação (leilão, caução de aluguel,
  colateral de empréstimo P2P) sem nenhuma mudança no pacote.
- **+** Simplicidade: sem `ChainReadableProvider` genérico, sem signer não-custodial — ambos
  adiados até haver um caso de uso real que exija.
- **−** `lock` não sobrevive a um processo custodiando várias instâncias sem persistência
  compartilhada — pra produção multi-instância, o `Map` precisa virar um port (`PositionLockStore`,
  mesmo padrão do `IdentityStore`) com uma implementação real (SQL/Redis). Não implementado
  agora — MVP roda numa instância só.
- **−** O lock não impede o dono da secret key de assinar a transação **fora** do SDK (ex.:
  usando a chave direto com `@stellar/stellar-sdk`). Isso é aceitável **apenas** porque o
  modelo é custodial — se um signer não-custodial for implementado no futuro, essa garantia
  deixa de valer e um lock real (Claimable Balance ou Soroban) passa a ser necessário.
- **−** `liquidate()` agora lança `insufficient_unlocked_balance` sempre que o valor pedido
  excede o saldo destravado — inclusive quando não há nenhum lock ativo e o pedido excede a
  posição total (antes, isso era silenciosamente limitado ao disponível). Nenhum teste
  existente dependia do comportamento antigo; a mudança é deliberada — falhar explicitamente é
  mais seguro do que devolver silenciosamente menos do que foi pedido.

## Referências

- `zolvency-yield-ramp/pesquisa/plan/track-yield-engine.md` §3.1.1 — pesquisa ao vivo que
  confirmou a ausência de polling/WebSocket viável para `swap_updated`.
- `zolvency-yield-ramp/apps/demo/app/api/etherfuse/webhook/route.ts` — implementação de
  referência da verificação HMAC + assinatura, portada sem dependência de Next.js.
- `docs/plan-etherfuse-stablebond-real.md` — plano completo (versão não-simplificada, com
  `status` formal e `ChainReadableProvider` genérico, adiada por esta ADR).
- ADR-009 (`StablebondProvider` como port), ADR-010 (NAV por token), ADR-011 (liquidação JIT).
- Spec: `specs/features/etherfuse-stablebond.feature`, `specs/features/position-lock.feature`.
