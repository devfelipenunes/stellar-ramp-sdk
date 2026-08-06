export function TrackCard({
  title,
  tagline,
  points,
  accent,
}: {
  title: string;
  tagline: string;
  points: string[];
  accent?: boolean;
}) {
  return (
    <div className={`glass rounded-3xl p-8 ${accent ? "border-gold/40" : ""}`}>
      <h3 className="font-display text-2xl font-bold text-ink">{title}</h3>
      <p className="mt-1 font-mono text-xs uppercase tracking-wide text-gold">
        {tagline}
      </p>
      <ul className="mt-6 space-y-3">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-ink/90">
            <span className="mt-0.5 text-gold">✓</span>
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
