export type NavEntry = { code: string; nav: string; fiat?: string };

export const FALLBACK_NAV: NavEntry[] = [
  { code: "TESOURO", nav: "1.2375", fiat: "BRL" },
  { code: "CETES", nav: "1.1747", fiat: "MXN" },
  { code: "USTRY", nav: "1.0712", fiat: "USD" },
];

export async function getNavs(): Promise<NavEntry[]> {
  try {
    const res = await fetch("https://api.etherfuse.com/lookup/stablebonds");
    if (!res.ok) return FALLBACK_NAV;
    const data = await res.json();
    const bonds = Array.isArray(data) ? data : data?.stablebonds;
    if (!Array.isArray(bonds)) return FALLBACK_NAV;
    const wanted = new Set(["TESOURO", "CETES", "USTRY"]);
    const found = bonds
      .map((b: Record<string, unknown>) => ({
        code: String(b.symbol ?? b.code ?? b.ticker ?? "").toUpperCase(),
        nav: String(b.tokenPriceDecimal ?? b.nav ?? b.navRate ?? ""),
        fiat: b.bondCurrency ? String(b.bondCurrency) : undefined,
      }))
      .filter((b) => wanted.has(b.code) && b.nav);
    return found.length >= 2 ? found : FALLBACK_NAV;
  } catch {
    return FALLBACK_NAV;
  }
}
