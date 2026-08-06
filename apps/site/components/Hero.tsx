"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { CoinFlow } from "./CoinFlow";

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-20">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 px-3 py-1 font-mono text-xs text-gold">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            yield-bearing ramp SDK for stellar
          </span>
          <h1 className="mt-8 font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl md:text-7xl">
            Deposit in PIX.
            <br />
            Settle in USDC.
            <br />
            <span className="text-gold">Yield in Tesouro.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg text-muted">
            One SDK that moves regional fiat onto Stellar, auto-parks it in
            real-world yield — Brazilian Tesouro, Mexican CETES, US Treasuries —
            and returns it on demand. Just-in-time.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/quickstart"
              className="rounded-xl bg-gold px-7 py-3 font-semibold text-base text-base transition hover:brightness-110"
            >
              Get started
            </Link>
            <a
              href="https://github.com/devfelipenunes/stellar-ramp-sdk"
              target="_blank"
              rel="noreferrer"
              className="glass rounded-xl px-7 py-3 font-semibold text-ink transition hover:border-gold/40"
            >
              View on GitHub
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
          className="mt-16"
        >
          <div className="gold-rule mb-10" />
          <CoinFlow />
          <div className="gold-rule mt-10" />
        </motion.div>
      </div>
    </section>
  );
}
