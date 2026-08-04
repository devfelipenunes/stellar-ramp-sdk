/**
 * Demo CLI — walks the full SDK flow end-to-end in mock mode.
 *
 *   bun apps/demo/run.ts
 *
 * Flow (ADR-003): quote → onramp (fiat→USDC) → autoPark (USDC→TESOURO) →
 * balance → liquidate JIT (spend) → offramp (USDC→fiat).
 */
import {
  createRamp,
  InMemoryIdentityStore,
} from "../../packages/sdk/src/index";
import {
  createYieldEngine,
  MockStablebondProvider,
} from "../../packages/yield/src/index";

const ALLOCATION: Record<string, string> = {
  BR: "TESOURO",
  MX: "CETES",
  US: "USTRY",
};
const DEMO_PUBKEY = "G-DEMO-USER";
const USDC_ASSET =
  "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const ramp = createRamp({
  mode: "mock",
  providers: [],
  identityStore: new InMemoryIdentityStore(),
});
const bonds = new MockStablebondProvider();
const yields = createYieldEngine({
  mode: "mock",
  provider: bonds,
  allocation: ALLOCATION,
});

const step = (n: string, title: string, obj: unknown) => {
  console.log(`\n━━━ ${n} ━━━ ${title}`);
  console.log(JSON.stringify(obj, null, 2));
};

// 1. quote
const quote = await ramp.quote({
  direction: "onramp",
  country: "BR",
  fiat: "BRL",
  fiatAmount: "100",
  pubkey: DEMO_PUBKEY,
});
step("1", "QUOTE  —  BRL 100 → USDC", {
  providerId: quote.providerId,
  quoteId: quote.quoteId,
  usdcAmount: quote.usdcAmount,
  feeBps: quote.feeBps,
  fee: quote.fee,
});

// 2. onramp
const order = await ramp.onramp({ quote, pubkey: DEMO_PUBKEY });
step("2", "ONRAMP  —  fiat → USDC (order)", {
  orderId: order.id,
  status: order.status,
  usdcAmount: order.usdcAmount,
});

// 3. autoPark
const position = await yields.autoPark({
  usdcAmount: quote.usdcAmount,
  country: "BR",
});
step("3", "AUTO-PARK  —  USDC → TESOURO (yield)", position);

// 4. balance
step("4", "BALANCE", await yields.balance());

// 5. liquidate JIT
const liquidated = await yields.liquidate({
  code: "TESOURO",
  usdcAmount: "10",
});
step("5", "LIQUIDATE JIT  —  TESOURO → USDC (spend)", {
  liquidatedUsdc: liquidated,
});

// 6. offramp
const qOut = await ramp.quote({
  direction: "offramp",
  country: "BR",
  fiat: "BRL",
  usdcAmount: liquidated,
  pubkey: DEMO_PUBKEY,
});
const out = await ramp.offramp({
  quote: qOut,
  pubkey: DEMO_PUBKEY,
  usdcAsset: USDC_ASSET,
});
step("6", "OFFRAMP  —  USDC → BRL (order)", {
  orderId: out.id,
  status: out.status,
  fiatAmount: out.fiatAmount,
});

console.log("\n✅ Demo done — SDK (Ramp + Yield) works end-to-end");
