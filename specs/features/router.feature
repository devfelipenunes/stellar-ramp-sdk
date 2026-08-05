# language: pt
Funcionalidade: Router multi-anchor (seleção e failover de provider)

  Como o core do SDK
  Eu quero escolher o melhor provider por país e sobreviver a falhas
  Para que o consumidor receba fiat↔cripto mesmo com um provider indisponível

  Contexto:
    Dado que existem providers Etherfuse (MX), Koywe (BR, MX) e Manteca (BR)
    E que nenhum provider cobre "AR"

  Cenário: País com um único provider usa ele diretamente
    Quando peço quote de "BRL 100" → cripto para "BR"
    Então o router escolhe o único provider que cobre BR entre Koywe e Manteca com base na melhor quote

  Cenário: País com múltiplos providers escolhe a melhor quote
    Dado que Koywe retorna feeBps 50 e Manteca retorna feeBps 20 para "BRL 100"
    Quando peço quote de "BRL 100" → cripto para "BR"
    Então o router seleciona Manteca (menor custo total)

  Cenário: Provider fora do ar tem failover para o próximo do país
    Dado que Koywe falha com erro de rede (timeout)
    Quando peço quote de "BRL 100" → cripto para "BR"
    Então o router ignora Koywe e usa Manteca
    E a quote final vem do Manteca

  Cenário: Todos os providers de um país falham → erro de domínio
    Dado que Koywe e Manteca falham com erro de rede
    Quando peço quote de "BRL 100" → cripto para "BR"
    Então o SDK falha com erro de domínio `all_providers_failed(country=BR)`
    E agrega os erros individuais para diagnóstico

  Cenário: País sem nenhum provider não chega a chamar rede
    Quando peço quote de "ARS 100" → cripto para "AR"
    Então o SDK falha com erro de domínio `no_provider_for_country(AR)`
    E nenhum provider é chamado

  Cenário: Em modo mock, o router usa apenas o MockProvider
    Dado que o SDK foi criado com `createRamp({ mode: "mock" })`
    Quando peço quote de "BRL 100" → cripto para "BR"
    Então a quote vem do MockProvider com taxas realistas
    E nenhum provider real (Etherfuse/Koywe/Manteca) é chamado
