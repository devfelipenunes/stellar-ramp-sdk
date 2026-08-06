import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { CodeBlock } from "@/components/CodeBlock";

const WALLET_CODE = `const wallet = await ramp.provisionWallet("etherfuse");

const q = await ramp.quote({
  direction: "onramp",
  country: "BR",
  fiat: "BRL",
  fiatAmount: "100",
  pubkey: userPubkey,
  walletAddress: wallet.publicKey,
});

const order = await ramp.onramp({
  quote: q,
  pubkey: userPubkey,
  walletAddress: wallet.publicKey,
  cryptoWalletId: wallet.walletId,
  bankAccount: pixAccount,
});`;

const steps = [
  "Org + bank — customerId 1× per user, bank per country (PIX/SPEI)",
  "KYC — programmatic (documents, questionnaire) + WebSDK /idv (email + selfie)",
  "Compliant — webhook kyc_updated → bank becomes compliant",
  "Embedded wallet — provider-hosted (P-256); no key custody",
  "Quote with walletAddress → order with cryptoWalletId",
  "Sandbox: simulate fiat deposit → funded → completed",
];

export default function ProductionPage() {
  return (
    <>
      <PageHeader
        title="Production"
        description="The validated live flow — everything below was proven against the real Etherfuse sandbox."
      />

      <Section className="pb-12">
        <h2 className="font-display text-2xl font-bold">The live flow</h2>
        <ol className="mt-6 space-y-4">
          {steps.map((s, i) => (
            <li key={s} className="flex items-start gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/40 font-mono text-sm text-gold">
                {i + 1}
              </span>
              <span className="pt-1.5 text-ink/90">{s}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section className="pb-12">
        <h2 className="font-display text-2xl font-bold">
          Embedded wallet flow
        </h2>
        <p className="mt-2 mb-6 max-w-2xl text-muted">
          Orders require a provider-hosted wallet — a plain funded account is
          rejected. The SDK provisions it and wires walletAddress +
          cryptoWalletId.
        </p>
        <CodeBlock code={WALLET_CODE} />
      </Section>

      <Section className="pb-12">
        <h2 className="font-display text-2xl font-bold">Partner JWT (1×)</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-wide text-faint">
              Issuer URL (iss)
            </div>
            <div className="mt-2 break-all font-mono text-sm text-ink">
              https://gist.github.com/devfelipenunes
            </div>
          </div>
          <div className="glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-wide text-faint">
              JWKS URL
            </div>
            <div className="mt-2 break-all font-mono text-sm text-ink">
              https://devfelipenunes.github.io/jwks/jwks.json
            </div>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm text-muted">
          iss and the JWKS URL are registered separately with Etherfuse. The
          JWKS must serve application/json — that&apos;s why the gist raw
          (text/plain) was rejected.
        </p>
      </Section>

      <Section className="pb-24">
        <h2 className="font-display text-2xl font-bold">
          Deployment checklist
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            "Register iss + JWKS (sandbox AND prod)",
            "Serve the app's JWKS over HTTPS as JSON",
            "Wire WebSDK /idv into the app UI",
            "Persist identities (SQLite / SQLite / Redis)",
            "Provide a StellarWallet impl (burn signing)",
            "Handle the kyc_updated webhook",
            "Publish @stellar-ramp/sdk + @stellar-ramp/yield",
          ].map((c) => (
            <div
              key={c}
              className="flex items-start gap-2 rounded-xl glass px-4 py-3 text-sm text-ink/90"
            >
              <span className="mt-0.5 text-gold">✓</span>
              {c}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
