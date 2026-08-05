# Developer Guide — stellar-ramp-sdk

Yield-bearing ramp SDK for Stellar: regional fiat ↔ USDC (multi-provider) + auto-park into Etherfuse Stablebonds.

## Quickstart (mock — offline, deterministic)

```bash
pnpm install
bun examples/basic.ts
```

```ts
import { createStellarRamp } from "@stellar-ramp/sdk";
import { createStellarYield } from "@stellar-ramp/yield";

const ramp = createStellarRamp({ mode: "mock" });
const engine = createStellarYield({ mode: "mock" });

const q = await ramp.quote({
  direction: "onramp",
  country: "BR",
  fiat: "BRL",
  fiatAmount: "100",
});
await ramp.onramp({ quote: q, pubkey: "G-ALICE" });
const pos = await engine.autoPark({ usdcAmount: q.usdcAmount, country: "BR" });
await engine.balance();
await engine.liquidate({ code: "TESOURO", usdcAmount: "20" });
```

## Track Ramp — `@stellar-ramp/sdk`

### `createStellarRamp(opts)` → `RampService`

High-level factory (wires provider + identity store + secrets).

```ts
// mock
const ramp = createStellarRamp({ mode: "mock" });

// live (Etherfuse), key from process.env.ETHERFUSE_API_KEY
const ramp = createStellarRamp({
  mode: "live",
  etherfuse: { environment: "sandbox" },
});
// inline key (tests/CI): etherfuse: { environment, apiKey: "..." }
```

`StellarRampEtherfuseOptions`: `environment` (`"sandbox"|"prod"`), `countries?` (default `["BR","MX","US"]`), `accountType?`, `usdcAsset?`, `blockchain?`, `customerEmail?`, `apiKey?`, `apiKeyEnv?` (default `"ETHERFUSE_API_KEY"`).

### `RampService` methods

| Method            | Signature                                                                                              | Notes                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `quote`           | `quote(req: QuoteRequest): Promise<Quote>`                                                             | With `pubkey` it ensures the org (customerId). Live requires `pubkey`. |
| `onramp`          | `onramp({ quote, pubkey, bankAccount?, walletAddress?, cryptoWalletId? }): Promise<Order>`             | fiat → USDC. Fresh quote internally (2-pass).                          |
| `offramp`         | `offramp({ quote, pubkey, usdcAsset, bankAccount?, walletAddress?, cryptoWalletId? }): Promise<Order>` | USDC → fiat. Requires balance guard (StellarWallet) or burn.           |
| `getOrder`        | `getOrder(orderId): Promise<Order>`                                                                    | Status/tracking.                                                       |
| `provisionWallet` | `provisionWallet(providerId): Promise<{ walletId, publicKey }>`                                        | Embedded (provider-hosted) Stellar wallet.                             |

`QuoteRequest`: `direction`, `country`, `fiat`, `fiatAmount?` (onramp), `usdcAmount?` (offramp), `pubkey?`, `walletAddress?`, `customerId?`.

### Other SDK exports

- `createEtherfuseProvider(opts)` — low-level provider (baseUrl, environment, countries, secrets, accountType…).
- `createEnvSecretProvider()` — `SecretProvider` reading `process.env`.
- `createLiveStellarWallet({ horizonUrl? })` — real `StellarWallet` (getUsdcBalance via Horizon).
- `InMemoryIdentityStore` / `SqliteIdentityStore` — identity persistence (SQLite needs Node 22).
- `createIdvLaunch(opts)` / `buildIdvLaunchHtml(launch)` — WebSDK `/idv` link (JWT signing).
- `err` / `RampError` — typed errors with `code`.

## Track Yield — `@stellar-ramp/yield`

### `createStellarYield(opts)` → `YieldEngine`

```ts
const engine = createStellarYield({ mode: "mock" });
const engine = createStellarYield({
  mode: "live",
  provider: etherfuseStablebondProvider,
  allocation: { BR: "TESOURO", MX: "CETES", US: "USTRY" },
});
```

### `YieldEngine` methods

| Method      | Signature                                                  | Notes                                               |
| ----------- | ---------------------------------------------------------- | --------------------------------------------------- |
| `quote`     | `quote(code, usdcAmount): Promise<BondQuote>`              | USDC → stablebond at NAV.                           |
| `autoPark`  | `autoPark({ usdcAmount, country }): Promise<BondPosition>` | Moves USDC into the country's stablebond (ADR-012). |
| `balance`   | `balance(): Promise<YieldBalance[]>`                       | tokens × NAV (ADR-010).                             |
| `liquidate` | `liquidate({ code, usdcAmount? }): Promise<Amount>`        | JIT spend: stablebond → USDC (ADR-011).             |

Other yield exports: `createNavOracle(sources, opts?)` (multi-source median + outlier detection), `toSep38Quote`, `createEtherfuseNavSource` (real NAV).

## Error handling

All domain errors are typed:

```ts
import { RampError } from "@stellar-ramp/sdk";

try {
  await ramp.quote({ ... });
} catch (e) {
  if (e instanceof RampError) console.error(e.code, e.details);
}
```

Codes include: `no_provider_for_country`, `quote_requires_customer`, `insufficient_balance`, `bank_account_details_invalid`, `order_not_found`, etc.

## Production flow (Etherfuse — validated on sandbox)

1. **Org**: `createCustomer` (business or personal; personal needs `userInfo.email`).
2. **KYC**: programmatic (verification, documents, questionnaire) + **WebSDK `/idv`** (email+selfie; no API). `createIdvLaunch` builds the launch JWT. Scope must be `"verification"`.
3. **Bank account**: per country (PIX/SPEI). Becomes `compliant:true` after org approval.
4. **Embedded wallet**: `ramp.provisionWallet("etherfuse")`.
5. **Quote**: with `walletAddress` = the embedded wallet's publicKey.
6. **Order**: with `cryptoWalletId` = the walletId. Sandbox: `simulateFiatDeposit` → `funded` → `completed`.

Full details, JWKS/iss registration, and sandbox tooling: `docs/production.md`.

## Testing & quality

```bash
pnpm test                # 104/104
pnpm test -- --coverage  # 92.8% (gate: lines 90, funcs 88, branch 78)
pnpm typecheck           # strict
```

Tests are SDD/TDD: each Gherkin spec (`specs/features/*.feature`) maps to a spec file that documents the contract.

## Repository conventions

- **Commit messages in English** (conventional commits).
- **No comments in code**.
- **SDD/TDD**: specs → ADRs → tests → code.
- See `AGENTS.md` for the full AI onboarding spec (architecture, gotchas, status).
