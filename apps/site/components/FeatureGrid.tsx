"use client";

const features = [
  {
    glyph: "▲",
    title: "NAV per token",
    desc: "Yield appears as growing NAV — not rebase. balance() = tokens × NAV.",
  },
  {
    glyph: "↶",
    title: "Just-in-time liquidation",
    desc: "100% auto-park, 0 buffer. Liquidate on spend, instantly.",
  },
  {
    glyph: "◎",
    title: "Multi-source oracle",
    desc: "Robust median across sources with outlier detection — the Blend exploit mitigated.",
  },
  {
    glyph: "▦",
    title: "Mock is first-class",
    desc: "Deterministic offline mode, same contract as live. Perfect for CI.",
  },
  {
    glyph: "◈",
    title: "Embedded wallets",
    desc: "Provider-hosted Stellar wallets. No key custody on your side.",
  },
  {
    glyph: "✎",
    title: "Typed errors",
    desc: "RampError with machine-readable codes — handle failures programmatically.",
  },
];

function FeatureCard({
  title,
  desc,
  glyph,
}: {
  title: string;
  desc: string;
  glyph: string;
}) {
  return (
    <div
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      className="spotlight-card glass rounded-2xl p-6 transition hover:border-gold/40"
    >
      <div className="font-mono text-2xl text-gold">{glyph}</div>
      <h3 className="mt-3 font-display font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-muted">{desc}</p>
    </div>
  );
}

export function FeatureGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((f) => (
        <FeatureCard key={f.title} {...f} />
      ))}
    </div>
  );
}
