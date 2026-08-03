# language: pt
Funcionalidade: Oráculo de NAV multi-fonte (ADR-010)

  Como o YieldEngine
  Eu quero que o NAV usado no balance seja robusto a fonte manipulada
  Para não repetir o exploit da Blend (oráculo VWAP spot, fev/2026, ~$10,8M)

  Contexto:
    Dado que o oráculo consulta múltiplas fontes de NAV
    E que o desvio máximo tolerado é 5% vs a mediana

  Cenário: fonte com NAV anômalo é ignorada (mediana robusta)
    Dado que 3 fontes reportam o NAV de USTRY
    E que a fonte "maliciosa" reporta 106.74 (a anomalia do exploit)
    E que as fontes honestas reportam 1.07127 e 1.07130
    Quando o oráculo resolve o NAV de USTRY
    Então o NAV retornado é ~1.07128 (mediana das honestas)
    E a fonte maliciosa aparece em `outliers`

  Cenário: com 2 fontes usa a mediana
    Dado que 2 fontes reportam o mesmo NAV de USTRY
    Quando o oráculo resolve o NAV de USTRY
    Então o NAV retornado é o das duas fontes

  Cenário: fonte fora do ar não derruba o oráculo
    Dado que 1 das fontes falha (rede)
    Quando o oráculo resolve o NAV
    Então usa as fontes que responderam
    E a fonte que falhou não aparece em `sourcesUsed`

  Cenário: sem nenhuma fonte disponível falha com erro
    Dado que todas as fontes falharam
    Quando o oráculo resolve o NAV
    Então falha com erro de domínio `no_nav_source_available`
