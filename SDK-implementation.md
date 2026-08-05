# SDK Implementation Guide

Guia para uma empresa que quer integrar o `@stellar-ramp/sdk` na própria aplicação: o que
o SDK faz, como instalar, como montar o fluxo completo, e quais limitações conhecidas
existem hoje.

---

## 1. O que este SDK faz

Move dinheiro entre moeda local (PIX/BRL hoje; SPEI/MXN suportado pela Etherfuse) e um
ativo Etherfuse na Stellar — **qualquer um**: USDC, ou um Stablebond que já rende
(TESOURO no Brasil, CETES no México, USTRY nos EUA) — direto, sem passo intermediário.

```text
Depósito:  fiat (PIX)  →  ramp.onramp()   →  ativo cripto na embedded wallet
Saque:     ativo cripto →  ramp.offramp()  →  fiat (PIX) na conta bancária do usuário
```

Toda a lógica de KYC/organização/conta bancária, cotação e criação de ordem é
programática. O único passo manual em produção (não em sandbox) é o KYC final do
usuário via WebSDK hospedado da Etherfuse (`/idv`) — ver §6.

## 2. Modelo de custódia — leia isto antes de desenhar sua integração

**A embedded wallet é não-custodial, mas é uma única wallet por API key.** Isso significa:

- Você (a aplicação) gera um par de chaves **P-256** e guarda a privada — nunca a Etherfuse.
- A Etherfuse **propõe** transações (onramp claim, offramp burn); você **aprova**
  assinando com essa chave. Ela nunca pode mover fundos sem sua assinatura.
- **Testado e confirmado**: `POST /ramp/wallet` sempre vincula a wallet ao customer
  "raiz" da sua API key, **nunca** a um customer específico que você passe.
  `POST /ramp/customer/{id}/wallet` (o endpoint que pareceria certo para isso) rejeita
  explicitamente: *"Embedded-wallet provisioning is not supported for customer wallets"*.

**Consequência prática**: hoje, com uma API key, você tem **uma wallet** — um modelo de
"tesouraria única" (pool), não "uma wallet por usuário final". Se seu produto precisa que
cada usuário tenha saldo segregado, você precisa de contabilidade **própria** por cima
dessa wallet única (um razão interno: quem depositou quanto), exatamente como qualquer
exchange centralizada faz sobre uma hot wallet compartilhada. O SDK não fornece isso —
é uma decisão de produto de quem o integra.

Se seu caso de uso é uma tesouraria única por aplicação (ex.: "minha empresa mantém um
saldo agregado rendendo, e minha própria contabilidade sabe quanto cada cliente tem
direito"), o modelo atual serve exatamente como está.

## 3. Instalação

```bash
pnpm add @stellar-ramp/sdk
# ou, enquanto não publicado no npm: pnpm add file:../caminho/para/packages/sdk
```

Requer Node 22+ se for usar `SqliteIdentityStore` (usa `node:sqlite`); `InMemoryIdentityStore`
funciona em qualquer runtime.

## 4. Setup (uma vez por ambiente)

```bash
# 1. Conta em sandbox.etherfuse.com (ou app.etherfuse.com em produção) → gera API key
# 2. Descubra o customerId "raiz" (último segmento da API key, depois do último ':')
curl -s "https://api.sand.etherfuse.com/ramp/customer/<segmento>/kyc?requirements=true" \
  -H "Authorization: <API_KEY>"
# 3. Gere o par de chaves da embedded wallet (uma vez, guarde a privada com segurança)
```

```ts
import { generateEmbeddedWalletKeyPair } from "@stellar-ramp/sdk";
const { publicKeyPem, privateKeyPem } = generateEmbeddedWalletKeyPair();
// persista privateKeyPem num secret manager — nunca em código-fonte ou logs
```

```ts
import { createRamp, createEtherfuseProvider, createEnvSecretProvider, InMemoryIdentityStore } from "@stellar-ramp/sdk";

const etherfuse = createEtherfuseProvider({
  baseUrl: "https://api.sand.etherfuse.com", // troque por api.etherfuse.com em prod
  environment: "sandbox",                     // ou "prod"
  countries: ["BR"],
  secrets: createEnvSecretProvider(),          // lê ETHERFUSE_API_KEY do ambiente
});
const ramp = createRamp({
  mode: "live",
  providers: [etherfuse],
  identityStore: new InMemoryIdentityStore(),  // troque por algo persistente em produção
});

const wallet = await ramp.provisionWallet("etherfuse", publicKeyPem);
// guarde wallet.walletId e wallet.publicKey — são fixos, não precisa provisionar de novo
```

## 5. Fluxo completo (depósito + saque)

```ts
import { createEmbeddedWalletSigner } from "@stellar-ramp/sdk";

const signer = createEmbeddedWalletSigner(privateKeyPem);
const TESOURO = "TESOURO:GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4";

// --- Depósito: PIX → TESOURO ---
const quote = await ramp.quote({
  direction: "onramp",
  country: "BR",
  fiat: "BRL",
  fiatAmount: "100",
  cryptoAsset: TESOURO,
  pubkey: wallet.publicKey,       // chave usada pelo IdentityStore (ADR-005)
  walletAddress: wallet.publicKey,
});

const order = await ramp.onramp({
  quote,
  pubkey: wallet.publicKey,
  walletAddress: wallet.publicKey,
  cryptoWalletId: wallet.walletId,
  bankAccount: {                  // só é usado na 1ª vez (depois fica no IdentityStore)
    kind: "pix_personal",
    firstName: "...", lastName: "...", cpf: "...",
    pixKey: "...", pixKeyType: "EMAIL",
  },
});
// order.status === "created" — mostre order (ou os dados de depósito) pro usuário pagar o PIX

// Em produção, a Etherfuse detecta o PIX sozinha (webhook/SPEI). Em sandbox, force com:
// await etherfuse.simulateFiatDeposit(order.id);

const settled = await ramp.settleEmbeddedOrder(order.id, signer);
// settled.status === "completed" — settled.cryptoAmount TESOURO já está na embedded wallet

// --- Saque: TESOURO → BRL ---
const outQuote = await ramp.quote({
  direction: "offramp",
  country: "BR",
  fiat: "BRL",
  cryptoAmount: settled.cryptoAmount,
  cryptoAsset: TESOURO,
  pubkey: wallet.publicKey,
  walletAddress: wallet.publicKey,
});
const outOrder = await ramp.offramp({
  quote: outQuote,
  pubkey: wallet.publicKey,
  walletAddress: wallet.publicKey,
  cryptoWalletId: wallet.walletId,
});
const outSettled = await ramp.settleEmbeddedOrder(outOrder.id, signer);
// outSettled.status === "completed" — BRL cai na conta PIX cadastrada
```

`settleEmbeddedOrder` encapsula o ciclo assíncrono inteiro: espera a Etherfuse propor a
aprovação (`order.approval`), assina com sua chave P-256, submete, e espera a ordem virar
`"completed"`. Timeout e intervalo de poll são configuráveis:

```ts
await ramp.settleEmbeddedOrder(order.id, signer, {
  pollIntervalMs: 5_000,   // default
  timeoutMs: 5 * 60_000,   // default — aumente se seu ambiente vir a ter latência maior
});
```

## 6. KYC em produção (não precisa em sandbox)

Em sandbox, o customer "raiz" da sua API key já vem com KYC aprovado — por isso os
exemplos acima funcionam sem nenhum passo de verificação. **Em produção, isso não é
verdade**: a Etherfuse exige que o dono da conta (ou cada organização KYB, se você criar
sub-organizações) complete a verificação de identidade via **WebSDK `/idv`** (e-mail +
selfie + termos, hospedado pela própria Etherfuse — não tem API).

```ts
import { createIdvLaunch, buildIdvLaunchHtml } from "@stellar-ramp/sdk";

const launch = createIdvLaunch({
  orgId, privateKey, issuer, keyId, email, name,
  environment: "prod", // ou "sandbox"
});
// redirecione o usuário pra launch.action com launch.form (ou use buildIdvLaunchHtml(launch))
```

Pré-requisito único: registrar `iss` (um identificador seu) + a URL pública do seu JWKS
com a Etherfuse (dashboard, seção Partner JWT). O JWKS precisa ser servido como
`application/json` (GitHub Pages funciona; Gist raw não, serve `text/plain`).

## 7. Erros de domínio

```ts
import { RampError } from "@stellar-ramp/sdk";

try {
  await ramp.onramp({ ... });
} catch (e) {
  if (e instanceof RampError) {
    switch (e.code) {
      case "insufficient_balance": /* ... */ break;
      case "approval_timeout": /* ordem não assentou a tempo — ver §8 */ break;
      case "no_provider_for_country": /* país sem provider configurado */ break;
      // ver packages/sdk/src/domain/entities/errors.ts pra lista completa
    }
  }
}
```

## 8. Limitações conhecidas (honestidade)

| # | Limitação | Impacto | Mitigação |
|---|---|---|---|
| 1 | **Uma embedded wallet por API key** (§2) — não dá pra escopar por usuário final | Alto se seu produto precisa de saldo segregado por usuário | Contabilidade própria por cima da wallet única; ou pergunte ao suporte da Etherfuse se existe outro mecanismo (nunca confirmado) |
| 2 | **Offramp às vezes trava em `"funded"`** mesmo com o burn cripto já confirmado on-chain (visto ao vivo nesta sessão) | Médio — o dinheiro se move, mas seu código não recebe a confirmação de "completed" a tempo | Trate `approval_timeout` como "confira o saldo direto" — não como falha definitiva; considere um fallback que lê o saldo Horizon como fonte de verdade complementar |
| 3 | **PIX/BRL é sandbox-only hoje** — produção real da Etherfuse é só México (MXN/SPEI) | Alto se o objetivo é produção BR imediata | Acompanhar o lançamento oficial do Brasil pela Etherfuse |
| 4 | **`approvalMessage` expira a cada leitura** — não dá pra cachear e assinar depois | Baixo — `settleEmbeddedOrder` já relê antes de assinar | Não implementar assinatura offline/atrasada sem reler a ordem primeiro |
| 5 | Sem endpoint de **saque de cripto pra uma wallet externa** — só onramp (entra) e offramp (sempre em fiat) | Médio se você precisa mandar cripto pra fora da embedded wallet | Não existe hoje; não invente um workaround — documentado como não suportado |

## 9. Checklist de produção

- [ ] Trocar `environment: "sandbox"` → `"prod"` e `baseUrl` → `https://api.etherfuse.com`
- [ ] Registrar `iss` + JWKS de **produção** (separado do sandbox) com a Etherfuse
- [ ] Persistir o `IdentityStore` (trocar `InMemoryIdentityStore` por `SqliteIdentityStore` ou equivalente)
- [ ] Guardar a chave privada P-256 num secret manager, nunca em código/log
- [ ] Implementar o redirecionamento real pro WebSDK `/idv` (§6)
- [ ] Decidir e implementar a contabilidade por usuário sobre a wallet única (§2, §8.1)
- [ ] Ter um plano de retry/reconciliação pra `approval_timeout` (§8.2) — não assumir que timeout = dinheiro não moveu

## 10. Referência rápida da API pública

| Export | Uso |
|---|---|
| `createRamp(cfg)` | Monta o `RampService` a partir de providers + identityStore |
| `createEtherfuseProvider(opts)` | Provider real, fala com a API da Etherfuse |
| `MockProvider` | Provider offline/determinístico pra testes |
| `createEnvSecretProvider()` | Lê a API key de variáveis de ambiente |
| `InMemoryIdentityStore` / `SqliteIdentityStore` | Persistência de identidade (ADR-005) |
| `generateEmbeddedWalletKeyPair()` | Gera o par P-256 (uma vez) |
| `createEmbeddedWalletSigner(privateKeyPem)` | Assina `approvalMessage` |
| `createIdvLaunch(opts)` / `buildIdvLaunchHtml(launch)` | Link/form do WebSDK `/idv` |
| `createLiveStellarWallet(opts)` | Guarda de saldo (Horizon) pra offramp |
| `RampService.quote/onramp/offramp/getOrder/provisionWallet/settleEmbeddedOrder` | API principal |
| `RampError`, `err.*` | Erros de domínio tipados |

Detalhes de cada tipo: `packages/sdk/src/index.ts` (ponto de entrada — reexporta tudo).
