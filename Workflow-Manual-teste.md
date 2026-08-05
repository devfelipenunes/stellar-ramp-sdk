# Workflow — como executar e validar o fluxo manualmente

Este documento explica como rodar `examples/pix-tesouro-brl.ts` (o único script de
demonstração do repositório) contra o **sandbox real** da Etherfuse, e como confirmar que
o fluxo **PIX (BRL) → TESOURO → BRL** realmente aconteceu — não é mock, é dinheiro de
testnet real, numa embedded wallet real.

---

## 1. Pré-requisitos (uma vez)

```bash
pnpm install
cp .env.example .env
```

Você precisa de:

1. **Uma conta em `sandbox.etherfuse.com`** com uma API key (`ETHERFUSE_API_KEY`, formato
   `api_sand:...:...`). O último segmento da chave (depois do último `:`) é o
   **customerId "raiz"** da sua conta — já vem com KYC aprovado automaticamente em
   sandbox. Confirme:
   ```bash
   set -a; source .env; set +a
   curl -s "$ETHERFUSE_BASE_URL/ramp/customer/<o-tal-segmento>/kyc?requirements=true" \
     -H "Authorization: $ETHERFUSE_API_KEY"
   # espera: "status": "approved"
   ```
2. Preencha no `.env`:
   ```
   ETHERFUSE_API_KEY=api_sand:...
   ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
   ETHERFUSE_CUSTOMER_ID=<o customerId raiz confirmado acima>
   ```

Tudo o resto (`ETHERFUSE_WALLET_ID`, `ETHERFUSE_WALLET_PUBLIC_KEY`,
`ETHERFUSE_SIGNER_PRIVATE_KEY_PATH`, `ETHERFUSE_BANK_ACCOUNT_ID`) o próprio script
**cria sozinho na primeira execução** e imprime pra você colar no `.env` — não precisa
preencher antes.

---

## 2. Rodar o fluxo completo

```bash
pnpm flow -- 10   # 10 = valor em BRL do depósito PIX simulado
```

### O que esperar ver (primeira execução, do zero)

```
Nenhuma embedded wallet configurada — provisionando uma nova...
Nova embedded wallet criada → GB....
Cole isto no seu .env antes de rodar de novo:
  ETHERFUSE_WALLET_ID=...
  ETHERFUSE_WALLET_PUBLIC_KEY=GB...
  ETHERFUSE_SIGNER_PRIVATE_KEY_PATH=secrets/etherfuse/embedded-wallet-signer.pem

Saldo TESOURO ANTES → 0

=== 1/2 PIX (BRL 10) → TESOURO (onramp real) ===
cotação real: R$10 -> 8.62 TESOURO
ordem criada: <uuid> status: created

Conta PIX criada — cole no .env: ETHERFUSE_BANK_ACCOUNT_ID=<uuid>

simulando o depósito PIX (sandbox)...
aguardando aprovação (pode levar ~1 min) e assinando com a chave P-256...
ordem final: completed | TESOURO recebido: 8.619...

Saldo TESOURO DEPOIS do onramp → 8.619...

=== 2/2 TESOURO (8.619...) → BRL (offramp real) ===
cotação real: 8.619... TESOURO -> R$8.62...
ordem criada: <uuid> status: created
aguardando aprovação (pode levar ~1 min) e assinando com a chave P-256...
ordem final: completed

Saldo TESOURO FINAL → 0...
Embedded wallet → https://stellar.expert/explorer/testnet/account/GB...
```

**Copie os 4 valores impressos pro seu `.env`** — assim a próxima execução reusa a mesma
wallet/conta PIX em vez de criar novas a cada run.

### Validando que é real, não simulado

1. **Abra o link do Stellar Expert** impresso no final — a wallet e o saldo TESOURO são
   públicos e conferíveis por qualquer pessoa.
2. Confira a ordem pela API diretamente:
   ```bash
   set -a; source .env; set +a
   curl -s "$ETHERFUSE_BASE_URL/ramp/order/<orderId impresso>" \
     -H "Authorization: $ETHERFUSE_API_KEY" | python3 -m json.tool
   # status deve ser "completed", com stellarClaimableBalanceId (onramp)
   ```
3. Confira o saldo direto na Horizon:
   ```bash
   curl -s "https://horizon-testnet.stellar.org/accounts/<ETHERFUSE_WALLET_PUBLIC_KEY>" \
     | python3 -c "import json,sys; d=json.load(sys.stdin); [print(b.get('asset_code','XLM'), b['balance']) for b in d['balances']]"
   ```

### Rodar só uma perna

```bash
pnpm flow -- 10 --onramp-only    # só PIX → TESOURO
pnpm flow -- 5 --offramp-only    # só TESOURO → BRL (5 = quantidade de TESOURO a vender)
```

---

## 3. O que valida cada execução

| Etapa | O que é real | Como confirmar |
|---|---|---|
| Cotação (`ramp.quote`) | Taxa de câmbio real da Etherfuse | Valor impresso bate com `GET /ramp/quote` chamado à mão |
| Ordem (`ramp.onramp`/`offramp`) | Cria uma ordem de verdade no sandbox | `GET /ramp/order/{id}` retorna a ordem |
| Depósito PIX (`simulateFiatDeposit`) | Só existe em sandbox — é o "PIX chegou" simulado | Resposta 200; ordem muda de `created` para `funded` |
| Assinatura (`settleEmbeddedOrder`) | Assinatura ECDSA P-256 real, verificável | `POST /ramp/order/{id}/approvals` responde `completed:true` |
| Saldo final | Movimento real na Stellar testnet | Horizon mostra o saldo mudado, com hash de transação real |

---

## 4. Troubleshooting

| Sintoma | Causa | Solução |
|---|---|---|
| `Falta ETHERFUSE_API_KEY no .env` | `.env` não existe ou variável vazia | `cp .env.example .env` e preencha |
| `RampError: approval_timeout` no **onramp** | Deveria ser raro — já corrigimos o bug mais comum (conexão HTTP reaproveitada, ver abaixo) | Rode nesse mesmo request de novo com `pollIntervalMs`/`timeoutMs` maiores; confira `GET /ramp/order/{id}` manualmente — se `updatedAt` nunca mudou desde a criação, é uma ordem presa no sandbox; descarte e rode de novo com uma ordem nova |
| `RampError: approval_timeout` no **offramp** | Observado nesta sessão: o burn cripto acontece de verdade (saldo muda, `confirmedTxSignature` aparece na ordem) mas o status às vezes não avança de `"funded"` pra `"completed"` dentro do timeout | Confira o saldo na Horizon — se já mudou, o dinheiro já se moveu; o status da ordem é só cosmético nesse caso. Ainda não identificamos a causa exata do lado do sandbox — ver `SDK-implementation.md` §Limitações |
| Ordem trava para sempre em `"funded"`, sem nunca gerar `approval` | **Já corrigido no código**: sem o header `Connection: close`, o `fetch` do Node às vezes faz o sandbox nunca disparar o job que gera a aprovação (confirmado comparando com `curl`, que fecha a conexão a cada chamada). Se você clonar este SDK e reimplementar `EtherfuseProvider` do zero, **não remova esse header** | Já está em `packages/sdk/src/adapters/etherfuse/etherfuse-provider.ts` — só relevante se você copiar a lógica de request pra outro lugar |
| `HTTP 409` ao criar uma ordem nova | Uma ordem anterior da mesma wallet ainda está pendurada em `created`/`funded` sem nunca ter sido finalizada | Rode `settleEmbeddedOrder` (ou `simulateFiatDeposit` + `settleEmbeddedOrder`) na ordem antiga primeiro, ou espere ela expirar |
| `Order not found` / `404` em `fiat_received` | Endpoint errado — o certo é `POST /ramp/order/fiat_received` com `{orderId}` no corpo, não `/ramp/order/{id}/fiat_received` | Já corrigido no adapter; se você bater na API direto, use o path fixo |

---

## 5. Limpando pra recomeçar do zero

Isso força o script a provisionar uma embedded wallet **nova**:

```bash
# no .env, apague (ou comente) estas 4 linhas:
ETHERFUSE_WALLET_ID=
ETHERFUSE_WALLET_PUBLIC_KEY=
ETHERFUSE_SIGNER_PRIVATE_KEY_PATH=
ETHERFUSE_BANK_ACCOUNT_ID=

rm -f secrets/etherfuse/embedded-wallet-signer.pem
pnpm flow -- 10
```
