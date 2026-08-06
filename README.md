# stellar-ramp-sdk

**SDK de rampa fiat ⇄ Stablebond na Stellar**, via embedded wallet (Etherfuse) — PIX/SPEI
direto para TESOURO/CETES/USTRY (ou USDC), sem hop intermediário, numa wallet só.

Desenvolvido por **SDD + TDD**: especificações (Gherkin/ADRs) primeiro, testes que definem o contrato antes do código.

## Status — 05/08/2026

| Bloco | Estado |
| --- | --- |
| **Pacote `@stellar-ramp/sdk`** | ✅ 89/89 testes · typecheck strict limpo · cobertura 96% (gate: linhas 90%) |
| **Onramp (PIX → TESOURO)** | ✅ validado ao vivo, de ponta a ponta, via este SDK — saldo real confirmado no Horizon |
| **Offramp (TESOURO → BRL)** | ⚠️ burn cripto confirmado on-chain; status final da ordem às vezes trava em `"funded"` no sandbox (ver `Workflow-Manual-teste.md`) |

## O que é

Uma única rota (ADR-015 — substitui o desenho anterior de duas tracks ligadas por USDC):

```text
PIX (BRL) → [ramp.onramp, cryptoAsset="TESOURO:..."] → embedded wallet recebe TESOURO
TESOURO → [ramp.offramp, cryptoAsset="TESOURO:..."] → BRL na conta
```

Não existe mais wallet autocustodiada nem swap USDC↔Stablebond no caminho principal — o
ativo (TESOURO, CETES, USTRY, ou USDC) é só mais um parâmetro (`cryptoAsset`) do
onramp/offramp. O modelo de assinatura é uma única chave **P-256** que a sua aplicação
gera e guarda — a Etherfuse propõe a transação, você aprova assinando.

## Uso

```ts
import {
  createRamp, createEtherfuseProvider, createEnvSecretProvider,
  createEmbeddedWalletSigner, generateEmbeddedWalletKeyPair, InMemoryIdentityStore,
} from "@stellar-ramp/sdk";

const etherfuse = createEtherfuseProvider({
  baseUrl: "https://api.sand.etherfuse.com",
  environment: "sandbox",
  countries: ["BR"],
  secrets: createEnvSecretProvider(),
});
const ramp = createRamp({
  mode: "live",
  providers: [etherfuse],
  identityStore: new InMemoryIdentityStore(),
});

// 1× — gera a chave da embedded wallet e provisiona
const { publicKeyPem, privateKeyPem } = generateEmbeddedWalletKeyPair();
const wallet = await ramp.provisionWallet("etherfuse", publicKeyPem);
const signer = createEmbeddedWalletSigner(privateKeyPem); // guarde privateKeyPem com segurança

// depósito: PIX → TESOURO
const quote = await ramp.quote({
  direction: "onramp", country: "BR", fiat: "BRL", fiatAmount: "100",
  cryptoAsset: "TESOURO:GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4",
  pubkey: wallet.publicKey, walletAddress: wallet.publicKey,
});
const order = await ramp.onramp({
  quote, pubkey: wallet.publicKey, walletAddress: wallet.publicKey, cryptoWalletId: wallet.walletId,
});
// (sandbox) await etherfuse.simulateFiatDeposit(order.id);
const settled = await ramp.settleEmbeddedOrder(order.id, signer); // poll → assina → submete → poll
```

### Modo mock (offline, determinístico)

```ts
import { createRamp, MockProvider, InMemoryIdentityStore } from "@stellar-ramp/sdk";

const ramp = createRamp({
  mode: "mock",
  providers: [new MockProvider()],
  identityStore: new InMemoryIdentityStore(),
});
```

## Documentação

- **`SDK-implementation.md`** — guia de integração para outra aplicação (contratos, fluxo completo, limitações conhecidas).
- **`Workflow-Manual-teste.md`** — como rodar `pnpm flow` e validar o fluxo real contra o sandbox.
- **`AGENTS.md`** — onboarding completo para agentes de IA (arquitetura, gotchas, convenções).
- **`docs/adr/`** — decisões de arquitetura, incluindo ADR-015 (a mudança para embedded wallet).
- **`plan-refactor.md`** — registro da migração do desenho anterior (duas tracks/USDC/swap) para o atual.

## Estrutura

```
packages/sdk/             # Único pacote — router, RampService, adapters mock|etherfuse|memory|stellar
examples/pix-tesouro-brl.ts  # Exemplo único, roda contra o sandbox real (onramp + offramp)
specs/features/           # Specs Gherkin (pt)
docs/adr/                 # ADRs (001–002/004–008/012–013 válidos; 003/009–011/014 superseded por 015)
```

## Comandos

```bash
pnpm install
pnpm test                 # 89/89
pnpm test -- --coverage    # cobertura (gate: linhas 90%, funções 88%, branch 78%)
pnpm typecheck             # tsc strict (src + testes)
pnpm build:publish         # tsup (ESM + dts), artefato publicável no npm
pnpm flow -- 10            # roda examples/pix-tesouro-brl.ts contra o sandbox real (R$10)
```

## Pendências (externas / próximos)

- [ ] Confirmar por que a ordem de offramp às vezes trava em `"funded"` mesmo com o burn confirmado on-chain (ver `Workflow-Manual-teste.md`)
- [ ] Multi-tenant: hoje só existe uma embedded wallet por API key (o "customer raiz") — ver `SDK-implementation.md` §Limitações
- [ ] Publicar no npm (precisa de `NPM_TOKEN`)
- [ ] Etherfuse Brasil ainda não está em produção (só sandbox) — produção real hoje é só México

## Decisões de design (resumo)

- **ADR-015** — Embedded wallet + aprovação P-256 substitui wallet autocustodiada + swap. Ativo genérico (`cryptoAsset`), não mais USDC fixo.
- **ADR-002** — `RampProvider` como port → provider swappable, router multi-anchor.
- **ADR-004** — Mock mode de 1ª classe → mesmo contrato do live, offline, determinístico.
- **ADR-005** — Identidades 1× por usuário → evita "Bank account not found".
- **ADR-007** — Keys server-side only.
- **ADR-013** — Contas bancárias por país (PIX/SPEI).
