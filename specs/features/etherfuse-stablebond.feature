# language: pt
Funcionalidade: EtherfuseStablebondProvider (swap real USDC ↔ Stablebond)

  Como uma aplicação que usa o YieldEngine em modo live
  Eu quero que o autoPark/liquidate execute um swap real na Etherfuse
  Para que o usuário renda de verdade, não uma simulação

  Contexto:
    Dado um EtherfuseStablebondProvider configurado com customerId e wallet válidos
    E que os ativos USDC e TESOURO são resolvidos via GET /ramp/assets

  Cenário: swapUsdcToBond pede quote e swap reais
    Quando chamo swapUsdcToBond de "100" USDC para "TESOURO"
    Então o provider chama POST /ramp/quote com quoteId gerado por ele
    E chama POST /ramp/swap com o mesmo quoteId
    E devolve uma posição com os tokens estimados pela quote

  Cenário: swapBondToUsdc inverte sourceAsset/targetAsset
    Quando chamo swapBondToUsdc de "50" TESOURO
    Então o quoteAssets.sourceAsset é o identifier do TESOURO
    E o quoteAssets.targetAsset é o identifier do USDC

  Cenário: getNav delega para a fonte real de NAV, nunca chama /ramp/quote
    Quando chamo getNav("TESOURO")
    Então nenhuma chamada a /ramp/quote ou /ramp/swap acontece
    E o valor vem de GET /lookup/stablebonds (EtherfuseNavSource)

  Cenário: balanceOf lê a Stellar direto, nunca a API autenticada da Etherfuse
    Quando chamo balanceOf(pubkey, "TESOURO")
    Então a chamada é para o Horizon (/accounts/{pubkey})
    E nenhum header Authorization é enviado

  Cenário: confirmSwapWebhook reconhece o payload real (chave = tipo do evento)
    Dado um corpo de webhook no formato {"swap_updated": {sendTransaction, status, ...}}
    E uma assinatura HMAC-SHA256 válida sobre o JSON canonicalizado (RFC 8785)
    Quando chamo confirmSwapWebhook(rawBody, signatureHeader)
    Então a sendTransaction é assinada pelo StellarSigner configurado
    E submetida ao Horizon
    E o método devolve {orderId, hash} — o saldo real é lido depois via balanceOf

  Cenário: confirmSwapWebhook rejeita assinatura inválida
    Dado um corpo de webhook válido
    E um header de assinatura incorreto
    Quando chamo confirmSwapWebhook(rawBody, signatureHeader)
    Então o provider lança um erro, nunca processa o evento

  Cenário: confirmSwapWebhook ignora updates sem sendTransaction
    Dado um evento swap_updated com status "created" e sem sendTransaction
    Quando chamo confirmSwapWebhook(rawBody, signatureHeader)
    Então o método devolve null, sem tentar assinar nada
