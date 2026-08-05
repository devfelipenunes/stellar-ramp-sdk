# Tutorial — como testar o `stellar-ramp-sdk` de ponta a ponta

> Implementado seguindo `.claude/skills/yield-engine-tdd/SKILL.md` e
> `docs/plan-etherfuse-stablebond-real.md` (com a "Simplificação MVP" — ver
> `docs/adr/ADR-014-swap-assincrono-e-lock-bookkeeping.md`). Fecha o gap descrito em
> `../pesquisa/analise-stellar-ramp-sdk.md`.
>
> **Tudo abaixo já foi executado de verdade nesta sessão**, não é teórico: a seção 1 rodou e
> imprimiu exatamente a saída mostrada; a seção 2 moveu USDC/TESOURO de verdade (USDC
> `9.4017379 → 6.4017379`, TESOURO `46.4878924 → 59.7207715`, conferível em
> [stellar.expert](https://stellar.expert/explorer/testnet/account/GBJSNIYHTK764KVZJ6HF4FECYCABZOHLVBE3SHQYIGDP6L7ZRTVVMHXY));
> a seção 3 chegou até o limite real de onde dá pra ir sem uma chave JWT registrada (5
> chamadas de API reais, org criada, cotação BRL→USDC real de 19.49 USDC pra 100 BRL) — e
> documenta como destravar o resto.

---

## 1. Sem credencial nenhuma (2 minutos)

```bash
pnpm install
pnpm test           # 133/133
pnpm typecheck       # limpo

pnpm example:basic   # examples/basic.ts — as DUAS tracks compostas (mock)
pnpm example:mock    # examples/yield-lock-demo.ts — caso de uso do leilão (mock)
```

`example:basic` mostra o padrão que qualquer app usaria: `ramp.quote` → `ramp.onramp` →
`yield.autoPark` → `yield.balance` → `yield.liquidate` → `ramp.offramp`, tudo em memória,
instantâneo. `example:mock` foca no módulo `lock`/`unlock` (a "caução de leilão").

Isso mostra as regras centrais do SDK: `autoPark`/`balance`/`liquidate` são o núcleo genérico
(fiat→USDC→TESOURO→saque); `lock`/`unlock` são um módulo opcional em cima, sem nenhuma lógica
de "leilão" dentro do SDK — quem decide o que travar é a aplicação.

---

## 2. Yield real — swap USDC↔TESOURO contra o sandbox

### Pré-requisitos

- A mesma wallet/customer/chave sandbox do projeto irmão `zolvency-yield-ramp` (reaproveitar
  é o caminho recomendado — já tem trustlines prontas). Do zero, ver
  `../zolvency-yield-ramp/packages/yield-engine/SIMULATION.md`.

### Comandos

```bash
cp .env.example .env
# preencha ETHERFUSE_API_KEY, ETHERFUSE_CUSTOMER_ID, YIELD_WALLET_SECRET
# (mesmos valores de zolvency-yield-ramp/packages/yield-engine/.env)

pnpm example:live -- --balance   # só lê, não pede swap
pnpm example:live -- 3           # troca 3 USDC por TESOURO de verdade
# espera ~10s (webhook assíncrono, ver abaixo) e confere de novo:
pnpm example:live -- --balance
```

O swap não devolve o resultado na hora — a Etherfuse avisa depois via webhook
`swap_updated` (confirmado ao vivo: não existe polling nem WebSocket que funcione pra isso).
**Você não precisa rodar nenhum webhook local**: o mesmo webhook do projeto irmão
`zolvency-yield-ramp/apps/demo`, já deployado no Vercel, está registrado na mesma conta
sandbox e processa automaticamente qualquer swap dessa conta, não importa qual repositório
pediu. Pra ver ele processando ao vivo:

```bash
cd ../zolvency-yield-ramp/apps/demo && npx vercel logs https://demo-pi-lovat.vercel.app --follow --expand
```

`lock`/`unlock` funcionam sobre a posição real do mesmo jeito que no mock — sem nenhuma
chamada extra à Etherfuse (`examples/yield-lock-demo.ts` mostra o padrão de chamada).

---

## 3. Ramp real — PIX/BRL de ponta a ponta

Isso é mais envolvido porque mexe com identidade de verdade. Vale entender o esquema antes
de sair rodando comando.

### 3.1 O esquema — por que existe uma etapa de "registrar uma chave"

A Etherfuse é regulada — antes de deixar alguém transacionar, ela precisa saber quem é essa
pessoa (KYC). Mas **quem verifica a identidade é sempre a própria Etherfuse**, nunca a
aplicação que usa o SDK — se bastasse a aplicação dizer "confia, já verifiquei", qualquer um
poderia inventar uma identidade. Por isso a etapa final (e-mail confirmado, selfie ao vivo,
aceite dos termos) só acontece dentro da própria página hospedada da Etherfuse (`/idv`), nunca
por API.

O mecanismo pra redirecionar o usuário até lá com segurança é o mesmo de qualquer "Entrar com
Google" (SSO/OAuth):

1. **Uma vez, antes de qualquer app rodar**: a aplicação gera um par de chaves — a privada
   fica só no servidor dela, pra sempre; a pública vai num arquivo público (**JWKS**).
2. Ela registra na Etherfuse: "essa é minha identidade (`iss`), essa é a URL onde está minha
   chave pública". A Etherfuse guarda esse vínculo.
3. Toda vez que um usuário precisa verificar identidade, o **backend** (nunca o navegador)
   monta uma mensagem assinada com a chave privada e redireciona o usuário pra Etherfuse.
4. A Etherfuse confere: essa assinatura bate com a chave pública que tenho registrada pra
   esse `iss`? Se sim, mostra a tela de verificação; se não, rejeita (`invalid_client`).

**Foi exatamente isso que bloqueou o teste anterior**: o script gerou uma chave nova, mas
ninguém tinha registrado essa chave na Etherfuse — a rejeição é o sistema funcionando certo,
não um bug. As seções abaixo resolvem isso de verdade: gerar sua própria chave, publicar,
registrar.

### 3.2 Gerar suas chaves (já validei este comando — funciona)

```bash
mkdir -p secrets/etherfuse
node -e "
const { generateKeyPairSync, randomUUID } = require('node:crypto');
const { writeFileSync } = require('node:fs');

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});

writeFileSync('secrets/etherfuse/jwtRS256.key', privateKey);

const jwk = require('node:crypto').createPublicKey(publicKey).export({ format: 'jwk' });
const kid = randomUUID();
writeFileSync('secrets/etherfuse/jwks.json', JSON.stringify({ keys: [{ ...jwk, use: 'sig', alg: 'RS256', kid }] }, null, 2));
writeFileSync('secrets/etherfuse/kid.txt', kid);
console.log('kid:', kid);
"
```

Isso cria 3 arquivos em `secrets/etherfuse/` (a pasta inteira já está no `.gitignore` — **a
`jwtRS256.key` nunca deve ir pro Git, em lugar nenhum, nem público nem privado**):

- `jwtRS256.key` — sua chave **privada**. Fica só aqui.
- `jwks.json` — sua chave **pública**, no formato que a Etherfuse espera. Esse arquivo você
  **vai** publicar (é público por design — é só a chave pública).
- `kid.txt` — um identificador da chave (`kid`), vai ser usado no passo de registro.

Cole o `kid` impresso no `ETHERFUSE_KID` do seu `.env` (o `ETHERFUSE_PRIVATE_KEY_PATH` já
vem preenchido em `.env.example`, apontando pro arquivo que você acabou de gerar) — assim os
scripts do passo 3.5 leem tudo de `.env`, sem precisar de `export` manual toda vez.

### 3.3 Publicar o `jwks.json` no GitHub Pages

A Etherfuse exige que a URL sirva `application/json` — **um Gist "raw" não serve** (vem como
`text/plain` e é rejeitado; já foi tropeço confirmado no `docs/production.md`). GitHub Pages
serve `.json` com o content-type certo automaticamente, por isso é a rota recomendada:

1. Crie um repositório novo no GitHub (pode ser público, é só uma chave pública) — ex.
   `SEU-USUARIO/etherfuse-jwks`.
2. Coloque o `secrets/etherfuse/jwks.json` gerado acima na raiz desse repositório (renomeie
   pra `jwks.json` se necessário).
3. Nas configurações do repositório: **Settings → Pages → Source → Deploy from a branch →
   `main` / `/ (root)`** → Save.
4. Espere ~1 minuto. Sua URL fica em `https://SEU-USUARIO.github.io/etherfuse-jwks/jwks.json`.
5. Confirme que serve JSON de verdade:
   ```bash
   curl -sI https://SEU-USUARIO.github.io/etherfuse-jwks/jwks.json | grep -i content-type
   # deve mostrar: content-type: application/json
   ```

### 3.4 Registrar `iss` + JWKS na Etherfuse

Isso é um passo de **dashboard, só você consegue fazer** (precisa do seu login em
`sandbox.etherfuse.com`) — não existe endpoint de API pra isso:

1. Entre em `sandbox.etherfuse.com` com a conta que já tem a organização/API key.
2. Procure a seção de configuração de parceiro / Partner JWT (normalmente perto de
   compliance/API settings — a doc deles chama isso de "Partner JWT config").
3. Cadastre:
   - **Issuer (`iss`)**: qualquer identificador único sob seu controle — pode ser
     `https://github.com/SEU-USUARIO`, não precisa ser uma URL que retorna nada específico,
     é só um identificador.
   - **JWKS URL**: `https://SEU-USUARIO.github.io/etherfuse-jwks/jwks.json` (passo 3.3).
4. Isso é por ambiente — repita em produção (`app.etherfuse.com`) quando for pra lá.

### 3.5 Rodar o fluxo completo com a chave real

Com `ETHERFUSE_ISS`/`ETHERFUSE_PRIVATE_KEY_PATH`/`ETHERFUSE_KID` já no `.env` (seção 3.2) e
`ETHERFUSE_ISS` preenchido com o link do passo 3.4, roda tudo direto do `.env` — igual à
seção 2, sem `export` manual:

```bash
VARIANT=BR node --env-file=.env scripts/confirm-sandbox.mjs
```

(`VARIANT` fica fora do `.env` de propósito — é uma escolha por execução, BR ou MX, não uma
credencial.)

Isso cria uma organização nova, submete os dados de KYC, documentos (fake — sandbox aceita
qualquer imagem) e questionário — tudo por API — e no final gera um link:
`file:///tmp/idv-launch-<orgId>.html`. **Abra esse link no navegador** — agora, com a chave
registrada, o `/idv` deve aceitar (`LAUNCH ACEITO ✅` em vez de `REJEITADO`). Complete o
formulário (e-mail/selfie — sandbox aceita qualquer coisa) e volte aqui.

Depois de completar o `/idv` no navegador:

```bash
FOLLOWUP_ORG="<orgId impresso no passo anterior>" node --env-file=.env scripts/confirm-followup.mjs
```

Isso confere que o KYC foi aprovado, cria a conta PIX, provisiona a embedded wallet
(`POST /ramp/wallet`), pede a cotação BRL→USDC, cria a ordem, e simula o depósito PIX
(`fiat_received`, só existe em sandbox). Rode com `OFFRAMP=1` na frente pra testar a perna de
saída também.

### 3.6 Validar

```bash
set -a; source .env; set +a   # curl não lê --env-file, só os scripts Node fazem isso
ORG="<orgId>"
curl -s "$ETHERFUSE_BASE_URL/ramp/customer/$ORG/kyc?requirements=true" -H "Authorization: $ETHERFUSE_API_KEY" | python3 -m json.tool
# status deve ser "approved"
```

E confira os arquivos crus em `/tmp/ef-confirm/` (todo passo dos dois scripts salva a
resposta real ali) — `13_order_brl.json` deve mostrar a ordem em `funded`/`completed`.

### O que a **Yield** track faz com o resultado disso

O USDC dessa ordem cai na **embedded wallet** provisionada no passo 3.5 — uma wallet que a
própria Etherfuse custodia (não temos a chave privada dela, diferente da `YIELD_WALLET_SECRET`
usada na seção 2). Ainda não validamos ao vivo se dá pra chamar `autoPark` diretamente sobre
essa embedded wallet (Etherfuse assinaria por conta própria, já que é ela quem tem a chave) ou
se é preciso mover o USDC pra uma wallet externa primeiro — é a próxima pergunta em aberto
depois que você completar o `/idv` e tiver uma embedded wallet de verdade pra testar.

---

## Troubleshooting

| Sintoma | Causa | Solução |
|---|---|---|
| `Falta ETHERFUSE_API_KEY no .env` | `.env` não existe ou variável vazia | `cp .env.example .env` e preencha |
| `etherfuse POST .../ramp/swap → HTTP 400 op_underfunded` | Wallet sem USDC suficiente pro valor pedido | confira o saldo de USDC (Horizon) antes de pedir um valor maior |
| Saldo TESOURO não muda depois da seção 2 | Webhook do Vercel não recebeu (conta/wallet diferentes da registrada) | confira que `ETHERFUSE_API_KEY`/`ETHERFUSE_CUSTOMER_ID`/`YIELD_WALLET_SECRET` são os MESMOS do projeto irmão |
| `POST /auth/launch` → `invalid_client` (`Unknown issuer: <url>`) | O `ETHERFUSE_ISS` do `.env` não bate com o `iss` cadastrado no dashboard — **cuidado**: `iss` é um identificador (ex. `https://github.com/SEU-USUARIO`), diferente da URL do JWKS (3.4); não registre a URL do `jwks.json` como `iss` | confira em `sandbox.etherfuse.com` qual `iss` você de fato cadastrou e copie o **mesmo valor, exato**, pro `ETHERFUSE_ISS` do `.env` |
| `POST /ramp/customer/{id}/bank-account` → `409 Organization must be approved` | Tentou criar conta PIX antes do KYC aprovar | complete o `/idv` (3.5) primeiro |
| JWKS retorna `text/plain` em vez de `application/json` | Publicado como Gist raw em vez de GitHub Pages | use GitHub Pages (3.3), não Gist |

---

## Mapa rápido do que foi implementado

| Arquivo | O quê |
|---|---|
| `packages/yield/src/adapters/etherfuse/etherfuse-stablebond-provider.ts` | Adapter real do Yield — `quote`, `swapUsdcToBond`, `swapBondToUsdc`, `getNav`, `balanceOf`, `confirmSwapWebhook` |
| `packages/yield/src/adapters/etherfuse/webhook.ts` | Verificação HMAC + parsing do evento `swap_updated`, funções puras |
| `packages/yield/src/adapters/stellar/keypair-signer.ts` | `StellarSigner` custodial — assina a transação recebida no webhook |
| `packages/yield/src/domain/entities/lock.ts` + `lock`/`unlock` em `yield-engine.ts` | Primitivo genérico de garantia (caução de leilão é só um exemplo de uso) |
| `packages/sdk/src/adapters/etherfuse/etherfuse-provider.ts` | Adapter real do Ramp — já existia antes desta sessão |
| `scripts/confirm-sandbox.mjs` / `confirm-followup.mjs` | Scripts do Ramp real (seção 3) — já existiam, escritos pelo autor original |
| `secrets/etherfuse/` | Suas chaves JWT — gerado na seção 3.2, gitignored |
| `specs/features/etherfuse-stablebond.feature`, `specs/features/position-lock.feature` | Specs Gherkin do Yield (SDD/TDD) |
| `docs/adr/ADR-014-*.md` | Por que o swap não tem estado formal e por que o lock é bookkeeping |
| `examples/basic.ts` | Demo mock das duas tracks compostas — já existia |
| `examples/yield-lock-demo.ts` | Demo mock do `lock`/`unlock` |
| `examples/etherfuse-yield-live.ts` | Demo real do Yield — **validado ao vivo** |
| `examples/etherfuse-webhook-server.ts` | Receptor de webhook próprio, opcional |

## O que ainda falta (honestidade)

- [x] Yield real validado ao vivo nesta sessão: swap 3 USDC→TESOURO, saldo confirmado via
      Horizon (USDC -3.0000000, TESOURO +13.2328791) — registrado em
      `docs/sandbox-confirmation-checklist.md`.
- [x] Ramp real testado até o limite sem chave JWT própria: org real criada, verificação/
      documentos/questionário aceitos (202), cotação BRL→USDC real (100 BRL → 19.49 USDC).
- [ ] **Ramp real de ponta a ponta com KYC aprovado** — chave gerada (3.2), JWKS publicado no
      GitHub Pages (3.3) e `.env` alinhado com o padrão `--env-file` (esta sessão). Rodando com
      a chave real hoje: `/auth/launch` ainda rejeita com `invalid_client — Unknown issuer:
      <ETHERFUSE_ISS>` — o `iss` cadastrado no dashboard (3.4) provavelmente não é *exatamente*
      igual ao `ETHERFUSE_ISS` do `.env` (ver linha do Troubleshooting). Falta confirmar/ajustar
      isso e reabrir o link `/idv`.
- [ ] Como conectar a embedded wallet do onramp real com o `autoPark` do Yield — pergunta em
      aberto, ver final da seção 3.
- [ ] Persistência de `lock`/`unlock` é só em memória — limitação consciente, ver ADR-014.
- [ ] Signer não-custodial, campo `status` formal em `BondPosition`, lock on-chain — adiados
      de propósito pela "Simplificação MVP", ver ADR-014.
