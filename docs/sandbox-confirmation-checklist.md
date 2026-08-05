# Checklist — confirmação do shape real na sandbox Etherfuse

> Ferramenta de confirmação: **`scripts/confirm-sandbox.mjs`** (roda os
> endpoints, salva raws em `/tmp/ef-confirm/`). A API é Rust/Axum: os erros
> `missing field \`X\`` revelam o contrato campo a campo.
>
> ```
> ! ETHERFUSE_API_KEY="api_sand:..." node scripts/confirm-sandbox.mjs   # MX/SPEI (default)
> ! ETHERFUSE_API_KEY="api_sand:..." VARIANT=BR node scripts/confirm-sandbox.mjs  # BR/PIX
> ```
>
> `VARIANT=BR` adiciona ao fluxo: **conta PIX** (`POST /ramp/customer/{id}/bank-account`
> com `cpf`/`pixKey`/`pixKeyType`) e **quote BRL** (`sourceAsset:"BRL"`) — fecha o
> `TODO(sandbox)` do `createBankAccount` e prova o PIX de ponta a ponta.
>
> Auth = header `Authorization: <key>` SEM "Bearer" (playbook §1). Key é
> server-side (ADR-007). Base: `https://api.sand.etherfuse.com`

## Status (04/08/2026 — shapes reais confirmados e refletidos no SDK)

### ✅ Confirmado na sandbox (API real)

- [x] **Criação de organização/customer** → `POST /ramp/organization` (SINGULAR,
      NÃO `/idv/customers` que dá 404). **Aceita `id` que o SDK gera** → vira o
      `organizationId`/`customer_id` (ADR-005 definitivo). business: `{ id,
accountType:"business", country, taxId, displayName }`; personal: `{
accountType:"personal", displayName, userInfo:{ displayName, email } }`
      (email obrigatório; `userInfo` só em personal).
- [x] **Conta bancária** → `POST /ramp/customer/{orgId}/bank-account` → 201
      `{ bankAccountId, customerId, currency, abbrClabe, status, compliant }`.
      **Campo do id = `bankAccountId`** (pickBankId correto). Conta nasce
      `pending` → `active` (assíncrono), `compliant:false` até KYC/KYB.
- [x] **Quote** → `POST /ramp/quote` → 200. Body real: `{ quoteId, customerId
(org REAL), blockchain, wallet, sourceAmount:"300" (STRING no raiz),
quoteAssets:{ type:"onramp", sourceAsset:"MXN"|"BRL", targetAsset:
"USDC:GBBD47IF..." (identifier COMPLETO com issuer) } }`. Resposta rica:
      `quoteId, destinationAmount, exchangeRate, feeBps, feeAmount,
requiresSwap, expiresAt (TTL ~2min)`.
- [x] **Ordem** → `POST /ramp/order` — **fluxo 2-pass**: referencia um
      `quoteId` REAL (uuid aleatório → "Quote not found or expired"); requer
      `orderId` (idempotency nossa) + customerId + bankAccountId + blockchain +
      wallet.
- [x] **KYC programático** (org personal): `POST .../verification` (country
      **alpha-3** "MEX", 202 assíncrono) → poll `GET .../kyc?requirements=true`
      até a lista aparecer → `POST .../verification/documents` (multipart:
      id_type, id_front, id_back, tax_document) → `POST
.../verification/questionnaire` (industry = **code numérico** de
      `GET /ramp/verification/occupations`). Todos 202.
- [x] **Diagnóstico**: `GET /ramp/customer/{id}/kyc?requirements=true` → mostra
      `{ type, status, requiresLaunch }` por requisito. Org business: endpoints
      KYC pessoal rejeitam ("business verification is submitted through the KYB
      endpoints").

### 🚧 Bloqueio conhecido (dependência do app, não do SDK)

- [x] `email_confirmation` + `selfie` são `requiresLaunch=true` → **SÓ via
      WebSDK `/idv`** (a doc: _"There is no API for those"_; launch =
      POST form em `sandbox.etherfuse.com/auth/launch` com
      `grant_type=jwt-bearer` + `assertion=<verification_scoped_jwt>` +
      `target=/idv`). O `POST /ramp/onboarding-url` dá 404 no fluxo business.
      → **O onboarding 100% exige o WebSDK `/idv` no app** (o usuário final
      confirma email/selfie/agreements). A conta fica `compliant:true` quando a
      org é aprovada; sem isso, a ordem rejeita "Bank account is not compliant".

### ✅ Refatoração do SDK (feita)

- [x] `etherfuse-provider.ts` refletindo os shapes reais:
  - `createCustomer` → `POST /ramp/organization` (id gerado por nós; accountType
    configurável, default business; userInfo.email p/ personal)
  - `quote` → shape real (quoteId, customerId, blockchain, wallet,
    sourceAmount, quoteAssets); sem customerId → `quote_requires_customer`
  - `createOnrampOrder`/`offramp` → 2-pass com quoteId real
  - `pickId` lê `organizationId`; `normalizeQuote` lê quoteId/destinationAmount
- [x] `RampService`: **fluxo invertido** (org antes do quote) —
      `quote(pubkey)` garante a org; `onramp/offramp` cotam fresco (2-pass)
- [x] `Quote` ganhou `quoteId`; `QuoteRequest` ganhou `pubkey`/`customerId`
- [x] Testes do adapter cobrem o novo shape (17 no adapters.spec); 67/67 verdes

### ✅ BR/PIX VALIDADO (04/08/2026 — fluxo completo até o quote)

- [x] **Org BR** (`country:"BRA"`) + KYC programático (verification 202, documents
      202 — BR NÃO tem `tax_document`, MX tem 6 requisitos com a constancia)
- [x] **KYC approved** via WebSDK `/idv` (email real + selfie; **scope = `verification`**,
      `idv` é rejeitado)
- [x] **Conta PIX → 201**: `{ bankAccountId, customerId, currency:"brl",
compliant:true, status:"active", abbrClabe:"" }` — **fecha o TODO do
      createBankAccount** (`pickBankId` lê `bankAccountId` corretamente)
- [x] **Quote BRL → 200** (`sourceAsset:"BRL"`, feeBps 20)
- [x] **Ordem (2-pass)** — **completa** (`completed`): embedded wallet é o caminho.
      `POST /ramp/wallet` (signer **P-256** PEM) → `{ walletId, publicKey }`; quote com
      **`walletAddress`** (embute trustline+conta no fee, feeBps 284); order com
      **`cryptoWalletId`**. `fiat_received` → `funded` → poll → `completed`.
      Resposta aninhada em `onramp` (`depositBankName:"PIX"`). 409 "pending onramp
      already exists" p/ mesma conta+valor → reusar a orderId. (wallet Stellar avulsa
      fundada+trustline NÃO basta — "Wallet not found or not authorized")

- [x] **Offramp VALIDADO** (04/08/2026): quote `offramp` (USDC→BRL, feeBps 20)
      → 200 e ordem → 200 aninhada em `offramp.orderId` — shape real confirmado

## Track Yield — `EtherfuseStablebondProvider` (2026-08-05)

- [x] Implementado em TDD (`packages/yield/src/adapters/etherfuse/etherfuse-stablebond-provider.ts`
      + `webhook.ts` + `keypair-signer.ts`), 29 testes novos, 133/133 no total, `fetch` mockado
      (ver ADR-014). Payloads seguem o mesmo shape confirmado nesta pesquisa (`/ramp/assets`,
      `/ramp/quote`, `/ramp/swap`, webhook `swap_updated`).
- [x] **Validado contra o sandbox real (2026-08-05, 09:44 -03).** `pnpm example:live -- 3`
      pediu swap de 3 USDC→TESOURO (customer `8c200036-ed1d-4455-8977-d2efb4aa1416`, wallet
      `GBJSNIYHTK764KVZJ6HF4FECYCABZOHLVBE3SHQYIGDP6L7ZRTVVMHXY`). O webhook já deployado do
      projeto irmão (`zolvency-yield-ramp/apps/demo`, mesma conta/organização Etherfuse)
      processou sozinho — sem nenhuma configuração nova de webhook neste repositório. Saldo
      confirmado via Horizon antes/depois: USDC `9.4017379 → 6.4017379` (-3, exato), TESOURO
      `46.4878924 → 59.7207715` (+13.2328791). Transação:
      [stellar.expert](https://stellar.expert/explorer/testnet/account/GBJSNIYHTK764KVZJ6HF4FECYCABZOHLVBE3SHQYIGDP6L7ZRTVVMHXY).
      Um bug real apareceu e foi corrigido nesse processo: `POST /ramp/swap` devolve `200`
      com corpo **vazio** — o código tentava `.json()` nele incondicionalmente e quebrava;
      corrigido em `postSwap()` (checa só `res.ok`), com teste de regressão simulando corpo
      vazio de verdade (não `{}` — esse detalhe é o que tinha mascarado o bug no teste
      original).

## Pendências abertas

- [ ] Integrar o **WebSDK `/idv`** no app para completar o KYC do usuário final
      (email/selfie/agreements) → destrava `compliant:true` → ordem fecha
- [ ] Confirmar endpoints **KYB** para org business (verification KYB)
