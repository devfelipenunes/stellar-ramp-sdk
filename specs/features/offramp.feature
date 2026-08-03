# language: pt
Funcionalidade: Off-ramp (USDC → fiat)

  Como um usuário do app
  Eu quero trocar USDC por moeda local na minha conta bancária
  Para sair de on-chain quando quiser gastar

  Contexto:
    Dado que o usuário tem identidade e conta bancária cadastradas no provider
    E que o usuário possui saldo USDC suficiente

  Cenário: Off-ramp completo USDC→MXN via Etherfuse
    Quando solicito off-ramp de "USDC 200" → MXN
    Então o SDK cria a ordem no provider com status "created"
    E o provider solicita o burn dos USDC (burnTransaction)
    E o burn é confirmado na chain (1–2 min, regenerável)
    E a ordem evolui para "funded" → "completed" → "finalized"
    E o app é notificado do payout fiat finalizado

  Cenário: Burn transaction pode ser regenerado
    Dado que o burnTransaction expirou antes da assinatura
    Quando solicito o burn novamente
    Então o provider retorna um novo burnTransaction válido
    E a ordem continua a mesma (sem duplicar)

  Cenário: Off-ramp com saldo insuficiente falha antes de criar ordem
    Dado que o usuário tem "USDC 50" na carteira
    Quando solicito off-ramp de "USDC 200" → MXN
    Então o SDK falha com erro de domínio `insufficient_balance`
    E nenhuma ordem é criada no provider

  Cenário: Off-ramp consultável e com rastreio até o payout
    Quando consulto o status de uma ordem de off-ramp
    Então recebo o objeto Order com a cadeia de status e o valor do payout
    E posso ver a URL de statusPage do provider (sandbox)

  Cenário: Em modo mock, off-ramp finaliza sem tocar a chain
    Dado que o SDK roda com `createRamp({ mode: "mock" })`
    Quando solicito off-ramp de "USDC 200" → MXN
    Então a ordem mock finaliza determinísticamente (taxas realistas)
    E o payout simulado aparece na consulta
