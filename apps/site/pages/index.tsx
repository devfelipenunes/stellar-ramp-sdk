import Link from "next/link";
import { Hero } from "@/components/Hero";
import { NavTicker } from "@/components/NavTicker";
import { Section } from "@/components/Section";
import { FlowDiagram } from "@/components/FlowDiagram";
import { TrackCard } from "@/components/TrackCard";
import { FeatureGrid } from "@/components/FeatureGrid";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Section className="pb-24">
        <NavTicker />
      </Section>

      <Section className="pb-24">
        <h2 className="font-display text-3xl font-bold tracking-tight">
          How it works
        </h2>
        <p className="mt-2 mb-10 max-w-xl text-muted">
          A single pipeline: deposit regional fiat, settle in USDC, and let the
          money work while you don&apos;t.
        </p>
        <FlowDiagram />
      </Section>

      <Section className="pb-24">
        <h2 className="font-display text-3xl font-bold tracking-tight">
          Two tracks, one USDC
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <TrackCard
            title="Track Ramp"
            tagline="fiat ⇄ USDC · multi-provider"
            points={[
              "PIX (BR), SPEI (MX), ACH (US) as on/off-ramps",
              "Router picks the lowest-cost provider per country",
              "Validated end-to-end against the real Etherfuse API",
            ]}
          />
          <TrackCard
            title="Track Yield"
            tagline="USDC → stablebonds · NAV yield"
            accent
            points={[
              "Auto-park into TESOURO (BR), CETES (MX), USTRY (US)",
              "balance() = tokens × NAV — yield, not rebase",
              "Just-in-time liquidation on spend (JIT)",
            ]}
          />
        </div>
      </Section>

      <Section className="pb-24">
        <h2 className="font-display text-3xl font-bold tracking-tight">
          Built for the real world
        </h2>
        <div className="mt-8">
          <FeatureGrid />
        </div>
      </Section>

      <Section className="pb-28 text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight">
          Ready to build?
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-muted">
          A working ramp in one line — offline mock included, no keys required.
        </p>
        <Link
          href="/quickstart"
          className="mt-8 inline-block rounded-xl bg-gold px-8 py-3 font-semibold text-base transition hover:brightness-110"
        >
          Start the quickstart
        </Link>
      </Section>
    </>
  );
}
