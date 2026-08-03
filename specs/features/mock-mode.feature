# language: pt
Funcionalidade: Modo mock (demo determinístico sem infra real)

  Como um build de hackathon
  Eu quero rodar a demo sem rede, faucet, keys ou liquidez testnet
  Para que a prova "funciona num segundo app" seja offline e confiável

  Contexto:
    Dado que a sandbox Etherfuse não tem faucet nem liquidez testnet de stablebonds (op_no_path)

  Cenário: SDK em modo mock funciona sem nenhuma chamada de rede
    Dado que o SDK foi criado com `createRamp({ mode: "mock" })`
    Quando executo quote, on-ramp e off-ramp
    Então nenhum adapter real (Etherfuse/Koywe/Manteca) é chamado
    E todas as operações retornam resultados válidos

  Cenário: Mock usa taxas realistas (não aleatórias)
    Dado que a taxa de referência da Etherfuse é 0.25%–1.5%
    Quando solicito uma quote em modo mock
    Então feeBps retornado está dentro da faixa realista configurada
    E duas chamadas idênticas retornam o mesmo resultado (determinístico)

  Cenário: Mock respeita o mesmo contrato de dados do live
    Dado que existem fixtures de resposta do provider live (Etherfuse sandbox)
    Quando o mock responde
    Então os objetos Quote e Order têm exatamente os mesmos campos do live
    E o shape é validado pelo mesmo schema de contrato

  Cenário: Mock pode simular falhas para testar o failover
    Dado que o MockProvider é configurado para falhar para o país "BR"
    Quando peço uma quote para "BR"
    Então o router faz failover para outro provider configurado
    E o teste observa o caminho de erro sem depender de rede

  Cenário: Alternar live↔mock não muda o código da app
    Dado que a app usa `createRamp({ mode: "mock" })`
    Quando troco para `createRamp({ mode: "live", providers: [etherfuse] })`
    Então a app não muda nenhuma chamada (mesma interface)
    E a prova "works in a second app" roda nos dois modos
