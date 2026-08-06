"use client";
import { motion } from "framer-motion";

const steps = [
  { glyph: "⊙", title: "Deposit", sub: "PIX · SPEI · ACH", color: "text-gold" },
  {
    glyph: "◈",
    title: "USDC",
    sub: "settled on Stellar",
    color: "text-stellar",
  },
  {
    glyph: "▤",
    title: "Auto-park",
    sub: "TESOURO · CETES · USTRY",
    color: "text-gold",
  },
  {
    glyph: "▲",
    title: "Yield",
    sub: "NAV grows per token",
    color: "text-gold",
  },
  { glyph: "↶", title: "Spend", sub: "JIT liquidation", color: "text-gold" },
];

export function FlowDiagram() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {steps.map((s, i) => (
        <div key={s.title} className="flex items-center gap-2">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.12 }}
            className="glass w-40 rounded-2xl p-4 text-center transition hover:border-gold/40"
          >
            <div className={`font-mono text-2xl ${s.color}`}>{s.glyph}</div>
            <div className="mt-2 font-display font-semibold text-ink">
              {s.title}
            </div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-wide text-muted">
              {s.sub}
            </div>
          </motion.div>
          {i < steps.length - 1 && (
            <div className="text-faint" aria-hidden="true">
              →
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
