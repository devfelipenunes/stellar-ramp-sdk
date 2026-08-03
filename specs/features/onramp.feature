# language: pt
Funcionalidade: On-ramp (fiat → USDC)

  Como um usuário do app
  Eu quero depositar moeda local e receber USDC na minha carteira Stellar
  Para entrar em on-chain sem conhecer os detalhes do provider

  Contexto:
    Dado que o usuário tem identidade criada no provider (ADR-005)
    E que a carteira Stellar do usuário é conhecida pelo SDK

  Cenário: On-ramp completo MXN→USDC via Etherfuse
    Quando solicito on-ramp de "MXN 300" → USDC
    Então o SDK cria uma ordem no provider com status "created"
    E retorna um orderId rastreável
    E o provider confirma o depósito fiat (SPEI simulado via `fiat_received` na sandbox)
    E a ordem evolui para "funded" e depois "completed"
    E o saldo USDC da carteira do usuário aumenta no montante da quote

  Cenário: Ordem de on-ramp é consultável pelo orderId
    Dado que existe uma ordem de on-ramp criada
    Quando consulto o status da ordem pelo orderId
    Então recebo o objeto Order com status, providerId e timestamps

  Cenário: Nova ordem do mesmo usuário reusa identidade (não recria)
    Dado que o usuário já tem customerId/bankAccountId persistidos
    Quando solicito uma segunda ordem de on-ramp
    Então o SDK não recria customer/bank no provider
    E a segunda ordem referencia as mesmas identidades

  Cenário: Produto em produção detecta o depósito sozinho (sem `fiat_received`)
    Dado que o SDK roda em modo "live" com Etherfuse
    Quando o depósito SPEI é confirmado pelo banco
    Então o provider atualiza a ordem para "funded" sem ação do app
    E o webhook configurado notifica o app do novo status

  Cenário: USDC é entregue na carteira Stellar do usuário
    Dado que a ordem de on-ramp está "completed"
    Então o provider executa a emissão/transferência de USDC
    E o SDK verifica o saldo final da carteira contra a quote (slippage tolerado)

  Cenário: Falha no depósito fiat deixa a ordem cancelada
    Dado que o depósito fiat nunca é confirmado dentro do prazo
    Quando o prazo expira
    Então a ordem transita para "expired" (ou "cancelled" conforme provider)
    E o SDK reflete o status final na consulta
