export function Footer() {
  return (
    <footer className="border-t border-edge py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-faint md:flex-row">
        <span>stellar-ramp — yield-bearing ramp SDK for Stellar</span>
        <span className="font-mono text-gold">
          PIX → USDC → TESOURO → yield
        </span>
        <a
          href="https://github.com/devfelipenunes/stellar-ramp-sdk"
          target="_blank"
          rel="noreferrer"
          className="transition hover:text-gold"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}
