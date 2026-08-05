# ADR-015: Embedded wallet + aprovação P-256 substitui wallet autocustodiada + swap

|            |             |
| ---------- | ----------- |
| **Status** | Aceita      |
| **Data**   | 2026-08-05  |
| **Tipo**   | Arquitetura |

## Contexto

A arquitetura original (ADR-003/009/010/011/014) dividia o produto em duas tracks — `sdk`
(Ramp: fiat↔USDC) e `yield` (Yield: USDC↔Stablebond via swap) — ligadas por USDC como
"contrato" comum. Essa divisão pressupunha uma wallet autocustodiada, onde a aplicação guarda
a chave Ed25519 e assina toda transação (swap incluído).

Testando ao vivo contra o sandbox real da Etherfuse, confirmamos três coisas que invalidam essa
premissa:

1. `POST /ramp/swap` (o mecanismo do pacote `yield`) não assenta em embedded wallets — aceita o
   pedido (`200`) mas nunca dispara o webhook de assinatura, porque exige a chave Ed25519 nativa
   da conta, que numa embedded wallet só a Etherfuse tem.
2. Onramp/offramp (o pacote `sdk`) usam um mecanismo **diferente**, documentado em
   `docs.etherfuse.com/guides/embedded-wallets`: a Etherfuse propõe a transação e a aplicação
   **aprova** assinando um `approvalMessage` com uma chave **P-256** que ela mesma gera e
   registra via `POST /ramp/wallet` — nunca a chave nativa da conta.
3. Onramp aceita **qualquer ativo de destino**, não só USDC — inclusive um Stablebond
   (`TESOURO:G...`) diretamente. O mesmo vale para offramp como ativo de origem. Isso elimina a
   necessidade de um hop USDC intermediário e, com ele, a necessidade do pacote `yield` inteiro.

## Decisão

- **`@stellar-ramp/yield` é removido.** `autoPark`/`liquidate`/NAV/lock não têm mais papel:
  o "yield" agora é só um ativo de destino do onramp (`cryptoAsset: "TESOURO:..."`), tratado
  pelo mesmo `RampService` que trata USDC.
- **`Order`/`Quote` generalizam `usdcAmount` → `cryptoAmount` + `cryptoAsset`.** Nenhum campo do
  domínio assume mais que o ativo é sempre USDC.
- **Novo mecanismo de assentamento**: `EmbeddedWalletSigner` (ECDSA P-256/SHA-256) assina o
  `approvalMessage` retornado pela ordem; `RampProvider.submitApproval()` submete a assinatura;
  `RampService.settleEmbeddedOrder()` encapsula o ciclo poll→assina→submete→poll, com timeout
  configurável (o `approvalMessage` embute um timestamp renovado a cada leitura — assinar uma
  leitura antiga é rejeitado).
- **`BurnTransaction` (Ed25519, self-signed) é removido.** Offramp usa o mesmo mecanismo de
  aprovação do onramp (confirmado na doc: "An offramp authorizes a burn rather than a claim").

## Consequências

- **+** Um pacote só, uma wallet só, um mecanismo de assinatura só (P-256) para todo o ciclo
  fiat→cripto→fiat.
- **+** Nenhuma dependência de webhook próprio no ar — o modelo é poll-e-assina, não push.
- **+** O SDK fica mais simples de embutir em outra aplicação: só `quote`/`onramp`/`offramp`/
  `settleEmbeddedOrder`.
- **−** Modelo de custódia vira **pool único por aplicação**: `POST /ramp/wallet` sempre
  vincula a wallet ao customer "raiz" da API key — testamos e confirmamos que não dá pra
  escopar por usuário final (`POST /ramp/customer/{id}/wallet` rejeita explicitamente:
  *"Embedded-wallet provisioning is not supported for customer wallets"*). Multi-tenant real
  (uma wallet por usuário final) não está resolvido — ver `plan-refactor.md` §7 e
  `SDK-implementation.md`.
- **−** Perdemos a capacidade (nunca usada em produção) de operar sobre uma wallet Stellar
  qualquer já existente do usuário — hoje só embedded wallets provisionadas pela Etherfuse
  funcionam de ponta a ponta.

## Referências

- `plan-refactor.md` — plano completo desta migração, com a tabela de evidências testadas ao
  vivo.
- `docs.etherfuse.com/guides/embedded-wallets` — mecanismo de aprovação (fonte oficial).
- ADR-003, ADR-009, ADR-010, ADR-011, ADR-014 — decisões substituídas por esta.
