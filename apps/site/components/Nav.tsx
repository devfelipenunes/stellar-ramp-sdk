"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const links = [
  { href: "/", label: "Home" },
  { href: "/quickstart", label: "Quickstart" },
  { href: "/api-reference", label: "API" },
  { href: "/architecture", label: "Architecture" },
  { href: "/production", label: "Production" },
];

const GITHUB = "https://github.com/devfelipenunes/stellar-ramp-sdk";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <header
      ref={root}
      className={`relative transition-all ${
        scrolled ? "border-b border-edge bg-base/85 backdrop-blur-md" : ""
      }`}
    >
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4"
      >
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tight text-ink"
        >
          stellar<span className="text-gold">-ramp</span>
        </Link>
        <div className="hidden items-center gap-6 text-sm text-muted md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="transition hover:text-gold"
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-full border border-gold/40 px-4 py-1.5 text-sm text-gold transition hover:bg-gold/10 sm:inline-flex"
          >
            GitHub
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="rounded-lg p-2 text-muted transition hover:text-gold md:hidden"
          >
            {open ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3 5.5h14M3 10h14M3 14.5h14"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="border-b border-edge bg-base/95 backdrop-blur-md md:hidden"
          >
            <div className="mx-auto flex max-w-6xl flex-col px-6 py-3">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-edge/40 py-3 text-sm text-muted transition hover:text-gold last:border-0"
                >
                  {l.label}
                </Link>
              ))}
              <a
                href={GITHUB}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="py-3 text-sm text-gold"
              >
                GitHub ↗
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
