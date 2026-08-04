# language: pt
Funcionalidade: Onboarding e identidades (customer / bank / KYC)

  Como o SDK
  Eu quero gerenciar a identidade de cada usuário junto aos providers
  Para que ordens subsequentes não quebrem ("Bank account not found")

  Contexto:
    Dado que o app conhece a pubkey Stellar do usuário

  Cenário: Identidade é criada uma única vez por usuário
    Quando o usuário passa pelo onboarding pela primeira vez
    Então o SDK cria customer no provider
    E o SDK cria a conta bancária (bank account) do país do usuário
    E persiste o mapeamento pubkey → {customerId, bankAccountId} no IdentityStore

  Cenário: Ordens subsequentes reusam a identidade persistida
    Dado que o IdentityStore já possui o mapeamento para a pubkey
    Quando o usuário cria uma nova ordem
    Então o SDK reusa customerId/bankAccountId existentes
    E não chama o endpoint de criação de identidade novamente

  Cenário: KYC fake na sandbox é auto-aprovado
    Dado que o SDK roda em sandbox com Etherfuse
    Quando o onboarding submete dados fake de KYC
    Então o provider aprova o KYC automaticamente
    E o usuário fica apto a criar ordens

  Cenário: RFC placeholder mexicano auto-aprova o banco
    Dado que o usuário é pessoa física no México
    Quando o onboarding usa o RFC placeholder "XEXX010101000"
    Então o banco do provider é criado sem passar pelo provedor SPEI
    E ordens MXN podem ser simuladas na sandbox

  Cenário: Conta bancária BRL/PIX é criada com os campos do país
    Dado que o usuário tem uma chave PIX no Brasil
    Quando o onboarding chama o endpoint de banco por customer
    Então o SDK envia `POST /ramp/customer/{customer_id}/bank-account`
    E o payload `account` contém firstName, lastName, cpf, pixKey e pixKeyType
    E o `transactionId` (idempotency key) é gerado pelo SDK como uuid
    E o `bankAccountId` devolvido é persistido no IdentityStore

  Cenário: País novo cria nova conta bancária reusando o customer (ADR-013)
    Dado que o usuário já tem identidade e conta PIX em BR
    Quando o mesmo usuário onboarda em MX pela primeira vez
    Então o SDK reusa o customerId existente
    E cria uma NOVA conta bancária SPEI para MX
    E persiste as duas contas (BR e MX) no IdentityStore

  Cenário: Dados de conta bancária inválidos falham rápido, sem chamar a rede
    Dado que o usuário fornece uma CLABE mexicana com tamanho errado
    Quando o onboarding envia os detalhes da conta
    Então o SDK rejeita com `bank_account_details_invalid` antes de qualquer fetch
    E a API do provider não é chamada

  Cenário: Pubkeys diferentes geram identidades independentes
    Dado que o IdentityStore tem identidade para a pubkey A
    Quando o usuário com pubkey B passa pelo onboarding
    Então o SDK cria identidade nova para B
    E não reutiliza a identidade de A

  Cenário: Storage de identidade é injetável (memória p/ demo, SQLite p/ server)
    Dado que o SDK foi criado com `createRamp({ identityStore })`
    Então o IdentityStore injetado é usado para todas as consultas de mapeamento
    E o teste pode injetar um store em memória determinístico
