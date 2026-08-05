# language: pt
Funcionalidade: On-ramp (fiat → cripto/stablebond, embedded wallet)

  Como uma aplicação que integra o SDK
  Eu quero depositar moeda local e receber um ativo (USDC, TESOURO, ...) na embedded wallet
  Para entrar em on-chain sem que o usuário assine nada além da aprovação da própria wallet

  Contexto:
    Dado que o customer já tem identidade e conta bancária cadastradas no provider (ADR-005)
    E que existe uma embedded wallet provisionada (walletId + chave pública P-256)

  Cenário: On-ramp completo BRL→TESOURO via Etherfuse (sem USDC intermediário)
    Quando solicito on-ramp de "BRL 100" → TESOURO
    Então o SDK cria uma ordem no provider com status "created"
    E retorna um orderId rastreável
    E o provider confirma o depósito fiat (PIX simulado via `fiat_received` na sandbox)
    E a ordem evolui para "funded", com uma aprovação pendente (`approval`)
    E ao assinar e submeter essa aprovação com a chave P-256 da wallet a ordem evolui para "completed"
    E o saldo TESOURO da embedded wallet aumenta no montante da quote

  Cenário: Ordem de on-ramp é consultável pelo orderId
    Dado que existe uma ordem de on-ramp criada
    Quando consulto o status da ordem pelo orderId
    Então recebo o objeto Order com status, providerId, cryptoAsset e timestamps

  Cenário: Nova ordem do mesmo customer reusa identidade (não recria)
    Dado que o customer já tem customerId/bankAccountId persistidos
    Quando solicito uma segunda ordem de on-ramp
    Então o SDK não recria customer/bank no provider
    E a segunda ordem referencia as mesmas identidades

  Cenário: Aprovação embutida na ordem precisa ser assinada com a chave certa
    Dado que a ordem tem status "funded" e um campo `approval`
    Quando releio a ordem antes de assinar
    Então o `approvalMessage` vem com um timestamp renovado
    E uma assinatura sobre uma leitura antiga é rejeitada pelo provider

  Cenário: Falha no depósito fiat deixa a ordem sem aprovação
    Dado que o depósito fiat nunca é confirmado dentro do prazo
    Quando o prazo expira
    Então a ordem nunca recebe um `approval`
    E `settleEmbeddedOrder` falha com `approval_timeout`
