import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { CodeBlock } from "@/components/CodeBlock";

const REPO_LAYOUT = `packages/sdk/        # Track Ramp — hexagonal: domain / application / adapters
packages/yield/      # Track Yield — hexagonal (same layers)
apps/demo/           # HTTP server + dashboard (mock mode) + E2E
examples/basic.ts    # Minimal flow with the high-level factories
specs/features/      # Gherkin specs (contract first — SDD/TDD)
docs/adr/            # 13 ADRs (architecture decisions, 001–013)`;

const layers = [
  {
    name: "Domain",
    desc: "Pure TS — entities, ports and BigInt decimal. No framework imports. Money never uses float.",
  },
  {
    name: "Application",
    desc: "RampService / YieldEngine orchestrate via ports (interfaces) — never adapters.",
  },
  {
    name: "Adapters",
    desc: "MockProvider, EtherfuseProvider, InMemory/SQLite IdentityStore, LiveStellarWallet, NavSource.",
  },
];

export default function ArchitecturePage() {
  return (
    <>
      <PageHeader
        title="Architecture"
        description="Hexagonal, ADR-driven, spec-first. Two tracks linked by one contract: USDC."
      />

      <Section className="pb-12">
        <h2 className="font-display text-2xl font-bold">Hexagonal layers</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {layers.map((l, i) => (
            <div
              key={l.name}
              className={`glass rounded-2xl p-6 ${i === 2 ? "border-gold/40" : ""}`}
            >
              <div className="font-display font-semibold text-ink">
                {l.name}
              </div>
              <p className="mt-2 text-sm text-muted">{l.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="pb-12">
        <h2 className="font-display text-2xl font-bold">Ports (contracts)</h2>
        <p className="mt-2 mb-6 max-w-2xl text-muted">
          The SDK depends on interfaces, not implementations — every provider,
          store and chain access is swappable.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            "RampProvider — quote / orders / customer / bank",
            "IdentityStore — 1:1 per user+provider (ADR-005)",
            "SecretProvider — keys server-side (ADR-007)",
            "StellarWallet — chain access (balance guard)",
            "EmbeddedWalletProvider — provider-hosted wallets",
            "StablebondProvider / NavSource — yield + NAV",
          ].map((p) => (
            <div
              key={p}
              className="glass rounded-xl px-4 py-3 font-mono text-xs text-ink/90"
            >
              {p}
            </div>
          ))}
        </div>
      </Section>

      <Section className="pb-12">
        <h2 className="font-display text-2xl font-bold">Repo layout</h2>
        <div className="mt-6">
          <CodeBlock code={REPO_LAYOUT} />
        </div>
      </Section>

      <Section className="pb-24">
        <h2 className="font-display text-2xl font-bold">
          Decisions, documented
        </h2>
        <p className="mt-2 mb-6 max-w-2xl text-muted">
          13 ADRs record every architectural decision — from mock-as-first-class
          to NAV-based yield to per-country bank accounts.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "ADR-004 Mock is first-class",
            "ADR-005 Identities reused",
            "ADR-007 Keys server-side",
            "ADR-010 Yield = NAV per token",
            "ADR-011 Liquidation just-in-time",
            "ADR-013 Banks per country",
          ].map((a) => (
            <div
              key={a}
              className="glass rounded-xl px-4 py-3 text-sm text-ink/90"
            >
              {a}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
