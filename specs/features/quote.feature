# language: pt
Funcionalidade: Cotação (quote) de on/off-ramp

  Como consumidor do SDK
  Eu quero pedir uma cotação fiat→USDC (ou USDC→fiat)
  Para saber quanto vou receber/pagar antes de executar uma ordem

  Contexto:
    Dado que existem providers Etherfuse (MX) e Koywe (BR, MX)
    E que o router está configurado com esses providers

  Cenário: Quote BRL para usuário no Brasil escolhe o provider que cobre o país
    Quando peço uma quote de "BRL 100" → USDC para o país "BR"
    Então o router seleciona o provider Koywe (único que cobre BR)
    E a quote retorna fiatCode "BRL", fiatAmount 100, usdcReceive e feeBps
    E a quote identifica o provider escolhido

  Cenário: Quote MXN é roteada para o provider com melhor custo
    Dado que Etherfuse cobra 0.25% e Koywe cobra 0.50% em MXN
    Quando peço uma quote de "MXN 500" → USDC para o país "MX"
    Então o router seleciona o provider Etherfuse (menor custo total)
    E a quote contém fee, feeBps e usdcReceive coerentes com a taxa do provider

  Cenário: Quote de on-ramp retorna montantes coerentes
    Quando peço uma quote de on-ramp de "MXN 1000" → USDC via Etherfuse
    Então a quote possui fiatAmount 1000, feeBps, fee em fiat, usdcReceive > 0
    E a soma (fee + valor investido em USDC) representa 100% do fiat

  Cenário: Quote de off-ramp retorna montantes coerentes
    Quando peço uma quote de off-ramp de "USDC 500" → MXN via Etherfuse
    Então a quote possui usdcSend 500, feeBps, fee em USDC e fiatReceive > 0

  Cenário: Quote com país sem cobertura falha com erro claro
    Quando peço uma quote de "BRL 100" → USDC para o país "AR"
    Então o SDK falha com erro de domínio `no_provider_for_country(AR)`
    E não chama nenhum provider

  Cenário: Quote acima do cap da sandbox é rejeitada (guarda do provider)
    Quando peço uma quote de "MXN 600" → USDC via Etherfuse em modo sandbox
    Então o adapter Etherfuse responde erro de cap `sandbox_quote_limit(500 MXN)`
    E o SDK repassa o erro com o limite em texto amigável
