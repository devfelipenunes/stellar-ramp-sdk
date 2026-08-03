# ADR-004: Mock mode por design (não ad-hoc)

|            |                    |
| ---------- | ------------------ |
| **Status** | Aceita             |
| **Data**   | 2026-08-03         |
| **Tipo**   | Estratégia técnica |

## Contexto

A sandbox da Etherfuse tem limites que quebram demos na hora errada: **sem faucet** (tokens via onramp simulado ou contato), **cap 500 MXN/quote**, e — o mais crítico — **stablebonds testnet sem liquidez** (swap CETES→USDC falha `op_no_path`; só mainnet tem pool). Fragmentação de USDC entre DEX/Blend/Etherfuse também isola a demo.

## Decisão

**Mock mode é cidadão de primeira classe, não um fallback improvisado.**

- `createRamp({ mode: "mock" | "live" })`. Em `mock`, um `MockProvider` (adapter) responde com **taxas realistas** derivadas dos mesmos dados que o live usaria.
- O mock respeita a MESMA interface `RampProvider` (ADR-002) → a app não sabe se está em mock ou live.
- Os valores mock vêm de constantes de referência (ex.: taxa Etherfuse 0.25–1.5%, quotes plausíveis em MXN/BRL) — nunca valores aleatórios.
- Prod/live nunca toca código mock; mock nunca esconde bugs do live (testes de contrato rodam nos dois).

## Consequências

- **+** Demo roda offline, determinística, sem depender de rede/faucet/liquidez.
- **+** Jurados entendem: "leg fiat simulado na sandbox, PIX real via Koywe/Manteca quando quisermos".
- **+** TDD puro: testes de contrato rodam em mock e em live (se live acessível).
- **−** Risco de "mock bonito, prod quebrado" → mitigado: mesmas asserções de contrato nos dois modos; mock valida shape igual ao live.

## Referências

- Spec: `specs/features/mock-mode.feature`
- Playbook: `80 - Playbooks/Etherfuse Sandbox - Onboarding e Gotchas`
