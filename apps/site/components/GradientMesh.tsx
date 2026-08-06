export function GradientMesh() {
  return (
    <div className="mesh" aria-hidden="true">
      <div className="mesh-blob animate-drift left-[8%] top-[-12%] h-[42vw] w-[42vw] bg-gold/10" />
      <div className="mesh-blob animate-pulse-slow right-[4%] top-[18%] h-[36vw] w-[36vw] bg-stellar/10" />
      <div className="mesh-blob animate-drift bottom-[-16%] left-[34%] h-[30vw] w-[30vw] bg-gold/5" />
    </div>
  );
}
