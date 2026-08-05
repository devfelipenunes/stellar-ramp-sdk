# Plano de refatoração — fluxo validado PIX → TESOURO → BRL (embedded wallet)

> Documento de planejamento. **Nada aqui foi executado** — só as consultas de API/pesquisa
> necessárias pra validar as premissas (marcadas como "validado ao vivo" abaixo). Nenhum
> arquivo do repositório foi apagado ou reescrito.

---

## 1. Por que este plano existe

Durante esta sessão, testamos ao vivo (contra o sandbox real da Etherfuse) duas hipóteses de
arquitetura que já estavam implementadas no repositório — "tudo na wallet autocustodiada" e
"tudo na embedded wallet via swap" — e nenhuma fecha o ciclo completo com uma única wallet.
Só uma terceira variante, descoberta na documentação oficial (`docs.etherfuse.com/guides/
embedded-wallets`) e **confirmada com dinheiro real de testnet**, fecha:

**PIX (BRL) → TESOURO direto (onramp) · TESOURO → BRL direto (offramp)** — sem USDC no meio,
sem wallet autocustodiada, sem swap. Tudo numa única embedded wallet, assinado por uma chave
P-256 que a própria aplicação gera e guarda.

Isso muda a arquitetura na raiz: o pacote `@stellar-ramp/yield` (autoPark/liquidate via swap)
não tem papel nesse fluxo — TESOURO passa a ser só mais um ativo de destino/origem do onramp/
offramp do pacote `@stellar-ramp/sdk`. Este documento planeja essa mudança.

---

## 2. O que foi validado ao vivo nesta sessão (evidência)

| Testado | Resultado | Como confirmamos |
|---|---|---|
| Onramp BRL→USDC na embedded wallet, assinando a aprovação com a chave P-256 já registrada | ✅ Funciona | `POST /ramp/order/{id}/approvals` → `200 completed:true`; Horizon mostrou `create_claimable_balance` → `change_trust` → `claim_claimable_balance`; saldo real 19.4968332 USDC |
| Onramp **BRL→TESOURO direto** (pulando USDC), mesmo mecanismo | ✅ Funciona | Mesma sequência on-chain; saldo real 8.6192890 TESOURO |
| Offramp **TESOURO→BRL** (quote) | ✅ Aceito, mesmo mecanismo de aprovação da doc | `200`, `requiresSwap:false`; não completamos o ciclo até o fim (ver §9, risco aberto) |
| Offramp **TESOURO→USDC** (cripto, não fiat) | ❌ Rejeitado | API: `targetAsset` de offramp só aceita `BRL`/`MXN` |
| **Swap** USDC↔TESOURO na embedded wallet (com as duas trustlines já abertas) | ❌ Aceito (`200`) mas nunca assenta | Sem webhook, sem mudança de saldo, sem ordem consultável, após 90s+ |
| Saque/transferência cripto da embedded wallet pra endereço externo | ❌ Não existe | Confirmado na doc: só onramp (entra) e offramp (sempre fiat, nunca cripto) |
| `POST /ramp/wallet` escopado a um customer específico (não o raiz da API key) | ❌ Não suportado | Erro explícito da API: *"Embedded-wallet provisioning is not supported for customer wallets — use POST /wallet"* |

O último ponto é uma **limitação de produto confirmada, não um bug do nosso código**: hoje só
existe uma embedded wallet por conta/API key (o customer "raiz", pré-aprovado quando a conta
sandbox foi criada). Isso define o modelo de custódia do SDK como **pool único por
aplicação** (uma tesouraria, não uma wallet por usuário final) — documentado explicitamente
no plano, não escondido.

---

## 3. Arquitetura proposta (visão geral)

```
┌─────────────────────────────────────────────────────────────────┐
│  @stellar-ramp/sdk  (único pacote na rota crítica)              │
│                                                                   │
│  createStellarRamp({ mode: "live", etherfuse: {...} })          │
│         │                                                        │
│         ├── quote({ direction, sourceAsset, targetAsset, ... })  │
│         │     — targetAsset/sourceAsset genérico: BRL, USDC,     │
│         │       TESOURO, CETES, USTRY — não hardcoded em USDC    │
│         │                                                        │
│         ├── onramp({ quote, walletId })  → Order (status funded) │
│         ├── offramp({ quote, walletId }) → Order (status funded) │
│         │                                                        │
│         └── settleEmbeddedOrder({ orderId, signerPrivateKeyPem })│
│               — poll até `approval` aparecer, assina com P-256,  │
│                 submete, poll até `completed`. Método novo,      │
│                 encapsula o que hoje é feito por 6 chamadas curl │
└─────────────────────────────────────────────────────────────────┘
```

`@stellar-ramp/yield` sai da rota crítica (motivo e detalhes no §5.3).

---

## 4. Limpeza do repositório (passo 1 do pedido)

Tabela completa, arquivo por arquivo. "Deletar" significa remoção total; "Reescrever" significa
o conteúdo atual fica obsoleto mas o arquivo continua a existir com conteúdo novo.

### 4.1 Scripts (`scripts/`) — deletar tudo

| Arquivo | Motivo |
|---|---|
| `scripts/confirm-sandbox.mjs` | Onboarding org+KYC via `/idv` manual — o novo fluxo usa o customer raiz já aprovado, não precisa recriar org por execução |
| `scripts/confirm-followup.mjs` | Conta PIX + `provisionWallet` + ordem — lógica será absorvida pelo SDK (`onramp`/`settleEmbeddedOrder`), não como script solto |
| `scripts/fund-wallet.mjs` | Fundava wallet autocustodiada com USDC/trustline — não existe mais wallet autocustodiada no fluxo principal |
| `scripts/gen-keys.mjs` | Gerava chave RSA pro JWT do `/idv` — mantido **só se** o onboarding real de novos usuários for implementado (ver §9); a lógica de gerar chave **P-256** (a que realmente importa agora) deve virar uma função do SDK (`createEmbeddedWalletSigner()`), não um script solto |

### 4.2 Examples (`examples/`) — deletar tudo, substituir por um único exemplo novo

| Arquivo | Motivo |
|---|---|
| `examples/basic.ts` | Demonstra a composição mock `ramp + yield` — `yield` sai da rota crítica |
| `examples/sdk-flow.ts` | Construído em cima do swap USDC↔TESOURO numa wallet autocustodiada — substituído pelo novo fluxo |
| `examples/yield-lock-demo.ts` | Demo do `lock`/`unlock` do pacote yield — sai junto com o pacote |
| `examples/etherfuse-yield-live.ts` | Demo do swap real — mecanismo confirmado incompatível com embedded wallet |
| `examples/etherfuse-webhook-server.ts` | Recebia `swap_updated` — esse webhook não é mais usado (o novo fluxo é poll + approval assinada, não webhook) |

**Novo**: `examples/pix-tesouro-brl.ts` — único exemplo, documentado em detalhe no §6.

### 4.3 Demo app (`apps/demo/`) — deletar

| Arquivo | Motivo |
|---|---|
| `apps/demo/server.ts` | Servidor HTTP da composição mock antiga (fiat→USDC→TESOURO→liquidate→offramp) |
| `apps/demo/run.ts` | CLI da mesma composição |
| `apps/demo/tests/e2e.spec.ts` | E2E do fluxo antigo — sem o server, não tem o que testar |

### 4.4 Pacote `@stellar-ramp/yield` — recomendação: remover por completo

**Justificativa**: o pacote inteiro existe pra resolver "USDC ↔ Stablebond via swap" — e essa é
exatamente a peça que confirmamos **não funcionar** pra embedded wallet (§2). O papel que
sobra pro Yield (entrar/sair de TESOURO) já é feito pelo onramp/offramp do SDK, direto. Manter
o pacote significa manter ~30 arquivos de código morto (adapter que nunca assenta, signer
Ed25519 que não serve pra essa wallet, verificação de webhook que não dispara mais).

Se no futuro existir um caso de uso genuinamente diferente (ex.: usuário com wallet
autocustodiada própria, que já tem USDC e quer comprar Stablebond sem passar por rampa fiat),
esse pacote pode voltar — mas como uma decisão nova, não como resíduo do fluxo atual.

| Diretório/arquivo | Ação |
|---|---|
| `packages/yield/src/**` (todo) | Deletar |
| `packages/yield/tests/**` (todo) | Deletar |
| `packages/yield/package.json`, `tsconfig*.json` | Deletar |
| Entrada em `tsup.config.ts` pro build do yield | Remover |
| `pnpm-workspace`/`package.json` (`workspaces: ["packages/*"]`) | Sem mudança — continua pegando só o que existir em `packages/` |

**Se você preferir não remover** (ex.: quer manter como referência histórica), a alternativa é
mover `packages/yield` inteiro para fora do workspace ativo (ex.: `archive/yield/`, sem
`package.json` reconhecido pelo pnpm) — mantém o código acessível sem ele aparecer em
`pnpm test`/`pnpm typecheck`/`pnpm build`. Recomendo a remoção lisa; a alternativa fica
registrada aqui caso você discorde.

### 4.5 Documentação — reescrever ou arquivar

| Arquivo | Ação | Motivo |
|---|---|---|
| `tutorial.md` | Reescrever do zero | Descreve o fluxo de duas wallets/swap que não é mais o caminho recomendado |
| `docs/production.md` | Reescrever | Descreve embedded wallet + onramp via `cryptoWalletId`/quote USDC-only; falta o mecanismo de aprovação P-256 e o onramp/offramp direto pra TESOURO |
| `docs/developer-guide.md` | Reescrever | Quickstart e API reference citam `@stellar-ramp/yield` e o padrão `autoPark`/`liquidate` |
| `docs/sandbox-confirmation-checklist.md` | Deletar (ou arquivar em `docs/archive/`) | Notas de sessão do fluxo antigo, já supersedidas |
| `docs/plan-etherfuse-stablebond-real.md` | Deletar (ou arquivar) | Plano da "Simplificação MVP" do swap — decisão revertida por este documento |
| `README.md` | Reescrever seções "O que é", "Uso das tracks", "Comandos" | Hoje descreve duas tracks (Ramp + Yield); passa a ser uma track só |
| `AGENTS.md` | Atualizar | Onboarding de IA cita a arquitetura antiga |

### 4.6 ADRs (`docs/adr/`) — manter como histórico, adicionar novos

Não recomendo apagar ADRs — são registro de decisão, e várias continuam parcialmente válidas
(ex. ADR-001 arquitetura hexagonal, ADR-007 keys server-side). Recomendo marcar como
**superseded** as que descrevem o que este plano reverte, e criar ADRs novos:

| ADR existente | Ação |
|---|---|
| ADR-003 (USDC contrato entre tracks) | Marcar **superseded by ADR-015** — USDC deixa de ser o contrato entre tracks porque só existe uma track |
| ADR-009 (StablebondProvider como port), ADR-010 (yield por NAV), ADR-011 (liquidação JIT) | Marcar **superseded by ADR-015** — conceitos do pacote yield removido |
| ADR-014 (swap assíncrono) | Marcar **superseded by ADR-016** — o swap nem chega a ser usado no fluxo novo |
| ADR-002, 004, 005, 006, 007, 008, 012, 013 | Seguem válidos, sem mudança |

Novos ADRs a escrever (fora do escopo deste documento, só listados):
- **ADR-015** — Embedded wallet (P-256, approval signing) substitui wallet autocustodiada + swap
- **ADR-016** — Onramp/offramp com ativo genérico (TESOURO direto), sem USDC intermediário
- **ADR-017** — Modelo de custódia é pool único por aplicação, não wallet por usuário final

### 4.7 Specs Gherkin (`specs/features/`)

| Arquivo | Ação |
|---|---|
| `etherfuse-stablebond.feature`, `position-lock.feature`, `nav-oracle.feature`, `sep38.feature`, `yield.feature` | Deletar (specs do pacote yield removido) |
| `onramp.feature`, `offramp.feature` | Reescrever pro fluxo com ativo genérico + aprovação |
| `quote.feature`, `onboarding.feature`, `mock-mode.feature`, `router.feature` | Revisar, ajuste pontual (a maioria continua válida — quote/onboarding não mudam de forma, só o asset de destino) |

### 4.8 `secrets/etherfuse/` e `.env`/`.env.example`

| Item | Ação |
|---|---|
| `secrets/etherfuse/embedded-wallet-*.json` (chave P-256 + walletId) | **Manter** — é exatamente a credencial que o novo fluxo usa |
| `secrets/etherfuse/jwtRS256.key`, `jwks.json`, `kid.txt` (RSA, pro `/idv`) | Manter só se o onboarding de novos usuários reais for implementado (§9); não é usado no fluxo pool-único validado |
| `.env.example` — `ETHERFUSE_WEBHOOK_SECRET` | Remover — não existe mais webhook `swap_updated` no fluxo |
| `.env.example` — `YIELD_WALLET_SECRET` | Remover — não existe mais wallet autocustodiada |
| `.env.example` — novo: `ETHERFUSE_WALLET_ID`, `ETHERFUSE_SIGNER_PRIVATE_KEY_PATH` | Adicionar — credenciais da embedded wallet |

---

## 5. Design detalhado do novo fluxo (passo 2 do pedido)

### 5.1 Modelo de domínio — mudanças necessárias

**`Order` (`packages/sdk/src/domain/entities/order.ts`)** hoje assume destino sempre USDC
(`usdcAmount`) e um modelo de saque por `burnTransaction` (assinatura Ed25519 direta). Precisa
generalizar:

```ts
export interface Order {
  id: string;
  providerId: string;
  direction: OrderDirection;
  country: CountryCode;
  fiat: FiatCode;
  fiatAmount: Amount;

  targetAsset: string;          // era usdcAmount fixo; agora "USDC:G..." | "TESOURO:G..." | etc.
  targetAmount: Amount;         // renomeado de usdcAmount

  status: OrderStatus;          // adicionar "funded" já existe; ok
  createdAt: string;
  updatedAt: string;
  statusPageUrl?: string;

  approval?: EmbeddedWalletApproval;   // substitui burnTransaction
  stellarClaimableBalanceId?: string;  // só onramp
}

export interface EmbeddedWalletApproval {
  approvalMessageId: string;
  approvalMessage: string;   // string crua — assinar exatamente esses bytes
  summary: string;           // ex. "Claim 19.49 USDC" — só exibição
}
```

**`Quote`** — mesma generalização: `usdcAmount` → `targetAmount` + `targetAsset`.

**Novo port** `EmbeddedWalletSigner` (substitui `StellarSigner` do pacote yield, que assinava
XDR Ed25519 — este assina a `approvalMessage` com ECDSA P-256/SHA-256):

```ts
export interface EmbeddedWalletSigner {
  readonly publicKeyPem: string;
  sign(approvalMessage: string): string; // retorna hex, DER-wrapped (crypto.createSign)
}

export function createEmbeddedWalletSigner(privateKeyPem: string): EmbeddedWalletSigner { ... }
```

**Novo método no `RampProvider`** (ou serviço de nível superior, ver §5.3):

```ts
getOrder(orderId: string): Promise<Order>;              // já existe, generaliza o shape
submitApproval(orderId: string, signed: {
  approvalMessageId: string;
  approvalMessage: string;
  signature: string;
}): Promise<{ approvalMessageId: string; completed: boolean }>;  // novo
```

### 5.2 Fluxo passo a passo

**Setup (1×, não repete por depósito):**
1. Gerar par de chaves P-256 (`createEmbeddedWalletSigner` internamente ou helper exportado).
2. `POST /ramp/wallet` com a chave pública → guarda `walletId` + `publicKey` retornados.
3. `POST /ramp/customer/{customerId}/bank-account` pro customer raiz da API key (já
   pré-aprovado em sandbox) → guarda `bankAccountId`.

**Depósito (PIX → TESOURO), repete a cada operação:**
1. `quote({ direction: "onramp", country: "BR", fiat: "BRL", fiatAmount, walletAddress, targetAsset: "TESOURO:..." })`
2. `onramp({ quote, walletId, bankAccountId })` → `Order` com `status: "created"`, retorna
   `depositAmount`/`depositBankName` (dados do PIX a mostrar ao usuário)
3. *(sandbox)* `simulateFiatDeposit(orderId)` — em produção, isso é o PIX de verdade caindo
4. `settleEmbeddedOrder(orderId, signer)`:
   - poll `getOrder(orderId)` a cada ~5s até `status === "completed"` e `approval` presente
     (levou ~45s no teste ao vivo — **usar timeout generoso, 3-5min**, não os 15s usados no
     fluxo antigo de swap)
   - reler a ordem imediatamente antes de assinar (o `approvalMessage` embute timestamp
     renovado a cada leitura — assinar um valor antigo é rejeitado)
   - `signer.sign(order.approval.approvalMessage)` → hex
   - `submitApproval(orderId, { approvalMessageId, approvalMessage, signature })`
   - poll de novo até `status === "completed"` (a submissão da aprovação é o que dispara
     `ChangeTrust` + `ClaimClaimableBalance` on-chain)
5. Ler saldo real via Horizon (`GET /accounts/{walletPublicKey}`) pra confirmar — nunca confiar
   só na resposta da API da Etherfuse como fonte de verdade do saldo (mesmo princípio do
   ADR-014 antigo, que continua válido).

**Saque (TESOURO → BRL):**
Mesma sequência do depósito, com `direction: "offramp"`, `sourceAsset: "TESOURO:..."`,
`targetAsset: "BRL"` (fiat). Mecanismo de aprovação idêntico (confirmado na doc; quote testada
ao vivo, ciclo completo ainda não fechado nesta sessão — ver §9).

### 5.3 Onde essa lógica mora no código

Proposta: um método de alto nível no `RampService`, não um script solto:

```ts
export interface RampService {
  quote(req: QuoteRequest): Promise<Quote>;
  onramp(input: OnrampInput): Promise<Order>;
  offramp(input: OfframpInput): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;
  provisionWallet(providerId: string): Promise<{ walletId: string; publicKey: string }>;

  // novo — encapsula poll + assina + submete + poll, com timeout configurável
  settleEmbeddedOrder(orderId: string, signer: EmbeddedWalletSigner, opts?: {
    pollIntervalMs?: number;
    timeoutMs?: number;
  }): Promise<Order>;
}
```

Isso é o que torna o SDK **genérico pra outra aplicação** (pedido do usuário): quem importa o
pacote não precisa saber que existe um `approvalMessage`, timestamp renovável, ou polling —
chama `onramp()` e `settleEmbeddedOrder()`, os dois métodos públicos.

### 5.4 Exemplo de uso (o que vira `examples/pix-tesouro-brl.ts`)

```ts
import { createStellarRamp, createEmbeddedWalletSigner } from "@stellar-ramp/sdk";

const ramp = createStellarRamp({
  mode: "live",
  etherfuse: { environment: "sandbox", countries: ["BR"] },
});

const signer = createEmbeddedWalletSigner(process.env.ETHERFUSE_SIGNER_PRIVATE_KEY_PEM!);

// depósito
const quote = await ramp.quote({
  direction: "onramp", country: "BR", fiat: "BRL", fiatAmount: "100",
  targetAsset: "TESOURO:GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4",
  walletAddress: process.env.ETHERFUSE_WALLET_PUBLIC_KEY,
});
const order = await ramp.onramp({ quote, walletId: process.env.ETHERFUSE_WALLET_ID! });
// (sandbox) await ramp.simulateFiatDeposit(order.id);
const settled = await ramp.settleEmbeddedOrder(order.id, signer);
console.log("TESOURO recebido:", settled.targetAmount);

// saque
const outQuote = await ramp.quote({
  direction: "offramp", country: "BR", fiat: "BRL",
  sourceAsset: "TESOURO:GC3CW7...", usdcAmount: "5", // valor em TESOURO
});
const outOrder = await ramp.offramp({ quote: outQuote, walletId: process.env.ETHERFUSE_WALLET_ID! });
await ramp.settleEmbeddedOrder(outOrder.id, signer);
```

---

## 6. Testes — o que manter, reescrever, criar

| Pacote/arquivo | Ação |
|---|---|
| `packages/sdk/tests/mock-mode.spec.ts` | Manter, ajustar shape (`targetAsset`/`targetAmount`) |
| `packages/sdk/tests/onramp.spec.ts`, `offramp.spec.ts` | Reescrever — cobrir asset genérico + `approval` em vez de `burnTransaction` |
| `packages/sdk/tests/quote.spec.ts`, `onboarding.spec.ts`, `contracts.spec.ts`, `adapters.spec.ts`, `stellar-ramp.spec.ts` | Manter, ajuste pontual de shape |
| `packages/sdk/tests/idv-launch.spec.ts` | Manter (só relevante se §9/onboarding real for implementado) |
| `packages/sdk/tests/sqlite-identity-store.spec.ts`, `live-stellar-wallet.spec.ts` | Revisar se `live-stellar-wallet` (balance guard Horizon) ainda faz sentido sem offramp por burn — provavelmente sim, adaptado |
| **Novo**: `packages/sdk/tests/embedded-wallet-signer.spec.ts` | Testar `createEmbeddedWalletSigner`/assinatura ECDSA com uma chave de teste fixa |
| **Novo**: `packages/sdk/tests/settle-embedded-order.spec.ts` | Testar o polling/timeout/retry do `settleEmbeddedOrder` contra um mock provider |
| `packages/yield/tests/**` (todo) | Deletar junto com o pacote |
| `apps/demo/tests/e2e.spec.ts` | Deletar junto com o demo app |

`pnpm test` deve continuar cobrindo só `packages/sdk` depois da limpeza (mock mode 100%
offline, sem precisar de sandbox real pros testes automatizados — mesmo princípio do
ADR-004 que já existe).

---

## 7. Riscos e perguntas em aberto (honestidade)

| # | Risco/pergunta | Impacto | Como resolver |
|---|---|---|---|
| 1 | **Multi-tenant não validado** — só confirmamos 1 embedded wallet (customer raiz da API key); `/ramp/wallet` recusa escopar por customer específico | Alto, se o objetivo for 1 wallet por usuário final | Modelo assumido é *pool único por aplicação* (uma tesouraria). Se precisar de wallet por usuário, perguntar ao suporte da Etherfuse se existe outro mecanismo (ex. token OAuth por customer em vez de customerId no corpo) |
| 2 | **Offramp (TESOURO→BRL) não foi fechado até o fim** nesta sessão — só a quote e a existência do mesmo mecanismo de aprovação (confirmado na doc, não ao vivo até `completed`) | Médio | Fase 0 do plano de execução (§8) inclui rodar isso até o fim antes de codificar em cima |
| 3 | Tempo do `approval` aparecer variou (~45s nos dois testes) — não documentado um SLA | Baixo/médio | `settleEmbeddedOrder` com timeout configurável generoso (sugestão: 5min) e erro claro se estourar |
| 4 | Sandbox costuma ter particularidades diferentes de produção (ex. PIX/BRL é sandbox-only hoje, produção real da Etherfuse só tem México) | Alto pra ir a produção, não pro plano em si | Já documentado no `docs/production.md` atual — manter essa ressalva no novo doc |
| 5 | `idv`/KYC de novo usuário real não foi testado neste fluxo (usamos o customer raiz, já aprovado) | Médio, só relevante se onboarding de novos usuários for necessário | Manter `idv-launch.ts`/`gen-keys.mjs` (RSA) como caminho separado, documentado, não removido nem urgente |

---

## 8. Plano de execução em fases (não executar agora — só o roteiro)

| Fase | Conteúdo | Depende de |
|---|---|---|
| **0 — Spike de validação** | Fechar o ciclo offramp (TESOURO→BRL) até `completed` de ponta a ponta; medir tempo real de aparição do `approval` em 3-5 tentativas pra calibrar timeout | Nada, pode rodar contra o sandbox já configurado |
| **1 — Limpeza** | Deletar tudo listado no §4 (scripts, examples, apps/demo, pacote yield, docs obsoletos) | Fase 0 concluída (confirma que não precisamos de nada do que será removido) |
| **2 — Domínio** | Generalizar `Order`/`Quote` (targetAsset/targetAmount), novo tipo `EmbeddedWalletApproval` | Fase 1 |
| **3 — Provider + serviço** | Implementar `submitApproval` no `EtherfuseProvider`, `createEmbeddedWalletSigner`, `settleEmbeddedOrder` no `RampService` | Fase 2 |
| **4 — Exemplo + docs** | `examples/pix-tesouro-brl.ts`, reescrever README/developer-guide/production/tutorial | Fase 3 |
| **5 — Testes** | Testes novos (signer, settle) + ajuste dos existentes | Fase 3 (pode rodar em paralelo com a 4) |
| **6 — ADRs** | ADR-015/016/017 + marcar antigos como superseded | Qualquer momento após a Fase 2 (decisão já tomada) |

---

## 9. Resumo do que muda pro usuário do SDK (outra aplicação)

Antes (hoje): duas dependências (`@stellar-ramp/sdk` + `@stellar-ramp/yield`), fluxo em duas
wallets, `autoPark`/`liquidate`, webhook próprio pra manter no ar.

Depois (proposto): uma dependência (`@stellar-ramp/sdk`), uma wallet, dois métodos novos
(`settleEmbeddedOrder`, `createEmbeddedWalletSigner`) além dos já existentes (`quote`,
`onramp`, `offramp`, `provisionWallet`), sem webhook nenhum pra manter (o modelo é
poll-e-assina, não push).
