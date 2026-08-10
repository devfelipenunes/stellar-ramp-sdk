"use client";
import { useEffect, useState } from "react";
import { FALLBACK_NAV, getNavs } from "@/lib/navs";

export function NavTicker() {
  const [navs, setNavs] = useState(FALLBACK_NAV);

  useEffect(() => {
    let active = true;
    getNavs().then((n) => {
      if (active) setNavs(n);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mt-14 grid gap-3 sm:grid-cols-3">
      {navs.map((n) => (
        <div key={n.code} className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">{n.code}</span>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-gold">
            {n.nav}
          </div>
          <div className="text-xs text-faint">{n.fiat ?? "Stellar"} · live</div>
        </div>
      ))}
    </div>
  );
}
