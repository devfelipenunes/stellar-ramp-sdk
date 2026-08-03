# language: pt
Funcionalidade: Quotes SEP-38 para stablebonds

  Como um app Stellar
  Eu quero expor a conversão USDC↔stablebond no formato SEP-38
  Para que anchors e wallets consumam sem código custom
  (a pesquisa identificou SEP-38 de stablebond como "espaço aberto")

  Cenário: converte uma BondQuote no formato SEP-38
    Quando converto a quote USDC 100 → TESOURO para SEP-38
    Então sell_asset é "stellar:USDC:<issuer>"
    E buy_asset é "stellar:TESOURO:<issuer>"
    E sell_amount e buy_amount têm 7 casas decimais (padrão SEP-38)
    E expires_at está presente (quote com validade)
    E price = sell_amount ÷ buy_amount

  Cenário: par inválido (USDC ↔ USDC) falha
    Quando converto uma quote com code "USDC" para SEP-38
    Então falha com erro de domínio `invalid_sep38_pair`

  Cenário: issuers obrigatórios
    Quando converto uma quote sem issuer de USDC ou do stablebond
    Então falha com erro de domínio `invalid_sep38_pair`
