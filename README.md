# stellar-ramp-sdk

**Yield-bearing ramp SDK para Stellar** — fiat regional ↔ USDC (multi-provider) + auto-park em Stablebonds (Etherfuse).

Desenvolvido por **SDD + TDD**: especificações (Gherkin/ADRs) primeiro, testes que definem o contrato antes do código.

## Status — 04/08/2026

| Bloco                    | Estado                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------ |
| **Track SDK (Ramp)**     | ✅ green — 33/33 testes (adapter Etherfuse real + **2-pass** + idv-launch)           |
| **Track Yield (Engine)** | ✅ green — 22/22 testes (oracle + SEP-38 + **fonte real de NAV**)                    |
| **Total**                | ✅ **75/75** · typecheck strict limpo                                                |
| **apps/demo**            | ✅ server HTTP + **CLI** (`run.ts`) + **E2E** + oráculo **NAV real**                 |
| **Sandbox Etherfuse**    | ✅ shapes reais confirmados (org 201, bank-account 201, **quote 200**, order 2-pass) |

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

## Uso das tracks

```ts
import { createRamp, InMemoryIdentityStore } from "@stellar-ramp/sdk";
import { createYieldEngine, MockStablebondProvider } from "@stellar-ramp/yield";

const ramp = createRamp({
  mode: "mock",
  providers: [],
  identityStore: new InMemoryIdentityStore(),
});
const yield = createYieldEngine({
  mode: "mock",
  provider: new MockStablebondProvider(),
  allocation: { BR: "TESOURO", MX: "CETES", US: "USTRY" },
});

const q = await ramp.quote({
  direction: "onramp",
  country: "BR",
  fiat: "BRL",
  fiatAmount: "100",
});
await ramp.onramp({ quote: q, pubkey: "G-ALICE" }); // fiat → USDC
const pos = await yield.autoPark({ usdcAmount: q.usdcAmount, country: "BR" }); // USDC → TESOURO
const bal = await yield.balance(); // tokens × NAV (rendendo)
const spent = await yield.liquidate({ code: "TESOURO", usdcAmount: "20" }); // gasto JIT
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

- **Pré-requisito 1×**: registrar `iss` + JWKS pública com a Etherfuse; org dona
  da key com KYB aprovado (dashboard).
- **Webhook** `kyc_updated` com `status:"approved"` → a conta bancária nasce
  `compliant:true` → **a ordem fecha**.
- **Sandbox**: auto-aprova (qualquer documento/selfie passa; México exige a
  constancia). Referência: `docs.etherfuse.com/guides/kyc-websdk`.
- Detalhe: o antigo `POST /ramp/onboarding-url` é **deprecated** — o caminho é
  `/auth/launch` com JWT (o helper acima cobre).

## Estrutura

```
docs/adr/                 # 12 ADRs (001–008 SDK · 009–012 Yield)
specs/features/           # 9 features Gherkin (pt)
packages/sdk/             # Track Ramp: router, RampService, adapters mock|etherfuse|memory
packages/yield/           # Track Yield: YieldEngine, MockStablebondProvider,
                          #   NavOracle multi-fonte, SEP-38 quotes
apps/demo/                # server HTTP + dashboard + teste E2E
examples/basic.ts         # SDK puro em 4 linhas
```

## Extra: segurança e interoperabilidade

- **`NavOracle` multi-fonte** (`packages/yield`) — mediana robusta com detecção de outliers (5% vs mediana). Mitiga o exploit da Blend (fev/2026): oráculo VWAP único manipulado (USTRY $1,06 → $106,74). Spec `specs/features/nav-oracle.feature`.
- **Fonte REAL de NAV** — `EtherfuseNavSource` via `GET https://api.etherfuse.com/lookup/stablebonds` (**público**, sem API key; cache 5min). Shape confirmado ao vivo (TESOURO 1.236815 · CETES 1.174769 · USTRY 1.071279). É a 1ª fonte do oráculo no demo (`/api/nav-live`).
- **SEP-38 para stablebonds** — `toSep38Quote()` converte a `BondQuote` para o formato SEP-38 (assets identificados, 7 casas decimais, expiração, price). A pesquisa apontou SEP-38 de stablebond como "espaço aberto". Spec `specs/features/sep38.feature`.

## Comandos

```bash
pnpm install
pnpm test                 # 75/75 (SDK + Yield + E2E demo)
pnpm typecheck            # tsc strict (src + testes de ambos os packages)
bun apps/demo/run.ts      # demo CLI (fluxo completo, mock)
bun apps/demo/server.ts   # demo HTTP em http://localhost:8787
```

## Pendências (externas / próximos)

- [ ] **App**: integrar o **WebSDK `/idv`** (helper `createIdvLaunch` pronto no SDK) — o elo que faz a conta ficar `compliant` e a ordem fechar na sandbox real
- [ ] **Registrar `iss` + JWKS** com a Etherfuse (pré-requisito do launch JWT, 1×)
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
