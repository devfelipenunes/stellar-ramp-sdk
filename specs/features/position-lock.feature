# language: pt
Funcionalidade: Lock/unlock de posição (primitivo genérico de garantia)

  Como uma aplicação construída sobre o YieldEngine (ex.: leilão, caução, colateral)
  Eu quero travar uma quantidade de tokens de uma posição
  Para que o usuário não consiga liquidar essa parte até eu destravar

  Contexto:
    Dado que o YieldEngine está em modo mock com alocação BR→TESOURO
    E que fiz autoPark de "USDC 100" para o país "BR"

  Cenário: lock reserva tokens de uma posição existente
    Quando travo "40" tokens de TESOURO com lockId "ref-1"
    Então o lock é registrado com o NAV do momento
    E o saldo disponível para liquidate cai para o restante

  Cenário: liquidate recusa tokens travados
    Dado que travei "40" tokens de TESOURO com lockId "ref-1"
    Quando tento liquidar mais do que o saldo destravado
    Então o Engine falha com erro de domínio `insufficient_unlocked_balance`

  Cenário: liquidate funciona normalmente dentro do saldo destravado
    Dado que travei "40" tokens de TESOURO com lockId "ref-1"
    E que a posição total é "≈80.94" tokens
    Quando liquido um valor dentro do saldo destravado
    Então a liquidação é aceita normalmente

  Cenário: unlock libera os tokens e reporta o rendimento acumulado
    Dado que travei "40" tokens de TESOURO com lockId "ref-1" quando NAV era "1.23677"
    E que o NAV subiu para "1.25000" antes do destrave
    Quando destravo "ref-1"
    Então os "40" tokens voltam a ficar disponíveis para liquidate
    E o yieldAccrued devolvido é tokens × (navFinal − navInicial)

  Cenário: unlock de um lockId inexistente falha
    Quando destravo um lockId que nunca foi travado
    Então o Engine falha com erro de domínio `lock_not_found`

  Cenário: lock de mais tokens do que o saldo disponível falha
    Quando travo mais tokens do que a posição total em TESOURO
    Então o Engine falha com erro de domínio `insufficient_balance_to_lock`
