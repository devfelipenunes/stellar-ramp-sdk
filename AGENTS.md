# stellar-ramp-sdk — AI Onboarding Spec

> An embedded-wallet ramp SDK for **Stellar**: regional fiat (PIX/SPEI) ⇄ any Etherfuse
> asset (USDC, TESOURO/CETES/USTRY stablebonds) via a P-256-signed approval flow. Built
> with **SDD/TDD**: Gherkin specs + ADRs define the contract before code.

---

## 1. What this is

One package, one custody model (ADR-015):

```text
PIX (BRL) → [ramp.onramp, cryptoAsset="TESOURO:..."] → embedded wallet holds TESOURO
TESOURO → [ramp.offramp, cryptoAsset="TESOURO:..."] → BRL payout
```

There is no USDC hop and no self-custodied wallet in the default flow — TESOURO (or any
other Etherfuse-supported asset) is just the `cryptoAsset` of an onramp/offramp order. The
former two-track design (`@stellar-ramp/sdk` + `@stellar-ramp/yield`, USDC↔swap) was
**removed** — see ADR-015 for why (swap doesn't settle on embedded wallets; onramp/offramp
accept any asset directly).

## 2. Repo layout

```text
packages/sdk/        # The only package — hexagonal: domain / application / adapters
examples/pix-tesouro-brl.ts  # Single runnable example (onramp + offramp, real sandbox)
specs/features/      # Gherkin specs (contract first — SDD/TDD)
docs/adr/            # 15 ADRs (001–002/004–008/012–013 valid; 003/009–011/014 superseded by 015)
Workflow-Manual-teste.md  # How to run the example end-to-end and validate it
SDK-implementation.md     # Integration guide for a consuming application
plan-refactor.md          # Record of the migration from the old two-track design
```

## 3. Architecture (hexagonal)

- **Domain** (entities + ports): pure TS — no framework imports. Money = `string` amounts
  + BigInt decimal (no float). Typed errors with `code`.
- **Application**: `RampService` orchestrates via **ports** (interfaces), never adapters.
- **Adapters**: `MockProvider`, `EtherfuseProvider`, `InMemoryIdentityStore`,
  `SqliteIdentityStore`, `LiveStellarWallet`, `EnvSecretProvider`,
  `createEmbeddedWalletSigner`.
- **Mock mode is first-class** (ADR-004): same contract as live, deterministic, offline.

### Ports

- `RampProvider` — quote / createOnrampOrder / createOfframpOrder / getOrder /
  submitApproval / createCustomer / createBankAccount.
- `IdentityStore` — getIdentity / saveIdentity (1:1 per pubkey+provider — ADR-005).
- `SecretProvider` — keys server-side only (ADR-007).
- `StellarWallet` — chain balance guard (generic `getBalance(pubkey, assetCode)`).
- `EmbeddedWalletProvider` — `provisionWallet(signerPublicKeyPem)`.
- `SimulatableProvider` — sandbox fiat deposit hook.

## 4. Public API (high-level)

```ts
import {
  createRamp, createEtherfuseProvider, createEnvSecretProvider,
  createEmbeddedWalletSigner, generateEmbeddedWalletKeyPair, InMemoryIdentityStore,
} from "@stellar-ramp/sdk";

const etherfuse = createEtherfuseProvider({
  baseUrl: "https://api.sand.etherfuse.com", environment: "sandbox", countries: ["BR"],
  secrets: createEnvSecretProvider(),
});
const ramp = createRamp({ mode: "live", providers: [etherfuse], identityStore: new InMemoryIdentityStore() });

const { publicKeyPem, privateKeyPem } = generateEmbeddedWalletKeyPair(); // once, persist privateKeyPem
const wallet = await ramp.provisionWallet("etherfuse", publicKeyPem);
const signer = createEmbeddedWalletSigner(privateKeyPem);

const quote = await ramp.quote({
  direction: "onramp", country: "BR", fiat: "BRL", fiatAmount: "100",
  cryptoAsset: "TESOURO:GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4",
  pubkey: wallet.publicKey, walletAddress: wallet.publicKey,
});
const order = await ramp.onramp({ quote, pubkey: wallet.publicKey, walletAddress: wallet.publicKey, cryptoWalletId: wallet.walletId });
// (sandbox) await etherfuse.simulateFiatDeposit(order.id);
const settled = await ramp.settleEmbeddedOrder(order.id, signer); // poll → sign → submit → poll
```

Full guide: `SDK-implementation.md`. Manual validation script: `Workflow-Manual-teste.md`.

## 5. Domain model (key types)

- `Quote` / `Order` — `fiatAmount`+`fiat`, `cryptoAmount`+`cryptoAsset` (generic, not
  USDC-only). `Order.approval?: { approvalMessageId, approvalMessage, summary }` replaces
  the old `burnTransaction`.
- `Identity` / `Customer` — customerId 1:1 per (pubkey, providerId) (ADR-005).
- `BankAccount` — 1:N per user country (ADR-013): BRL/PIX (`pixKey`/`pixKeyType`), MXN/SPEI
  (`clabe`).

## 6. Core flow (validated live against the real Etherfuse sandbox, 05/08/2026)

Onramp BRL→TESOURO on an embedded wallet, end to end, via this SDK's own code
(`ramp.onramp()` + `ramp.settleEmbeddedOrder()`), confirmed by a real Horizon balance
increase. Offramp TESOURO→BRL burns the asset for real (confirmed on Horizon) but the
order's `"completed"` status lagged in testing — treat as a known sandbox timing quirk, not
a signing failure (see `Workflow-Manual-teste.md` troubleshooting).

## 7. Key constraints & gotchas (do not re-learn the hard way)

- **`Connection: close` header is required** on every Etherfuse request. Without it, Node's
  `fetch` (undici) keep-alive connection reuse sometimes makes the sandbox never dispatch
  the async job that generates the approval — the order gets stuck at `"funded"` forever.
  Confirmed live: identical payload via `curl` (connection-per-request) always worked;
  via Node `fetch` without this header, it got stuck 3/3 times. Already set in
  `EtherfuseProvider`; don't remove it.
- **`POST /ramp/order/fiat_received`** takes `{ orderId }` in the **body**, against a
  **fixed path** — NOT `/ramp/order/{id}/fiat_received`. Also returns an **empty body**
  on success (`request()` must not blindly call `.json()`).
- **`POST /ramp/wallet` always binds to the API key's root customer**, never to a
  `customerId` you pass — confirmed by testing `POST /ramp/customer/{id}/wallet`, which
  explicitly rejects embedded-wallet provisioning. There is currently no way to give
  different end users their own embedded wallet under one API key — single-tenant/pool
  model only (see ADR-015, `SDK-implementation.md` §Limitations).
- **Swap (`POST /ramp/swap`) does not settle on embedded wallets** — it requires signing
  the raw Stellar XDR with the account's native Ed25519 key, which only Etherfuse holds
  for an embedded wallet. Removed from this codebase for that reason.
- **`approvalMessage` embeds a timestamp rebuilt on every read** — always re-fetch the
  order immediately before signing; a signature over a stale read is rejected.
- **PIX/BRL is sandbox-only** — Etherfuse production is Mexico (MXN/SPEI) only.
- **`SqliteIdentityStore` needs Node 22** (`node:sqlite`).
- **Sandbox quote cap**: 500 MXN.

## 8. Conventions (follow these)

- **Commit messages in ENGLISH** (conventional: `feat:`/`fix:`/`improve:`).
- **No comments in code** unless documenting a non-obvious constraint (see gotchas above —
  those are exactly the kind of thing worth a one-line comment at the call site).
- **SDD/TDD**: specs first (Gherkin), ADRs for decisions, tests define the contract.
- **No junk files in the repo root** — keep scratch files in `/tmp`, not here.

## 9. Commands

```bash
pnpm test                 # vitest — 88/88
pnpm test -- --coverage   # coverage gate: lines 90 / funcs 88 / branch 78
pnpm typecheck            # strict, src + tests
pnpm build                # tsc -b
pnpm build:publish        # tsup (ESM + dts) — npm-publishable artifact
pnpm flow -- 10           # examples/pix-tesouro-brl.ts against the real sandbox
```

## 10. External dependencies / status

- **Validated against the real Etherfuse sandbox**: onramp closed end-to-end via this
  SDK's own code; offramp burns for real but order-completion status lagged (open item).
- **Not yet**: npm publish, Etherfuse Brazil in production, multi-tenant embedded wallets,
  a confirmed fix for offramp's "completed" status lag.
- Reference: `plan-refactor.md` (migration rationale), `docs/adr/ADR-015-*.md`.
