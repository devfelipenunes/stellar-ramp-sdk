import { getNavs } from "@/lib/navs";

export async function NavTape() {
  const navs = await getNavs();
  const items = [...navs, ...navs, ...navs];

  return (
    <div className="tape border-b border-edge bg-surface/90">
      <div className="tape-track py-1.5 font-mono text-xs text-muted">
        {items.map((n, i) => (
          <span key={i} className="mx-6">
            <span className="text-gold">{n.code}</span>
            <span className="mx-1">{n.nav}</span>
            <span className="text-faint">{n.fiat}</span>
            <span className="mx-4 text-stellar">▮</span>
          </span>
        ))}
      </div>
    </div>
  );
}
