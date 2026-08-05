# Plano — `EtherfuseStablebondProvider` real (fechar a Track Yield)

|            |                                                                          |
| ---------- | ------------------------------------------------------------------------ |
| **Status** | Proposto                                                                  |
| **Data**   | 2026-08-05                                                                |
| **Autor**  | Planejamento gerado a partir de `zolvency-yield-ramp` (projeto irmão) — ver seção 12 |

## 0. Contexto — o gap, confirmado por leitura de código e execução dos testes

Hoje `packages/yield` tem a **engine** (interface, alocação por país, NAV, liquidação JIT)
bem desenhada e testada (ADR-009/010/011), mas a única implementação de `StablebondProvider`
é `MockStablebondProvider` — aritmética local, sem rede, sem Stellar. `EtherfuseNavSource`
lê preço real (`GET /lookup/stablebonds`, público), mas só alimenta o `NavOracle` de exibição,
não o `YieldEngine`. Não existe, em lugar nenhum do repositório, um caminho que **de fato**
troque USDC por um stablebond na Etherfuse. Esse diagnóstico está detalhado, com os comandos
usados pra confirmar, em `../../pesquisa/analise-stellar-ramp-sdk.md` no repositório
`hackaton-stellar-summit-etherfuse` (pasta irmã desta).

Este plano fecha esse gap com um adapter real — `EtherfuseStablebondProvider` — seguindo
**exatamente** a arquitetura hexagonal já estabelecida aqui (não um pacote novo, não um
padrão novo). A base técnica (endpoints, payloads, armadilhas) vem de um pacote irmão,
`zolvency-yield-ramp/packages/yield-engine`, cujos três scripts (`balance.ts`, `swap.ts`,
`liquidate.ts`) foram **validados ao vivo contra o sandbox real da Etherfuse** — swap
USDC→TESOURO e TESOURO→USDC executados de ponta a ponta, TESOURO recebido de verdade numa
conta Stellar testnet pública, conferível (ver
`zolvency-yield-ramp/packages/yield-engine/SIMULATION.md`).

## 1. Visão de produto (o que este plano precisa habilitar)

> Uma empresa usa o SDK para oferecer aos seus usuários: **Fiat → USDC → TESOURO** (dinheiro
> parado passa a render), e o usuário consegue **sacar e receber os ativos com o rendimento**
> de volta. O SDK é genérico — outras aplicações compõem por cima. Caso de uso citado como
> exemplo: **caução de leilão** — o usuário trava o saldo em TESOURO como garantia; ao final
> do leilão, recebe de volta o valor **com o rendimento acumulado no período**.

Isso implica três capacidades que este plano cobre, em ordem de dependência:

1. **Swap real** USDC ↔ Stablebond (autoPark / liquidate) — seção 3-6.
2. **Saldo real** (o que o usuário tem, on-chain, não uma contabilidade interna que pode
   divergir da verdade) — seção 7.
3. **Travar/destravar posição** como primitiva genérica (o caso "caução de leilão" é só o
   primeiro consumidor) — seção 9.

## 2. O que já existe e será reaproveitado (nada disso é reescrito)

| Peça já existente | Reaproveitada como |
|---|---|
| `StablebondProvider` (port, ADR-009) | Interface que o novo adapter implementa — **não muda** |
| `EtherfuseNavSource` | `EtherfuseStablebondProvider.getNav()` delega direto pra ela |
| `SecretProvider` / `EnvSecretProvider` (ADR-007) | Como o novo adapter lê `ETHERFUSE_API_KEY` — mesmo padrão do `EtherfuseProvider` da Track Ramp |
| `LiveStellarWallet` (`getUsdcBalance` via Horizon) | Estendida (seção 7), não substituída |
| `IdentityStore` / `createCustomer` (Track Ramp) | Reaproveitados para o customer da Etherfuse ser **o mesmo** entre as duas tracks (seção 8) |
| `YieldEngine`, `createStellarYield` | Ganham um novo modo de uso (`mode: "live"` com o provider real) — API pública não quebra |
| Padrão de ADR + spec Gherkin + TDD (vitest) | Seguido à risca — este plano já nasce com os cenários propostos (seção 10) |

## 3. Peça 1 — `EtherfuseStablebondProvider`

Novo arquivo: `packages/yield/src/adapters/etherfuse/etherfuse-stablebond-provider.ts`,
mesmo diretório da `etherfuse-nav-source.ts`.

```typescript
export interface EtherfuseStablebondProviderOptions {
  baseUrl?: string;                 // default: https://api.sand.etherfuse.com
  secrets: SecretProvider;          // ADR-007 — igual ao EtherfuseProvider da Track Ramp
  keyName?: string;                 // default: "ETHERFUSE_API_KEY"
  customerId: string;               // customer já onboarded (seção 8) — não faz onboarding aqui
  wallet: StellarSigner;            // seção 6 — quem assina a sendTransaction do webhook
  navSource?: NavSource;            // default: createEtherfuseNavSource()
  blockchain?: string;              // default: "stellar"
}

export function createEtherfuseStablebondProvider(
  opts: EtherfuseStablebondProviderOptions,
): StablebondProvider & EtherfuseSwapConfirmation;
```

`getNav`, `quote`, `bonds` — implementação direta, mesma lógica dos nossos scripts:

- `bonds`: resolvidos dinamicamente via `GET /ramp/assets?blockchain=stellar&currency=<fiat>&wallet=<pubkey>`
  (**nunca hardcoda o issuer** — é a regra nº 1 aprendida ao vivo em `zolvency-yield-ramp`,
  o issuer difere entre sandbox e produção).
- `getNav(code)`: delega para `EtherfuseNavSource.getNav(code)` (peça já real, seção 2).
- `quote(code, usdcAmount)`: `POST /ramp/quote` real (`quoteId` gerado por nós — client-side
  UUID, o servidor não gera; confirmado ao vivo). Mapeia `destinationAmount` → `tokens`.

`swapUsdcToBond` / `swapBondToUsdc` — **aqui está a mudança de contrato real** (seção 4).

## 4. O problema central: swap é assíncrono — não existe polling

Confirmado ao vivo (`zolvency-yield-ramp/pesquisa/plan/track-yield-engine.md` §3.1.1):
`POST /ramp/swap` devolve `200` **vazio** na hora — só significa "aceito". O resultado
(a transação Stellar pra assinar, e depois a confirmação) chega **só** via webhook
`swap_updated`. `GET /ramp/order/{id}` devolve `404` pra um swap (esse endpoint só cobre
onramp/offramp). Testei também o WebSocket deles (`wss://.../ramp/ws`) como alternativa —
não cobre `swap_updated`, só `order_updated`.

Isso quebra a suposição atual de `MockStablebondProvider.swapUsdcToBond()`, que devolve uma
`BondPosition` **já resolvida**, na mesma chamada. Um adapter real não pode prometer isso
honestamente. Proposta (formalizar como **ADR-014** ao implementar):

### ADR-014 (rascunho): `BondPosition` ganha `status`, swap real é confirmado em duas fases

```typescript
// packages/yield/src/domain/entities/position.ts — campo novo, não-quebra (opcional)
export interface BondPosition {
  providerId: string;
  code: StablebondCode;
  tokens: Amount;
  nav: Amount;
  fiatValue: Amount;
  fiat: FiatCode;
  createdAt: string;
  status?: "pending" | "settled";   // NOVO. Ausente/"settled" = comportamento atual (mock)
  orderId?: string;                 // NOVO. Necessário pra reconciliar com o webhook depois
}
```

- **Fase 1 — `swapUsdcToBond()`**: valida trustline (seção 7), pede quote, chama
  `POST /ramp/swap`, devolve **imediatamente** uma `BondPosition` com `status: "pending"`,
  `tokens` = estimativa da quote, `orderId` = o gerado por nós.
- **Fase 2 — confirmação**: o adapter expõe um método adicional (interface
  `EtherfuseSwapConfirmation`, não faz parte do `StablebondProvider` — é específico do
  adapter real):

  ```typescript
  export interface EtherfuseSwapConfirmation {
    confirmSwapWebhook(rawBody: string, signatureHeader: string): Promise<BondPosition | null>;
  }
  ```

  Reaproveita **exatamente** a lógica já validada em
  `zolvency-yield-ramp/apps/demo/app/api/etherfuse/webhook/route.ts`: verificação HMAC-SHA256
  sobre JSON canonicalizado (RFC 8785, biblioteca `canonicalize`), extrai `swap_updated.sendTransaction`,
  assina com o `StellarSigner` (seção 6) e submete via Horizon. Devolve `null` se o evento
  não tiver `sendTransaction` ainda (updates intermediários tipo `funds_received`), ou a
  `BondPosition` com `status: "settled"` quando a tx é submetida com sucesso.
  **Payload real confirmado ao vivo**: `{"swap_updated": {orderId, sendTransaction,
  sendTransactionHash, status, ...}}` — o tipo do evento é a própria chave do objeto, não um
  campo `eventType` (armadilha real que caiu na primeira tentativa do projeto irmão — deixar
  isso testado explicitamente, seção 10).

- **Quem chama `confirmSwapWebhook`**: a aplicação hospedeira, na sua própria rota HTTP —
  o `packages/yield` continua sem nenhuma dependência de framework web (nem Next.js, nem
  Express). Ver seção 5.
- **`YieldEngine`**: não muda sua API pública (`autoPark`/`balance`/`liquidate` continuam
  como estão) — mas para o modo `"live"`, `balance()` deve preferir ler a posição real da
  chain em vez do `Map` interno (seção 7), porque o `Map` só reflete o que a fase 1 estimou,
  não necessariamente o que já assentou.

**Consequências (estilo ADR já usado neste repo)**:
- **+** Honesto — a API nunca finge que um swap assíncrono terminou antes de terminar.
- **+** Reaproveita 100% da lógica de verificação de webhook já validada ao vivo no projeto irmão.
- **−** Quem consome `EtherfuseStablebondProvider` precisa ter uma rota HTTP pública (mesma
  exigência que já vale pra Track Ramp — nenhuma novidade de custo operacional).
- **−** `status: "pending"` é um conceito nuovo que o mock não precisa ter — o mock continua
  devolvendo sempre `"settled"` implícito, sem quebrar `specs/features/yield.feature` atual.

## 5. Peça 2 — Webhook handler agnóstico de framework

Novo arquivo: `packages/yield/src/adapters/etherfuse/webhook.ts` — funções puras, sem
`node:http`/Next.js/Express, pra caber em qualquer app hospedeira:

```typescript
export function verifyEtherfuseWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecretBase64: string,
): boolean;

export function parseSwapUpdatedEvent(rawBody: string): SwapUpdatedEvent | null;
```

A parte de "assinar a XDR e submeter" fica dentro do `EtherfuseStablebondProvider`
(`confirmSwapWebhook`, seção 4) porque precisa do `StellarSigner` (seção 6) — as duas funções
acima ficam soltas porque são puras e úteis também pra quem quiser implementar a confirmação
de outro jeito.

Exemplo de uso (documentar em `docs/production.md`, não faz parte do SDK):

```typescript
// rota HTTP da aplicação hospedeira (qualquer framework)
app.post("/webhooks/etherfuse-swap", async (req, res) => {
  const position = await stablebondProvider.confirmSwapWebhook(
    req.rawBody,
    req.headers["x-signature"],
  );
  if (position) await myApp.onYieldSettled(position); // opcional, side-effect da aplicação
  res.status(200).end();
});
```

## 6. Peça 3 — `StellarSigner` (quem assina a transação do webhook)

Novo port, `packages/yield/src/domain/ports/stellar-signer.ts`:

```typescript
export interface StellarSigner {
  readonly publicKey: string;
  sign(unsignedXdr: string, networkPassphrase: string): Promise<string>; // devolve XDR assinada
}
```

Duas implementações:

- **`KeypairStellarSigner`** (`adapters/stellar/keypair-signer.ts`) — assina com uma
  `Keypair` do `@stellar/stellar-sdk`, carregada via `SecretProvider` (ex.:
  `YIELD_WALLET_SECRET`). É o caminho direto, custodial — o mesmo modelo que
  `zolvency-yield-ramp/packages/yield-engine/scripts/*.ts` usa com `DEMO_WALLET_SECRET`.
  Serve bem o caso de uso descrito pelo usuário ("uma empresa usa o SDK") — a empresa custodia
  a wallet do usuário no seu próprio backend, igual a maioria dos wallets custodiais hoje.
- **`ExternalStellarSigner`** (não implementar agora, só deixar o port pronto) — devolveria a
  XDR sem assinar, para a aplicação hospedeira coletar a assinatura do usuário final (wallet
  não-custodial). Mantém a promessa de "SDK genérico" sem forçar modelo de custódia.

## 7. Peça 4 — saldo real, nunca a contabilidade interna do `Map`

`YieldEngine` hoje guarda posição num `Map` privado, em memória, atualizado só pelo que
`swapUsdcToBond`/`swapBondToUsdc` devolvem. Para um provider real isso é uma fonte de verdade
frágil (não sobrevive a restart, pode divergir da chain). A lição do `zolvency-yield-ramp` foi
justamente o oposto: **ler saldo é sempre uma leitura direta da Stellar (Horizon), nunca uma
contabilidade própria** (`track-yield-engine.md` §3.5) — e isso continua funcionando mesmo se
a Etherfuse estiver fora do ar.

Proposta: estender `StablebondProvider` com um método opcional (via
`isChainReadableProvider(provider)`, mesmo padrão de type-guard já usado pra
`isEmbeddedWalletProvider` na Track Ramp):

```typescript
export interface ChainReadableProvider {
  balanceOf(pubkey: string, code: StablebondCode): Promise<Amount>; // lê trustline via Horizon
}
```

`EtherfuseStablebondProvider` implementa isso (espelha `scripts/balance.ts` do projeto irmão:
`Horizon.Server(...).loadAccount(pubkey)`, acha o `asset_code` do bond nos `balances`).
`YieldEngine.balance()` passa a: se o provider for `ChainReadableProvider`, ler tokens de lá
(fonte de verdade); senão (mock), usar o `Map` interno como hoje. NAV continua vindo de
`getNav()` de qualquer forma — nada muda em ADR-010.

## 8. Peça 5 — identidade compartilhada entre as duas tracks

O usuário final não deveria ter dois `customerId` diferentes na Etherfuse (um pro ramp, um pro
yield) — é a mesma organização/conta lá. Reaproveitar o `IdentityStore` que já existe na
Track SDK (ADR-005, "identidades reusadas"):

- `createStellarYield({ mode: "live", provider, ... })` ganha um parâmetro opcional
  `identityStore` + `pubkey`, e resolve o `customerId` da mesma forma que `RampService`
  já faz (`ensureOrganization`) — **antes** de instanciar o `EtherfuseStablebondProvider**,
  não dentro dele (o provider recebe `customerId` já resolvido, como definido na seção 3, pra
  não duplicar a lógica de onboarding/KYC que já existe na Track Ramp).
- Isso significa: `createEtherfuseProvider` (Ramp) e `createEtherfuseStablebondProvider`
  (Yield) podem compartilhar o **mesmo** `customerId`, o **mesmo** `IdentityStore`, mas
  continuam sendo pacotes independentes (ADR-003 não é violada — só o dado `customerId`
  atravessa, nunca uma dependência de import entre os pacotes).

## 9. Peça 6 — travar/destravar posição (o caso "caução de leilão")

Este é um conceito **novo** no domínio do Yield — não existe hoje. Proposta mínima, genérica
o bastante pra qualquer aplicação (leilão é só o primeiro consumidor — outros: garantia de
aluguel, colateral de empréstimo P2P, a "Tesouraria de Agentes" do `trilhas.md` #4):

```typescript
// packages/yield/src/domain/entities/lock.ts (novo)
export interface PositionLock {
  lockId: string;         // gerado pelo caller (ex.: id do leilão)
  code: StablebondCode;
  tokens: Amount;          // quantidade travada, no momento do lock
  navAtLock: Amount;       // NAV no momento do lock — pra reportar rendimento acumulado no unlock
  lockedAt: string;
  reason?: string;         // ex.: "auction_collateral"
}
```

```typescript
// YieldEngine ganha dois métodos novos — API atual não quebra
lock(input: { lockId: string; code: StablebondCode; tokens: Amount; reason?: string }): Promise<PositionLock>;
unlock(lockId: string): Promise<{ tokensReleased: Amount; yieldAccrued: Amount }>; // yieldAccrued = tokens × (NAV agora − navAtLock)
```

**Honestidade arquitetural (documentar isso explicitamente, mesmo estilo "Consequências" dos
ADRs existentes)**: isso é um **lock de bookkeeping da aplicação**, não um lock criptográfico
on-chain. O `YieldEngine` só recusa `liquidate()` sobre tokens marcados como travados — mas
nada impede, hoje, que o dono da chave privada da wallet mova o ativo diretamente na Stellar,
por fora do SDK. Para virar um lock **real** (a garantia genuinamente não pode ser movida sem
autorização de um terceiro — ex. o leiloeiro), duas rotas de evolução, citadas mas **fora do
escopo deste plano**:
1. **Claimable Balance nativa da Stellar** — operação padrão, sem precisar de contrato
   próprio; trava o ativo até uma condição (predicado de tempo/assinatura) ser satisfeita.
2. **Contrato Soroban de escrow** — mais flexível (múltiplas condições, múltiplas partes),
   mais esforço de implementação.

Persistência: `lock`/`unlock` precisam sobreviver a restart do processo — reaproveitar o
mesmo padrão de port já usado pra identidade (`IdentityStore`), um novo
`PositionLockStore` port com as mesmas duas implementações de referência
(`InMemoryPositionLockStore` pra mock/testes, e uma versão SQLite espelhando
`SqliteIdentityStore`).

## 10. `.env` necessário

Nenhum carregamento de `.env` existe hoje no repositório (`SecretProvider` lê
`process.env` puro). Seguindo o mesmo caminho leve usado no projeto irmão — sem adicionar
`dotenv` como dependência — rodar com a flag nativa do Node (`node --env-file=.env ...`,
Node ≥20.6, já é o mínimo do repo por causa do `node:sqlite`).

Criar `packages/yield/.env.example` (mesmo padrão do `zolvency-yield-ramp`):

```bash
# Copie para .env — nunca commitar (.env já está no .gitignore da raiz).

# Mesma chave usada pelo EtherfuseProvider da Track Ramp — a Etherfuse trata os dois como
# o mesmo customer se você reaproveitar o customerId (seção 8).
ETHERFUSE_API_KEY=
ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
ETHERFUSE_ENVIRONMENT=sandbox

# customerId já onboarded (org criada + KYC aprovado via WebSDK /idv — ver docs/production.md)
ETHERFUSE_CUSTOMER_ID=

# Secret do webhook, devolvido 1x por POST /ramp/webhook ao registrar a URL pública do handler
ETHERFUSE_WEBHOOK_SECRET=

HORIZON_URL=https://horizon-testnet.stellar.org

# Wallet que assina a sendTransaction recebida no webhook (KeypairStellarSigner, seção 6).
# Testnet apenas — nunca uma chave com fundos reais.
YIELD_WALLET_SECRET=
```

E o mesmo bloco, com os nomes `ETHERFUSE_*` já usados pela Track Ramp, deve ficar coerente
entre os dois `.env.example` (o de `packages/sdk` já implícito via `ETHERFUSE_API_KEY`, ADR-007)
— não duplicar nomes diferentes pra a mesma chave.

## 11. Plano de implementação (TDD, ordem sugerida)

Seguindo o método já estabelecido no repo (spec Gherkin → teste → código):

1. **Spec nova**: `specs/features/etherfuse-stablebond.feature` — cenários: quote real
   (fetch mockado, como já é feito em `adapters.spec.ts`), swap devolve `status: "pending"`,
   `confirmSwapWebhook` com o payload real documentado na seção 4 vira `status: "settled"`,
   assinatura inválida é rejeitada, evento sem `sendTransaction` devolve `null`.
2. **`etherfuse-stablebond-provider.spec.ts`** — red primeiro, com `fetch` mockado
   (`vi.stubGlobal`, mesmo padrão de `adapters.spec.ts`) cobrindo os payloads reais
   documentados nesta seção e em `zolvency-yield-ramp/pesquisa/plan/track-yield-engine.md` §3.
3. **`webhook.spec.ts`** — a verificação HMAC/canonicalização, com o vetor de teste real
   (é possível reconstruir um a partir do `SIMULATION.md` do projeto irmão).
4. **`keypair-signer.spec.ts`** — assinatura de XDR de teste.
5. Implementar as peças até o vermelho virar verde — sem pular pra próxima peça com testes
   vermelhos (regra já em `AGENTS.md`/cultura do repo).
6. **`lock`/`unlock`** — spec Gherkin (`position-lock.feature`) primeiro, cenário mínimo:
   trava tokens, tenta liquidar (deve falhar), destrava, `yieldAccrued` bate com
   `tokens × (navFinal − navInicial)`.
7. **Só então**, validação manual ao vivo contra o sandbox real (mesmo scripts-modelo do
   projeto irmão, adaptados pra chamar o novo adapter) — documentar em
   `docs/sandbox-confirmation-checklist.md`, seguindo o formato já usado lá (não inventar
   formato novo).
8. Atualizar `AGENTS.md`/`README.md` (tabela de status) e formalizar o **ADR-014** (rascunho
   na seção 4 deste documento) como arquivo próprio em `docs/adr/`.

## 12. Definição de Pronto

- [ ] `EtherfuseStablebondProvider` implementa `StablebondProvider` + `ChainReadableProvider`
      + `EtherfuseSwapConfirmation`, testado com `fetch` mockado (unit) — **nenhum teste do
      `pnpm test` depende de rede real** (mesma regra já em vigor no repo).
- [ ] `confirmSwapWebhook` testado contra o payload real documentado (seção 4) — não uma
      suposição de schema.
- [ ] `YieldEngine.balance()` em modo live lê de `ChainReadableProvider` quando disponível.
- [ ] `lock`/`unlock` com spec Gherkin + testes, persistência via port (não só `Map`).
- [ ] `packages/yield/.env.example` criado, coerente com o da Track Ramp.
- [ ] Validação manual ao vivo contra o sandbox real, documentada com timestamp (mesmo padrão
      de `docs/sandbox-confirmation-checklist.md`).
- [ ] `pnpm test` e `pnpm typecheck` continuam limpos (104 testes existentes + os novos).
- [ ] ADR-014 formalizada em `docs/adr/`.

## 13. Riscos e limitações conhecidas (declarar, não esconder — cultura do repo)

- **`lock`/`unlock` não é on-chain** — seção 9, honestidade arquitetural.
- **Exige rota HTTP pública na aplicação hospedeira** — mesma exigência que a Track Ramp já
  tem para `kyc_updated`; não é custo novo, mas precisa estar claro no `docs/production.md`.
- **`ETHERFUSE_CUSTOMER_ID` pressupõe onboarding já feito** — este plano não inclui o fluxo de
  onboarding do zero para o Yield; reaproveita o que a Track Ramp já resolve (seção 8). Se o
  caso de uso não passar pela Track Ramp (yield "standalone"), o onboarding programático
  (`createCustomer`, KYC, WebSDK `/idv`) precisa ser chamado manualmente, mesma sequência do
  `docs/production.md` atual.
- **`KeypairStellarSigner` é custodial** — adequado ao caso de uso descrito ("empresa" opera a
  wallet do usuário), mas é uma escolha de segurança que a aplicação hospedeira deve entender
  (chave privada do usuário fica com quem instancia o signer).

## 14. Fontes

- `zolvency-yield-ramp/packages/yield-engine/scripts/{balance,swap,liquidate}.ts` — base
  técnica de todo este plano (endpoints, payloads, sequência).
- `zolvency-yield-ramp/packages/yield-engine/SIMULATION.md` — evidência de execução real
  (hash de transação real, conferível em `stellar.expert`).
- `zolvency-yield-ramp/pesquisa/plan/track-yield-engine.md` §3 — a pesquisa completa sobre a
  API da Etherfuse (sandbox vs. produção, formato de ativos, webhook, WebSocket testado e
  descartado).
- `zolvency-yield-ramp/apps/demo/app/api/etherfuse/webhook/route.ts` — implementação de
  referência da verificação HMAC + assinatura da transação.
- `../../pesquisa/analise-stellar-ramp-sdk.md` (no repo `hackaton-stellar-summit-etherfuse`) —
  a análise que identificou o gap que este plano fecha.
- Este próprio repositório: `docs/adr/ADR-009` a `ADR-012`, `specs/features/yield.feature`,
  `docs/sandbox-confirmation-checklist.md`, `docs/production.md`.
