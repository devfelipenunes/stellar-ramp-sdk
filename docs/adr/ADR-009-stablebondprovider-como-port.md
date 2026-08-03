# ADR-009: `StablebondProvider` como port — Track Yield independente

|            |             |
| ---------- | ----------- |
| **Status** | Aceita      |
| **Data**   | 2026-08-03  |
| **Tipo**   | Arquitetura |

## Contexto

A Track Yield (Engine) mantém saldo rendendo em Stablebonds (TESOURO/CETES/USTRY). Assim como a Track SDK tem `RampProvider` (ADR-002), o Yield precisa de uma fronteira estável com a Etherfuse (swap + NAV). A independência entre tracks é o contrato do projeto (ADR-003).

## Decisão

`StablebondProvider` é um **port** com o mínimo para render/liquidar:

```ts
interface StablebondProvider {
  readonly id: string; // "etherfuse" | "mock"
  readonly bonds: Stablebond[]; // stablebonds suportados (code + fiat)
  getNav(code: StablebondCode): Promise<Nav>; // /lookup/stablebonds
  swapUsdcToBond(
    usdcAmount: Amount,
    code: StablebondCode,
  ): Promise<BondPosition>;
  swapBondToUsdc(bondAmount: Amount, code: StablebondCode): Promise<Amount>;
}
```

- O domínio do Yield só conhece USDC (entrada) e Stablebond (posição) — nunca o provider em runtime.
- MockStablebondProvider (ADR-012) é o adapter default da demo; Etherfuse é o adapter real.
- A Track SDK NÃO aparece aqui: o Yield assume USDC, o SDK entrega USDC.

## Consequências

- **+** Tracks submetíveis separadamente (lane própria do hackathon).
- **+** Trocar Etherfuse por outro emissor de RWA não toca o Engine.
- **−** O swap USDC→stablebond existe nas duas tracks conceitualmente; aqui ele é domínio do Yield (asset de rendimento), não do ramp.

## Referências

- [ADR-003 — USDC é o contrato entre tracks](#)
- Spec: `specs/features/yield.feature`
