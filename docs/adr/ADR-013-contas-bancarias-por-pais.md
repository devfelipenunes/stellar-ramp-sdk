# ADR-013: Conta bancária por país (customer 1:1, banco 1:N)

|            |                      |
| ---------- | -------------------- |
| **Status** | Aceita               |
| **Data**   | 2026-08-04           |
| **Tipo**   | Dados / consistência |

## Contexto

O port `RampProvider.createBankAccount` e a entidade `Identity` nasceram com um
único `bankAccountId` por usuário. Mas o modelo real do provider Etherfuse é
**1 customer : N contas bancárias** — o endpoint é
`POST /ramp/customer/{customer_id}/bank-account`, uma chamada por conta.

Um usuário brasileiro com conta PIX (BR/BRL) que passa a offramp em MXN precisa
de uma conta **SPEI (MX/MXN) separada**: reusar a conta PIX numa ordem MXN
falha na liquidação. Com o desenho "uma conta por usuário", o segundo país do
mesmo usuário quebra silenciosamente (reuso do `bankAccountId` errado).

A entidade `BankAccount { bankAccountId, providerId, country, fiat }` já
existia sem uso no domínio — o achatamento num `bankAccountId` único era um
atalho.

## Decisão

- **`customerId` permanece 1:1 com (pubkey, provider)** — ADR-005 intacto:
  criado uma vez, reusado para sempre.
- **Contas bancárias passam a ser 1:N por país**: `Identity.bankAccounts:
BankAccount[]`, com uma conta por `(country, fiat)`.
- `ensureIdentity` no `RampServiceImpl`:
  1. se a identidade existe **e** há conta para o país → reusa tudo;
  2. se a identidade existe mas o país é novo → reusa o `customerId` e cria
     **só** a conta bancária do país novo;
  3. primeira vez → cria customer + primeira conta.

## Consequências

- **+** Multi-país funciona de verdade: mesmo usuário, PIX em BR e SPEI em MX.
- **+** Sem regressão no gotcha do ADR-005: customer nunca é recriado.
- **−** `createBankAccount` para o país novo exige `details` do novo país (o
  app coleta a chave PIX _ou_ os dados SPEI conforme o onboarding atual).
- **−** Mudança de shape da `Identity` (breaking pré-1.0): store SQLite/Redis
  futuro persiste o array — campo `bank_accounts` (JSON) por identidade.
- **−** Duas ordens simultâneas no país novo podem criar duas contas (sem
  lock); aceitável na sandbox/demo, resolver com idempotency quando houver
  concorrência real.

## Referências

- Spec: `specs/features/onboarding.feature` (cenário "País novo cria nova
  conta bancária")
- ADR-005: `docs/adr/ADR-005-identidades-reusadas.md`
- Doc Etherfuse 03/08/2026: `POST /ramp/customer/{customer_id}/bank-account`
