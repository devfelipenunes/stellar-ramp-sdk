# stellar-ramp-sdk

**Yield-bearing ramp SDK para Stellar** — fiat regional ↔ USDC (multi-provider) + auto-park em Stablebonds (Etherfuse).

Desenvolvido por **SDD + TDD**: especificações (Gherkin/ADRs) primeiro, testes que definem o contrato antes do código.

## Status — 04/08/2026

| Bloco                    | Estado                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Track SDK (Ramp)**     | ✅ green — 65/65 testes (adapter Etherfuse real + **2-pass** + idv-launch + **factories DX** + StellarWallet/SQLite) |
| **Track Yield (Engine)** | ✅ green — 27/27 testes (oracle + SEP-38 + **fonte real de NAV** + **factory DX**)                                   |
| **Total**                | ✅ **104/104** · typecheck strict limpo · **cobertura 92.8%** (gate no CI)                                           |
| **apps/demo**            | ✅ server HTTP + **CLI** (`run.ts`) + **E2E** (KYC /idv → gasto) + oráculo **NAV real**                              |
| **Sandbox Etherfuse**    | ✅ shapes reais confirmados (org 201, bank-account 201, **quote 200**, order 2-pass)                                 |

## O que é

Duas tracks independentes, ligadas por **USDC** (ADR-003):

```text
PIX → [SDK ramp.in] → USDC → [Yield autoPark] → TESOURO (BR) / CETES (MX) / USTRY (US)
gasto → [Yield liquidate JIT] → USDC → [SDK ramp.out] → PIX
```

## Demo (roda offline, modo mock)

```bash
bun apps/demo/server.ts        # http://localhost:8787
```

Fluxo verificado por smoke: `BRL 100 → USDC 18.09 → TESOURO 80.45 tokens (R$ 99,50) → gasto JIT 18.09 USDC → offramp BRL 99.00`.

O dashboard abre com o **passo 0 · KYC `/idv`**: sem conta `compliant` o depósito
responde `409 kyc_required` — o mock enforca o mesmo contrato do live (ADR-004).
Em mock o widget é simulado (modal email/selfie/agreements); em live, o mesmo form
posta em `launch.action` e o usuário retorna via `returnUrl` (`/?kyc=ok`).

## Uso das tracks

Setup em 1 linha por track (as factories montam providers + identityStore +
secrets com defaults):

```ts
import { createStellarRamp } from "@stellar-ramp/sdk";
import { createStellarYield } from "@stellar-ramp/yield";

const ramp = createStellarRamp({ mode: "mock" }); // 1 linha, offline
const engine = createStellarYield({ mode: "mock" }); // 1 linha, offline

const q = await ramp.quote({
  direction: "onramp",
  country: "BR",
  fiat: "BRL",
  fiatAmount: "100",
});
await ramp.onramp({ quote: q, pubkey: "G-ALICE" }); // fiat → USDC
const pos = await engine.autoPark({ usdcAmount: q.usdcAmount, country: "BR" }); // USDC → TESOURO
const bal = await engine.balance(); // tokens × NAV (rendendo)
const spent = await engine.liquidate({ code: "TESOURO", usdcAmount: "20" }); // gasto JIT
```

### Modo live — Etherfuse em 1 factory

A chave vem de `process.env.ETHERFUSE_API_KEY` (EnvSecretProvider + InMemoryIdentityStore

- `createEtherfuseProvider` montados pela factory); troque por `apiKey` para testes/CI:

```ts
import { createStellarRamp } from "@stellar-ramp/sdk";

const ramp = createStellarRamp({
  mode: "live",
  etherfuse: { environment: "sandbox", countries: ["BR", "MX", "US"] },
});
```

## Produção — fluxo completo (KYC via WebSDK /idv)

O SDK cobre toda a parte **programática** (org, dados KYC, conta, quote, order 2-pass).
O elo final — a **aprovação do KYC do usuário final** — é o **WebSDK `/idv`** da
Etherfuse (email + selfie + agreements; **não tem API**). O app assina um JWT e
redireciona o usuário:

```ts
import {
  createRamp,
  InMemoryIdentityStore,
  createIdvLaunch,
  buildIdvLaunchHtml, // helper de launch /idv
} from "@stellar-ramp/sdk";

// 1. onboarding programático (SDK) — cria org + conta
const ramp = createRamp({
  mode: "live",
  providers: [etherfuse],
  identityStore: store,
});
const q = await ramp.quote({
  direction: "onramp",
  country: "BR",
  fiat: "BRL",
  fiatAmount: "100",
  pubkey,
});
await ramp.onramp({ quote: q, pubkey, bankAccount }); // orgId fica no IdentityStore

// 2. redirecionar o usuário para o /idv (sandbox auto-aprova)
const launch = createIdvLaunch({
  orgId, // o organizationId retornado pelo createCustomer (sub do JWT)
  privateKey, // chave RSA privada do app (RS256)
  issuer,
  keyId, // registrados na Etherfuse (1×)
  email,
  name,
  environment: "sandbox", // ou "prod"
});
// POST launch.form → launch.action  (ou use buildIdvLaunchHtml(launch))
```

- **Demo**: o `apps/demo/server.ts` expõe `GET /api/idv-launch` como exemplo
  (gera um JWT com chave mock e devolve o form + HTML do launch).
- **Pré-requisito 1×**: registrar `iss` + JWKS pública com a Etherfuse; org dona
  da key com KYB aprovado (dashboard).
- **Webhook** `kyc_updated` com `status:"approved"` → a conta bancária nasce
  `compliant:true` → **a ordem fecha**.
- **Sandbox**: auto-aprova (qualquer documento/selfie passa; México exige a
  constancia). Referência: `docs.etherfuse.com/guides/kyc-websdk`.
- Detalhe: o antigo `POST /ramp/onboarding-url` é **deprecated** — o caminho é
  `/auth/launch` com JWT (o helper acima cobre).

### Embedded wallet — ordem PIX (fluxo validado na sandbox 04/08/2026)

O onramp real usa um **embedded wallet** (provider-hosted), não a pubkey do
usuário. O SDK cobre o fluxo completo:

```ts
// 1. provisiona a embedded wallet (P-256) — o wallet que recebe o USDC
const wallet = await ramp.provisionWallet("etherfuse"); // { walletId, publicKey }

// 2. quote com walletAddress (a publicKey da embedded wallet)
const q = await ramp.quote({
  direction: "onramp",
  country: "BR",
  fiat: "BRL",
  fiatAmount: "100",
  pubkey: userPubkey,
  walletAddress: wallet.publicKey,
});

// 3. ordem com cryptoWalletId → depositBankName "PIX" → fiat_received → completed
const order = await ramp.onramp({
  quote: q,
  pubkey: userPubkey,
  walletAddress: wallet.publicKey,
  cryptoWalletId: wallet.walletId,
  bankAccount: pixAccount,
});
```

> Sem embedded wallet a ordem rejeita `"Wallet not found or not authorized"` —
> uma conta Stellar avulsa (mesmo fundada + trustline USDC) **não basta**. O
> fluxo validado: `POST /ramp/wallet` (signer P-256) → quote `walletAddress` →
> order `cryptoWalletId` → `fiat_received` → `funded` → `completed`.

### Notas de uso

- **`quote` real exige `pubkey`**: com provider Etherfuse, `ramp.quote()` sem
  `pubkey` não tem `customerId` e falha com `quote_requires_customer` (o mock
  funciona sem). Sempre passe a pubkey do usuário no `quote`.
- **Offramp**: shape do quote/order **validado na sandbox** (04/08) — quote
  `offramp` (USDC→fiat) + ordem aninhada em `offramp.orderId`.
- **Idempotência**: `orderId`/`quoteId` são gerados a cada chamada; em retries,
  reutilize a mesma `orderId` para evitar ordem duplicada.

## Estrutura

```
docs/adr/                 # 12 ADRs (001–008 SDK · 009–012 Yield)
docs/developer-guide.md   # Guia do dev: quickstart, API, fluxos
docs/production.md        # Produção: KYC /idv, embedded wallet, JWKS, sandbox
AGENTS.md                 # Spec de onboarding para IA (arquitetura, gotchas, status)
specs/features/           # 9 features Gherkin (pt)
packages/sdk/             # Track Ramp: router, RampService, adapters mock|etherfuse|memory
packages/yield/           # Track Yield: YieldEngine, MockStablebondProvider,
                          #   NavOracle multi-fonte, SEP-38 quotes
apps/demo/                # server HTTP + dashboard + teste E2E
examples/basic.ts         # SDK puro em 4 linhas
```

## Documentação

- **Dev**: `docs/developer-guide.md` (quickstart, API reference, fluxos)
- **Produção**: `docs/production.md` (KYC `/idv`, embedded wallet, JWKS, sandbox)
- **IA**: `AGENTS.md` (onboarding completo para agentes — arquitetura, contratos, gotchas)

## Extra: segurança e interoperabilidade

- **`NavOracle` multi-fonte** (`packages/yield`) — mediana robusta com detecção de outliers (5% vs mediana). Mitiga o exploit da Blend (fev/2026): oráculo VWAP único manipulado (USTRY $1,06 → $106,74). Spec `specs/features/nav-oracle.feature`.
- **Fonte REAL de NAV** — `EtherfuseNavSource` via `GET https://api.etherfuse.com/lookup/stablebonds` (**público**, sem API key; cache 5min). Shape confirmado ao vivo (TESOURO 1.236815 · CETES 1.174769 · USTRY 1.071279). É a 1ª fonte do oráculo no demo (`/api/nav-live`).
- **SEP-38 para stablebonds** — `toSep38Quote()` converte a `BondQuote` para o formato SEP-38 (assets identificados, 7 casas decimais, expiração, price). A pesquisa apontou SEP-38 de stablebond como "espaço aberto". Spec `specs/features/sep38.feature`.

## Comandos

```bash
pnpm install
pnpm test                 # 104/104 (SDK + Yield + E2E demo)
pnpm typecheck            # tsc strict (src + testes de ambos os packages)
bun apps/demo/run.ts      # demo CLI (fluxo completo, mock)
bun apps/demo/server.ts   # demo HTTP em http://localhost:8787
```

## Pendências (externas / próximos)

- [x] **Demo**: WebSDK `/idv` integrado no dashboard (passo 0 · gate `kyc_required` · retorno `?kyc=ok`) — 81/81 testes
- [ ] **App real**: mesma integração em produção — `iss` + JWKS já registrados na **sandbox** (`secrets/etherfuse/`), faltam os de **prod**
- [ ] Adapters **Koywe/Manteca** (PIX live BR) — requerem credenciais
- [ ] Validar variante **offramp** do quote/order na sandbox (shape aproximado hoje)

## Decisões de design (resumo)

- **ADR-002/009** — `RampProvider` / `StablebondProvider` como ports → tudo swappable, router multi-anchor (lacuna de mercado).
- **ADR-003** — USDC é o contrato entre tracks → composição limpa no demo.
- **ADR-004/012** — Mock mode de 1ª classe → demo determinística offline, mesmo contrato do live.
- **ADR-005** — Identidades 1× por usuário → evita "Bank account not found".
- **ADR-010** — Yield = NAV por token (não rebase) → `balance()` = tokens × NAV, nunca VWAP spot.
- **ADR-011** — Liquidação just-in-time → 100% auto-park, gasta na hora.
- **ADR-007** — Keys server-side only.
