import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { CodeBlock } from "@/components/CodeBlock";

const rampMethods = [
  [
    "quote",
    "quote(req: QuoteRequest): Promise<Quote>",
    "Cites fiat ⇄ USDC. Live requires pubkey.",
  ],
  [
    "onramp",
    "onramp({ quote, pubkey, bankAccount? }): Promise<Order>",
    "fiat → USDC (fresh 2-pass quote).",
  ],
  [
    "offramp",
    "offramp({ quote, pubkey, usdcAsset, bankAccount? }): Promise<Order>",
    "USDC → fiat.",
  ],
  ["getOrder", "getOrder(orderId): Promise<Order>", "Status / tracking."],
  [
    "provisionWallet",
    "provisionWallet(providerId): Promise<{ walletId, publicKey }>",
    "Embedded Stellar wallet.",
  ],
];

const yieldMethods = [
  [
    "quote",
    "quote(code, usdcAmount): Promise<BondQuote>",
    "USDC → stablebond at NAV.",
  ],
  [
    "autoPark",
    "autoPark({ usdcAmount, country }): Promise<BondPosition>",
    "Allocates by country (ADR-012).",
  ],
  [
    "balance",
    "balance(): Promise<YieldBalance[]>",
    "tokens × NAV — yield, not rebase.",
  ],
  [
    "liquidate",
    "liquidate({ code, usdcAmount? }): Promise<Amount>",
    "JIT spend: stablebond → USDC.",
  ],
];

const errorCodes = [
  ["no_provider_for_country", "No provider covers that country."],
  ["quote_requires_customer", "Live quote needs a pubkey/org."],
  ["insufficient_balance", "Offramp balance guard failed."],
  ["bank_account_details_invalid", "PIX/SPEI details failed validation."],
  ["order_not_found", "Unknown order id."],
];

function MethodTable({ rows }: { rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-edge bg-surface">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-edge text-muted">
            <th className="px-5 py-3 font-medium">Method</th>
            <th className="px-5 py-3 font-medium">Signature</th>
            <th className="px-5 py-3 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, sig, notes]) => (
            <tr key={name} className="border-b border-edge/50 last:border-0">
              <td className="px-5 py-3 font-mono text-gold">{name}</td>
              <td className="px-5 py-3 font-mono text-xs text-ink/90">{sig}</td>
              <td className="px-5 py-3 text-muted">{notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ApiReferencePage() {
  return (
    <>
      <PageHeader
        title="API reference"
        description="The full public surface of @stellar-ramp/sdk and @stellar-ramp/yield."
      />

      <Section className="pb-12">
        <h2 className="font-display text-2xl font-bold">Factories</h2>
        <CodeBlock
          code={`import { createStellarRamp, createEnvSecretProvider, createLiveStellarWallet } from "@stellar-ramp/sdk";
import { createStellarYield, createNavOracle } from "@stellar-ramp/yield";

createStellarRamp({ mode: "mock" })                       // 1-line, offline
createStellarRamp({ mode: "live", etherfuse: { environment: "sandbox" } })
createStellarYield({ mode: "mock" })                      // 1-line, offline`}
        />
      </Section>

      <Section className="pb-12">
        <h2 className="mb-6 font-display text-2xl font-bold">RampService</h2>
        <MethodTable rows={rampMethods} />
      </Section>

      <Section className="pb-12">
        <h2 className="mb-6 font-display text-2xl font-bold">YieldEngine</h2>
        <MethodTable rows={yieldMethods} />
      </Section>

      <Section className="pb-12">
        <h2 className="mb-6 font-display text-2xl font-bold">Typed errors</h2>
        <p className="mb-6 max-w-2xl text-muted">
          All domain errors carry a machine-readable code — handle failures
          programmatically.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {errorCodes.map(([code, desc]) => (
            <div key={code} className="glass rounded-xl p-4">
              <div className="font-mono text-sm text-gold">{code}</div>
              <div className="mt-1 text-xs text-muted">{desc}</div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
