export function CodeBlock({ code }: { code: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-edge bg-surface">
      <div className="flex items-center gap-1.5 border-b border-edge px-4 py-2">
        <span className="h-2 w-2 rounded-full bg-gold/70" />
        <span className="h-2 w-2 rounded-full bg-stellar/60" />
        <span className="ml-2 font-mono text-xs text-faint">stellar-ramp</span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-sm leading-relaxed text-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}
