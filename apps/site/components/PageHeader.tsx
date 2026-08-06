import { GradientMesh } from "./GradientMesh";

export function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="relative overflow-hidden">
      <GradientMesh />
      <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-28">
        <span className="font-mono text-xs uppercase tracking-widest text-gold">
          stellar-ramp · docs
        </span>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">{description}</p>
        <div className="gold-rule mt-10 max-w-3xl" />
      </div>
    </div>
  );
}
