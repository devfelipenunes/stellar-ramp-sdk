# stellar-ramp-sdk — AI Onboarding Spec

> A yield-bearing ramp SDK for **Stellar**: regional fiat ↔ USDC (multi-provider)
>
> - auto-park into Etherfuse Stablebonds (yield). Built with **SDD/TDD**:
>   Gherkin specs + ADRs define the contract before code.

---

## 1. What this is

Two independent tracks, linked by **USDC** (ADR-003):

```text
PIX → [ramp.in] → USDC → [autoPark] → TESOURO (BR) / CETES (MX) / USTRY (US)  → yielding
spend → [liquidate JIT] → USDC → [ramp.out] → fiat
```

- **Track Ramp** (`packages/sdk`, pkg `@stellar-ramp/sdk`): fiat ⇄ USDC ramp.
- **Track Yield** (`packages/yield`, pkg `@stellar-ramp/yield`): USDC auto-parked into yield-bearing stablebonds (NAV-based, not rebase — ADR-010).

## 2. Repo layout

```text
packages/sdk/        # Track Ramp — hexagonal: domain / application / adapters
packages/yield/      # Track Yield — hexagonal (same layers)
apps/demo/           # HTTP server + dashboard (mock mode) + E2E tests
examples/basic.ts    # Minimal flow with the high-level factories
specs/features/      # Gherkin specs (contract first — SDD/TDD)
docs/adr/            # 13 ADRs (architecture decisions, 001–013)
docs/                # Developer guides (see "Documentation")
scripts/             # Sandbox tools (confirm-sandbox, confirm-followup, fund-wallet)
AGENTS.md            # This file — AI onboarding
```

## 3. Architecture (hexagonal)

- **Domain** (entities + ports): pure TS — no framework imports. Money = `string` amounts + BigInt decimal (no float). Typed errors with `code`.
- **Application**: `RampService` / `YieldEngine` orchestrate via **ports** (interfaces), never adapters.
- **Adapters**: `MockProvider`, `EtherfuseProvider`, `InMemoryIdentityStore`, `SqliteIdentityStore`, `LiveStellarWallet`, `MockStablebondProvider`, `EtherfuseNavSource`, `EnvSecretProvider`.
- **Mock mode is first-class** (ADR-004): same contract as live, deterministic, offline.

### Ports (SDK)

- `RampProvider` — quote / createOnrampOrder / createOfframpOrder / getOrder / createCustomer / createBankAccount.
- `IdentityStore` — getIdentity / saveIdentity (1:1 per pubkey+provider — ADR-005).
- `SecretProvider` — keys server-side only (ADR-007).
- `StellarWallet` — chain access (balance guard for offramp).
- `EmbeddedWalletProvider` — provisionWallet (provider-hosted Stellar wallet).
- `SimulatableProvider` — sandbox fiat deposit hook.

## 4. Public API (high-level)

```ts
import { createStellarRamp } from "@stellar-ramp/sdk";
import { createStellarYield } from "@stellar-ramp/yield";

const ramp = createStellarRamp({ mode: "mock" }); // 1 line
const engine = createStellarYield({ mode: "mock" }); // 1 line

const q = await ramp.quote({
  direction: "onramp",
  country: "BR",
  fiat: "BRL",
  fiatAmount: "100",
});
await ramp.onramp({ quote: q, pubkey: "G-ALICE" }); // fiat → USDC
const pos = await engine.autoPark({ usdcAmount: q.usdcAmount, country: "BR" }); // USDC → TESOURO
const bal = await engine.balance(); // tokens × NAV (yielding)
const spent = await engine.liquidate({ code: "TESOURO", usdcAmount: "20" }); // JIT spend
```

Live: `createStellarRamp({ mode: "live", etherfuse: { environment: "sandbox", apiKeyEnv: "ETHERFUSE_API_KEY" } })`.

Full API reference: `docs/api-reference.md`.

## 5. Domain model (key types)

- `Quote` — quoteId, providerId, direction (onramp/offramp), country, fiat, fiatAmount, usdcAmount, feeBps, fee.
- `Order` — id, direction, status (`created → funded → completed`; offramp adds `finalized`), burnTransaction (offramp).
- `Identity` / `Customer` — customerId 1:1 per (pubkey, providerId) (ADR-005).
- `BankAccount` — 1:N per user country (ADR-013): BRL/PIX (`pixKey`/`pixKeyType`), MXN/SPEI (`clabe`), US.
- `BondPosition` / `YieldBalance` — tokens × NAV (ADR-010).

## 6. Core flows (validated on the real Etherfuse sandbox 04–05/08/2026)

1. **Onramp PIX/BRL (proven end-to-end)**: org (business/personal) → programmatic KYC → **WebSDK `/idv`** (email+selfie; no API) → `kyc_updated approved` → bank account PIX (`compliant:true`) → **embedded wallet** (P-256 `/ramp/wallet`) → quote (`walletAddress`) → order (`cryptoWalletId`) → `fiat_received` → `funded` → `completed`.
2. **Offramp (proven)**: quote `offramp` (USDC→fiat) → order (`offramp.orderId`).
3. **Yield**: USDC → stablebond at NAV (autoPark) → balance (tokens × NAV) → liquidate JIT.

## 7. Key constraints & gotchas (do not re-learn the hard way)

- **`createIdvLaunch` scope must be `"verification"`** — sandbox rejects `"idv"`.
- **Embedded wallet is required for orders** — a plain funded Stellar account fails with `Wallet not found or not authorized`. Flow: `POST /ramp/wallet` (P-256 signer) → quote `walletAddress` → order `cryptoWalletId`.
- **Order body uses camelCase** `publicKey` (not `public_key`/`wallet`), and the SAME wallet as the quote.
- **Issuer (`iss`) registration**: `iss` and JWKS URL are registered SEPARATELY with Etherfuse. JWKS must serve `application/json` (hosted at `devfelipenunes.github.io/jwks/jwks.json`).
- **PIX/BRL is sandbox-proven but NOT live** — Etherfuse production = Mexico (MXN/SPEI) only; Brazil is "upcoming".
- **`SqliteIdentityStore` needs Node 22** (`node:sqlite`; not available in Bun). `InMemoryIdentityStore` works everywhere.
- **Mock mode ignores `providers`** unless a `MockProvider` is passed (createRamp keeps the default).
- **Sandbox quote cap**: 500 MXN.

## 8. Conventions (follow these)

- **Commit messages in ENGLISH** (conventional: `feat:`/`fix:`/`improve:`).
- **No comments in code** (clean code; the user removed all).
- **SDD/TDD**: specs first (Gherkin), ADRs for decisions, tests define the contract.
- **No junk files in the repo root** (no loose .md/.txt helpers — keep those in /tmp).

## 9. Commands

```bash
pnpm test                 # 104/104 tests (SDK + Yield + E2E)
pnpm test -- --coverage   # + coverage (92.8%, gate: lines 90 / funcs 88 / branch 78)
pnpm typecheck            # strict, all packages
pnpm build                # tsc -b (dists)
pnpm build:publish        # tsup (ESM + dts) — npm-publishable artifact
bun examples/basic.ts     # full mock flow
bun apps/demo/server.ts   # demo dashboard at :8787
```

## 10. External dependencies / status

- **Validated against the real Etherfuse sandbox** (onramp PIX + offramp both closed).
- **Not yet**: npm publish (needs `NPM_TOKEN`), Etherfuse Brazil live, Koywe/Manteca adapters, KYB (business org), WebSDK `/idv` in a real app.
- Reference: `docs/sandbox-confirmation-checklist.md`, `docs/production.md`.
