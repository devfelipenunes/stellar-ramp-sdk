# Production Guide — Etherfuse live flow

Everything below was **validated against the real Etherfuse sandbox** (04–05/08/2026):
org, KYC, PIX bank account, embedded wallet, onramp order → `completed`, and offramp order.

## 1. Partner JWT registration (1×)

| Field                  | Value                                             |
| ---------------------- | ------------------------------------------------- |
| **Issuer URL** (`iss`) | `https://gist.github.com/devfelipenunes`          |
| **JWKS URL**           | `https://devfelipenunes.github.io/jwks/jwks.json` |

- `iss` and JWKS URL are registered **separately** with Etherfuse (Partner JWT config).
- JWKS must serve **`application/json`** (GitHub Pages host; gist raw serves `text/plain` and is rejected).
- `kid` = `5ab266e5-0287-460a-98c6-8dda93a1cac9`; private key stays server-side (`secrets/etherfuse/jwtRS256.key`, gitignored — ADR-007).

## 2. Onboarding flow

```ts
import { createStellarRamp, createIdvLaunch } from "@stellar-ramp/sdk";

const ramp = createStellarRamp({
  mode: "live",
  etherfuse: { environment: "sandbox", countries: ["BR", "MX", "US"] }, // ETHERFUSE_API_KEY
});
```

1. **Org + bank**: `ramp.onramp({ quote, pubkey, bankAccount })` creates the org (customerId, 1× per user — ADR-005) and the per-country bank account (PIX/SPEI — ADR-013).
2. **KYC programmatic**: org → verification → documents → questionnaire (all 202 async).
3. **WebSDK `/idv`** (no API): the user confirms email + selfie + agreements.
   ```ts
   const launch = createIdvLaunch({
     orgId,
     privateKey,
     issuer,
     keyId,
     email,
     name,
     environment: "sandbox",
   });
   // POST launch.form → launch.action  (or use buildIdvLaunchHtml(launch))
   ```
   - **Scope must be `"verification"`** (sandbox rejects `"idv"`).
   - Sandbox auto-approves → webhook `kyc_updated` (`approved`) → bank becomes `compliant:true`.
4. **Embedded wallet** (required — a plain funded account fails with `Wallet not found or not authorized`):
   ```ts
   const wallet = await ramp.provisionWallet("etherfuse"); // { walletId, publicKey }
   ```
5. **Quote** with `walletAddress` = `wallet.publicKey`.
6. **Order** with `cryptoWalletId` = `wallet.walletId`.
7. **Sandbox**: simulate the fiat deposit → `funded` → poll → `completed`.

## 3. Offramp

- Quote `offramp` (USDC → fiat) → order → burn (the provider returns the burn envelope; the app signs/submits via its Stellar wallet).
- Balance guard uses `StellarWallet.getUsdcBalance`.

## 4. Sandbox tooling (`scripts/`)

| Script                 | Purpose                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `confirm-sandbox.mjs`  | Full onboarding: org + KYC + `/idv` launch (variants `BR`/`MX`, real iss/kid, fresh JTI).               |
| `confirm-followup.mjs` | Post-`/idv`: bank account → embedded wallet → quote → order → fiat_received (offramp with `OFFRAMP=1`). |
| `fund-wallet.mjs`      | Generate + fund a testnet wallet + USDC trustline (for debugging).                                      |
| `gen-keys.mjs`         | Generate the RSA keypair + JWKS for `/idv` launch signing.                                              |

Raw API responses land in `/tmp/ef-confirm/`.

## 5. Environment constraints

- **PIX/BRL is sandbox-proven but NOT live** — Etherfuse production today is Mexico (MXN/SPEI). Brazil is "upcoming".
- **`SqliteIdentityStore` requires Node 22** (`node:sqlite`; not available in Bun). Use `InMemoryIdentityStore` for mock/Bun.
- **Sandbox quote cap**: 500 MXN.
- **Order idempotency**: reuse `orderId`/`quoteId` on retries to avoid duplicates.

## 6. Deployment checklist

- [ ] Register `iss` + JWKS (sandbox AND prod) with Etherfuse.
- [ ] Serve the app's JWKS over HTTPS as `application/json` (the app is the JWKS host).
- [ ] Wire the WebSDK `/idv` into the app UI (redirect the end user).
- [ ] Persist identities (`SqliteIdentityStore` or SQLite/Redis) — ADR-005.
- [ ] Provide a `StellarWallet` impl (balance guard; offramp burn signing).
- [ ] Handle the `kyc_updated` webhook → mark compliant.
- [ ] Publish `@stellar-ramp/sdk` + `@stellar-ramp/yield` (tsup build; workflow on tag `v*`).
