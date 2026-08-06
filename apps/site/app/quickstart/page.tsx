import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { CodeBlock } from "@/components/CodeBlock";

const MOCK_CODE = `import { createStellarRamp } from "@stellar-ramp/sdk";
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

const pos = await engine.autoPark({
  usdcAmount: q.usdcAmount,
  country: "BR",
});

const bal = await engine.balance();
const spent = await engine.liquidate({ code: "TESOURO", usdcAmount: "20" });`;

const LIVE_CODE = `import { createStellarRamp } from "@stellar-ramp/sdk";

// key from process.env.ETHERFUSE_API_KEY
const ramp = createStellarRamp({
  mode: "live",
  etherfuse: { environment: "sandbox" },
});

const q = await ramp.quote({
  direction: "onramp",
  country: "BR",
  fiat: "BRL",
  fiatAmount: "100",
  pubkey: userPubkey,
});

await ramp.onramp({ quote: q, pubkey: userPubkey });`;

export default function QuickstartPage() {
  return (
    <>
      <PageHeader
        title="Quickstart"
        description="Get a working ramp in one line. Mock mode runs offline, deterministically — the same contract as live."
      />

      <Section className="pb-12">
        <h2 className="font-display text-2xl font-bold">
          Full flow in mock mode
        </h2>
        <p className="mt-2 mb-6 max-w-2xl text-muted">
          Deposit fiat → settle USDC → auto-park into TESOURO → watch it yield →
          liquidate on spend. Zero config.
        </p>
        <CodeBlock code={MOCK_CODE} />
      </Section>

      <Section className="pb-12">
        <h2 className="font-display text-2xl font-bold">Live with Etherfuse</h2>
        <p className="mt-2 mb-6 max-w-2xl text-muted">
          The same factories wire the real provider. The API key stays
          server-side (env), and the SDK builds the provider, identity store and
          secrets for you.
        </p>
        <CodeBlock code={LIVE_CODE} />
      </Section>

      <Section className="pb-24">
        <h2 className="font-display text-2xl font-bold">Commands</h2>
        <CodeBlock
          code={`pnpm test                 # 104/104 tests
pnpm typecheck            # strict, all packages
bun examples/basic.ts     # full mock flow
bun apps/demo/server.ts   # demo dashboard at :8787`}
        />
      </Section>
    </>
  );
}
