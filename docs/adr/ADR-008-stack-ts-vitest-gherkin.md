# ADR-008: Stack TypeScript + Vitest + Gherkin (SDD/TDD)

|            |                    |
| ---------- | ------------------ |
| **Status** | Aceita             |
| **Data**   | 2026-08-03         |
| **Tipo**   | Processo / tooling |

## Contexto

O projeto é desenvolvido com **SDD** (specs primeiro) e **TDD** (testes antes do código), padrão já validado no projeto `selecao-validadores-rbb` (ADRs `DA-01..09` + 121 cenários Gherkin BDD). O ecossistema Stellar é TypeScript (`js-stellar-sdk`), e a app demo de hackathon é web.

## Decisão

- **TypeScript** em todas as tracks (SDK e Yield) — um idioma só, portabilidade web.
- **Vitest** para testes unitários/de contrato (rápido, TS nativo, watch).
- **Gherkin** (`.feature`) como camada SDD de comportamento, executada via Cucumber (step definitions por track). O RBB provou o formato; aqui as specs guiam os testes unitários.
- **ADRs** (`docs/adr/`) como camada SDD de arquitetura, espelhadas no Obsidian (`70 - Decisions/`) para o registro permanente.

### Ciclo TDD por capacidade

1. Escrever spec Gherkin (comportamento).
2. Extrair contracts TS (ports/entities) dos passos.
3. Escrever testes Vitest que codificam os cenários → **red**.
4. Implementar mínima → **green**.
5. Refactor.

## Consequências

- **+** Specs são executáveis (não morrem como documento).
- **+** Contracts emergem do comportamento, não de chute.
- **−** Duas camadas de teste (Cucumber + Vitest) = overhead de manutenção; mitigado: Cucumber cobre fluxos, Vitest cobre contratos/edge cases.

## Referências

- [ADR-001 — Arquitetura hexagonal](#)
- Nota: `30 - Projects/Stellar SDK + Yield - Divisão de Tracks` (stack recomendado)
