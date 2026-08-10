# stellar-ramp-sdk

<p align="center">
  <a href="https://stellar-ramp-sdk.vercel.app/">
    <img src="https://img.shields.io/badge/%F0%9F%9A%80_Live_docs-stellar--ramp--sdk.vercel.app-7C3AED?style=for-the-badge&labelColor=111" alt="Live docs — stellar-ramp-sdk.vercel.app" />
  </a>
  <a href="https://github.com/devfelipenunes/stellar-ramp-sdk">
    <img src="https://img.shields.io/badge/GitHub-devfelipenunes%2Fstellar--ramp--sdk-111?style=for-the-badge&labelColor=7C3AED" alt="GitHub" />
  </a>
</p>

**The fiat ⇄ Stablebond ramp for Stellar.** One SDK that moves PIX/SPEI straight
into yield-bearing Stablebonds (TESOURO, CETES, USTRY) or USDC through a single
embedded wallet — no intermediary hop, no self-custodied wallet. Built as the
deliverable for two Stellar build sub-lanes, with spec-driven and test-driven
development (Gherkin specs and ADRs first, tests that define the contract before
the code).

## Live docs — try it now

> ### 🚀 **[stellar-ramp-sdk.vercel.app](https://stellar-ramp-sdk.vercel.app/)**
>
> The public documentation site for this SDK, deployed on Vercel. It is the
> **primary onboarding surface** for the project — open it to follow the
> **quickstart**, understand the **architecture**, and browse the full
> **API reference**. If you are evaluating or integrating the SDK, start here.

## Sub-lanes

### Stablebonds — consumer & DeFi

This sub-lane focuses on consumer and DeFi applications that leverage tokenized sovereign assets and yield-bearing financial products from Etherfuse. Builders should create products that make emerging-market yield accessible through intuitive user experiences, showcasing how Stablebonds can be integrated into savings, payroll, payments, lending, or investment applications for real-world financial use cases.

Examples of what you can build:

- **BRL savings / neobank flow:** a consumer app that routes a BRL stablecoin balance into TESOURO to earn yield, with clean deposit/withdraw UX. _Good: working demo, funds visibly earning, one-tap in/out._
- **Payroll-to-yield:** employer pays wages that auto-park in TESOURO until spent. _Good: end-to-end payroll demo with yield accrual._
- **Yield-backed spending:** a card/PIX-style spend surface where the balance sits in Stablebonds until the moment of payment. _Good: spend flow that liquidates just-in-time._
- **Stablebond DeFi composability:** use TESOURO/CETES/USTRY as collateral or LP in Blend or Soroswap. _Good: a working position with a clear risk/yield story._
- **Multi-country yield index:** a product that blends several Stablebonds into one diversified sovereign-yield position. _Good: single token, transparent basket._

### LATAM fiat on/off-ramp

This sub-lane is dedicated to improving fiat on/off-ramp experiences across Brazil and Latin America. Builders are encouraged to develop reusable tools, SDKs, integrations, and user-friendly payment experiences that make it easier for applications to connect with regional payment rails and stablecoin infrastructure. The goal is to reduce integration complexity while accelerating adoption of Stellar-based financial services throughout the region.

Examples of what you can build:

- **PIX ramp integration:** BRL in and out via PIX into an Etherfuse or Manteca USDC asset. _Good: a user goes from BRL to an on-chain asset and back in the demo._
- **Ramp UX kit:** a reusable component/SDK other builders can drop in to add Etherfuse/Manteca ramp support. _Good: documented, importable, works in a second app._
- **Multi-anchor router:** abstract Etherfuse, Manteca and Koywe behind one interface so an app picks the best ramp per country. _Good: one API, multiple anchors, live quotes._
- **LATAM stablecoin dev kit:** a plug-and-play kit for a regional stablecoin (BRL, MXN) that plugs into x402/MPP. _Good: drop-in kit plus sample app._
- **Cross-border remittance demo:** a PT/ES-localized remittance flow on a regional stablecoin. _Good: working corridor demo._

## What this SDK delivers for these tracks

### For the Stablebonds sub-lane

The yield asset **is** the ramp asset. Deposit BRL via PIX and land directly in
TESOURO/CETES/USTRY — the Stablebond is just a `cryptoAsset` parameter of
onramp/offramp, so funds start earning from the moment they hit the wallet, with
no USDC hop in between (ADR-015). The same SDK that on-ramps also liquidates
just-in-time: offramp redeems the Stablebond back to BRL on a single key.
That is the engine behind the savings/neobank, payroll-to-yield and
yield-backed-spending flows above.

### For the LATAM on/off-ramp sub-lane

This SDK is the "Ramp UX kit" and the "Multi-anchor router" from the track:
a single `RampProvider` port with swappable adapters (Etherfuse today,
Manteca/Koywe next), PIX/SPEI in and out, and one API for
quote → order → settle. It is a drop-in package another app can import and run
in mock or live mode against the real sandbox.

## Status — 2026-08-05

| Block                           | State                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **`@stellar-ramp/sdk` package** | ✅ 89/89 tests · strict typecheck · 96% coverage (gate: 90% lines)                                                                  |
| **Onramp (PIX → TESOURO)**      | ✅ validated live, end-to-end, via this SDK — real balance confirmed on Horizon                                                     |
| **Offramp (TESOURO → BRL)**     | ⚠️ crypto burn confirmed on-chain; final order status occasionally sticks at `"funded"` in sandbox (see `Workflow-Manual-teste.md`) |

## Quick start

```ts
import {
  createRamp,
  createEtherfuseProvider,
  createEnvSecretProvider,
  createEmbeddedWalletSigner,
  generateEmbeddedWalletKeyPair,
  InMemoryIdentityStore,
} from "@stellar-ramp/sdk";

const etherfuse = createEtherfuseProvider({
  baseUrl: "https://api.sand.etherfuse.com",
  environment: "sandbox",
  countries: ["BR"],
  secrets: createEnvSecretProvider(),
});
const ramp = createRamp({
  mode: "live",
  providers: [etherfuse],
  identityStore: new InMemoryIdentityStore(),
});

// 1× — generate the embedded-wallet key and provision it
const { publicKeyPem, privateKeyPem } = generateEmbeddedWalletKeyPair();
const wallet = await ramp.provisionWallet("etherfuse", publicKeyPem);
const signer = createEmbeddedWalletSigner(privateKeyPem); // store privateKeyPem securely

// deposit: PIX → TESOURO
const quote = await ramp.quote({
  direction: "onramp",
  country: "BR",
  fiat: "BRL",
  fiatAmount: "100",
  cryptoAsset:
    "TESOURO:GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4",
  pubkey: wallet.publicKey,
  walletAddress: wallet.publicKey,
});
const order = await ramp.onramp({
  quote,
  pubkey: wallet.publicKey,
  walletAddress: wallet.publicKey,
  cryptoWalletId: wallet.walletId,
});
// (sandbox) await etherfuse.simulateFiatDeposit(order.id);
const settled = await ramp.settleEmbeddedOrder(order.id, signer); // poll → sign → submit → poll
```

### Mock mode (offline, deterministic)

```ts
import {
  createRamp,
  MockProvider,
  InMemoryIdentityStore,
} from "@stellar-ramp/sdk";

const ramp = createRamp({
  mode: "mock",
  providers: [new MockProvider()],
  identityStore: new InMemoryIdentityStore(),
});
```

## How the ramp works

```text
PIX (BRL) → [ramp.onramp, cryptoAsset="TESOURO:..."] → embedded wallet receives TESOURO
TESOURO → [ramp.offramp, cryptoAsset="TESOURO:..."] → BRL to bank account
```

There is no self-custodied wallet and no USDC↔Stablebond swap on the main path —
the asset (TESOURO, CETES, USTRY, or USDC) is just a `cryptoAsset` parameter of
onramp/offramp. The signing model is a single **P-256** key your application
generates and keeps — Etherfuse proposes the transaction, you approve by signing.

## Documentation

- **Live docs site (primary)** — [https://stellar-ramp-sdk.vercel.app/](https://stellar-ramp-sdk.vercel.app/): quickstart, architecture, API reference and production notes.
- **`SDK-implementation.md`** — integration guide for another application (contracts, full flow, known limitations).
- **`Workflow-Manual-teste.md`** — how to run `pnpm flow` and validate the real flow against the sandbox.
- **`AGENTS.md`** — onboarding for AI agents (architecture, gotchas, conventions).
- **`docs/adr/`** — architecture decision records, incl. ADR-015 (the move to embedded wallet).
- **`plan-refactor.md`** — migration log from the previous design (two tracks/USDC/swap) to the current one.

## Repository layout

```
packages/sdk/             # The single package — router, RampService, mock|etherfuse|memory|stellar adapters
examples/pix-tesouro-brl.ts  # Single example, runs against the real sandbox (onramp + offramp)
apps/site/                # Docs site source (Next.js) — deployed at https://stellar-ramp-sdk.vercel.app/
specs/features/           # Gherkin specs (pt)
docs/adr/                 # ADRs (001–002/004–008/012–013 valid; 003/009–011/014 superseded by 015)
```

## Commands

```bash
pnpm install
pnpm test                 # 89/89
pnpm test -- --coverage    # coverage (gate: lines 90%, functions 88%, branch 78%)
pnpm typecheck             # tsc strict (src + tests)
pnpm build:publish         # tsup (ESM + dts), publishable npm artifact
pnpm flow -- 10            # runs examples/pix-tesouro-brl.ts against the real sandbox (R$10)
```

## Known limitations & next steps

- [ ] Confirm why the offramp order sometimes sticks at `"funded"` even with the burn confirmed on-chain (see `Workflow-Manual-teste.md`)
- [ ] Multi-tenant: only one embedded wallet per API key today (the "root customer") — see `SDK-implementation.md` §Limitations
- [ ] Publish to npm (needs `NPM_TOKEN`)
- [ ] Etherfuse Brazil not in production yet (sandbox only) — real production today is Mexico only

## Design decisions (summary)

- **ADR-015** — Embedded wallet + P-256 approval replaces self-custodied wallet + swap. Generic asset (`cryptoAsset`), no fixed USDC.
- **ADR-002** — `RampProvider` as a port → swappable provider, multi-anchor router.
- **ADR-004** — Mock mode as a first-class citizen → same contract as live, offline, deterministic.
- **ADR-005** — 1× identity per user → avoids "Bank account not found".
- **ADR-007** — Keys server-side only.
- **ADR-013** — Bank accounts per country (PIX/SPEI).
