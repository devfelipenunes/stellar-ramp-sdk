# ADR-007: API keys server-side only

|            |            |
| ---------- | ---------- |
| **Status** | Aceita     |
| **Data**   | 2026-08-03 |
| **Tipo**   | Segurança  |

## Contexto

A auth da Etherfuse é um header `Authorization: <key>` (sem "Bearer"), e a key dá acesso a ordens, swaps e dados de cliente. Se o SDK rodar client-side (browser), a key vaza no bundle — e a sandbox tem cap 500 MXN, mas produção movimenta dinheiro real. O SDK é multi-provider (Koywe/Manteca têm chaves próprias) → o problema se multiplica.

## Decisão

- **O SDK roda server-side** (ou atrás de um proxy fino que o app expõe). Keys ficam em `env`/secrets do servidor; nunca entram no bundle do cliente.
- A API pública do SDK (`ramp.in/out/quote/status`) é chamada pelo backend do app; o cliente (UI) fala com esse backend.
- O SDK **rejeita** construir requests com key explícita vinda de código de cliente — a key vem de um `SecretProvider` injetado (env, Vault, etc.).
- Para o hackathon: o `apps/demo` tem um backend mínimo (Node) que instancia o SDK; o frontend consome endpoints do demo.

## Consequências

- **+** Zero vazamento de segredos em client.
- **+** Adapters multi-provider concentram chaves num lugar auditável.
- **−** O SDK não é "drop-in no browser" puro — exige um backend fino. Narrativa aceitável (SDKs de pagamento reais funcionam assim).
- **−** Mais uma peça no demo (servidor). Custo pequeno.

## Referências

- [ADR-001 — Arquitetura hexagonal](#) (adapters/driving)
- Playbook: §1 auth (header sem Bearer, keys por ambiente)
