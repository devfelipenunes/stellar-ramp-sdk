# stellar-ramp-sdk

**Yield-bearing ramp SDK para Stellar** — fiat regional ↔ USDC (multi-provider) + auto-park em Stablebonds (Etherfuse).

Desenvolvido por **SDD + TDD**: especificações (Gherkin/ADRs) primeiro, testes que definem o contrato antes do código.

## Status — 03/08/2026

| Bloco                    | Estado                                           |
| ------------------------ | ------------------------------------------------ |
| **Track SDK (Ramp)**     | ✅ green — 27/27 testes                          |
| **Track Yield (Engine)** | ✅ green — 17/17 testes (inclui oracle + SEP-38) |
| **Total**                | ✅ **48/48** · typecheck strict limpo            |
| **apps/demo**            | ✅ server + página + **E2E automatizado**        |

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
- **SEP-38 para stablebonds** — `toSep38Quote()` converte a `BondQuote` para o formato SEP-38 (assets identificados, 7 casas decimais, expiração, price). A pesquisa apontou SEP-38 de stablebond como "espaço aberto". Spec `specs/features/sep38.feature`.

## Comandos

```bash
npm install
npm test                  # 48/48 (SDK + Yield + E2E demo)
npm run typecheck         # tsc strict (src + testes de ambos os packages)
bun examples/basic.ts     # exemplo SDK (mock)
bun apps/demo/server.ts   # demo completo
```

## Pendências (externas / próximos)

- [ ] **API key sandbox** → `GET /ramp/assets` confirma shapes do adapter Etherfuse (transporte já pronto)
- [ ] Adapters **Koywe/Manteca** (PIX live BR) — requerem credenciais
- [ ] Adapter **Etherfuse do Yield** (NAV real + swap) — após shapes
- [ ] Stretch: **SEP-38** para stablebonds + oráculo NAV multi-fonte (ADR-010)

## Decisões de design (resumo)

- **ADR-002/009** — `RampProvider` / `StablebondProvider` como ports → tudo swappable, router multi-anchor (lacuna de mercado).
- **ADR-003** — USDC é o contrato entre tracks → composição limpa no demo.
- **ADR-004/012** — Mock mode de 1ª classe → demo determinística offline, mesmo contrato do live.
- **ADR-005** — Identidades 1× por usuário → evita "Bank account not found".
- **ADR-010** — Yield = NAV por token (não rebase) → `balance()` = tokens × NAV, nunca VWAP spot.
- **ADR-011** — Liquidação just-in-time → 100% auto-park, gasta na hora.
- **ADR-007** — Keys server-side only.
