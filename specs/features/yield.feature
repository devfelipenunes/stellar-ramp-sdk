# language: pt
Funcionalidade: Yield Engine (autoPark, NAV, liquidação JIT)

  Como um usuário do app
  Eu quero que meu saldo USDC renda em Stablebond do meu país
  Para que o dinheiro nunca fique parado e seja gastável quando eu quiser

  Contexto:
    Dado que o YieldEngine está em modo mock com alocação BR→TESOURO, MX→CETES, US→USTRY
    E que os NAVs de referência são TESOURO 1.23677 BRL, CETES 1.174751 MXN, USTRY 1.07127 USD

  Cenário: autoPark aloca USDC no stablebond do país
    Quando faço autoPark de "USDC 100" para o país "BR"
    Então recebo uma posição em TESOURO
    E os tokens = (USDC × câmbio BRL/USD) ÷ NAV
    E a posição registra NAV e valor em BRL

  Cenário: autoPark para país sem alocação falha com no_allocation_for_country
    Quando faço autoPark de "USDC 100" para o país "AR"
    Então o Engine falha com erro de domínio `no_allocation_for_country(AR)`

  Cenário: quote mostra a conversão USDC→stablebond no NAV atual
    Quando peço uma quote de "USDC 100" → TESOURO
    Então a quote retorna tokens, nav e fiatValue coerentes (tokens × nav = fiatValue)

  Cenário: balance mostra o valor rendendo ao vivo via NAV
    Dado que fiz autoPark de "USDC 100" para "BR"
    Quando consulto o balance
    Então recebo a posição com tokens, nav e fiatValue em BRL
    E fiatValue = tokens × NAV (nunca preço de mercado — ADR-010)

  Cenário: liquidate converte stablebond→USDC just-in-time
    Dado que tenho uma posição em TESOURO
    Quando peço para liquidar "USDC 20" (gasto JIT)
    Então o Engine converte o equivalente em tokens de volta a USDC
    E subtrai da posição (ou zera se liquidar tudo)

  Cenário: mock é determinístico com NAVs realistas
    Quando peço duas quotes idênticas de "USDC 100" → TESOURO
    Então ambas retornam o mesmo tokens e fiatValue

  Cenário: stablebond não suportado falha com unsupported_bond
    Quando peço uma quote de "USDC 100" → "XYZ"
    Então o Engine falha com erro de domínio `unsupported_bond(XYZ)`
