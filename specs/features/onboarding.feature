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

  Cenário: Pubkeys diferentes geram identidades independentes
    Dado que o IdentityStore tem identidade para a pubkey A
    Quando o usuário com pubkey B passa pelo onboarding
    Então o SDK cria identidade nova para B
    E não reutiliza a identidade de A

  Cenário: Storage de identidade é injetável (memória p/ demo, SQLite p/ server)
    Dado que o SDK foi criado com `createRamp({ identityStore })`
    Então o IdentityStore injetado é usado para todas as consultas de mapeamento
    E o teste pode injetar um store em memória determinístico
