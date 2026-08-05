# language: pt
Funcionalidade: Off-ramp (cripto/stablebond → fiat, embedded wallet)

  Como uma aplicação que integra o SDK
  Eu quero trocar um ativo (TESOURO, USDC, ...) por moeda local
  Para sair de on-chain quando quiser gastar

  Contexto:
    Dado que o customer tem identidade e conta bancária cadastradas no provider
    E que a embedded wallet possui saldo suficiente do ativo de origem

  Cenário: Off-ramp completo TESOURO→BRL via Etherfuse
    Quando solicito off-ramp de "TESOURO 8.62" → BRL
    Então o SDK cria a ordem no provider com status "created"
    E o provider constrói a transação de queima (burn) do ativo internamente
    E a ordem evolui para "funded", com uma aprovação pendente (`approval`)
    E ao assinar e submeter essa aprovação com a chave P-256 da wallet a ordem evolui para "completed"
    E o app é notificado do payout fiat finalizado

  Cenário: Aprovação de offramp usa o mesmo mecanismo do onramp
    Dado que a ordem de offramp tem status "funded" e um campo `approval`
    Quando assino o `approvalMessage` com a chave P-256 da wallet
    E submeto a aprovação assinada
    Então o provider autoriza o burn e a ordem completa

  Cenário: Off-ramp com saldo insuficiente falha antes de criar ordem
    Dado que a wallet tem "TESOURO 5" disponível
    Quando solicito off-ramp de "TESOURO 20" → BRL
    Então o SDK falha com erro de domínio `insufficient_balance`
    E nenhuma ordem é criada no provider

  Cenário: Off-ramp consultável e com rastreio até o payout
    Quando consulto o status de uma ordem de off-ramp
    Então recebo o objeto Order com a cadeia de status e o valor do payout
    E posso ver a URL de statusPage do provider (sandbox)

  Cenário: Em modo mock, off-ramp finaliza sem tocar a chain
    Dado que o SDK roda com `createRamp({ mode: "mock" })`
    Quando solicito off-ramp de "TESOURO 200" → BRL
    Então a ordem mock finaliza determinísticamente (taxas realistas)
    E o payout simulado aparece na consulta
