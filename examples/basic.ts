/**
 * Exemplo mínimo do SDK — a prova "works in a second app" (spec mock-mode).
 * Modo mock: roda offline, determinístico, sem keys/rede.
 *
 *   bun examples/basic.ts    (ou: npx tsx examples/basic.ts)
 */
import { createRamp, InMemoryIdentityStore } from "../packages/sdk/src/index";

async function main(): Promise<void> {
  // Em modo "mock" o SDK ignora providers reais e usa um MockProvider
  // determinístico com taxas realistas (ADR-004).
  const ramp = createRamp({
    mode: "mock",
    providers: [],
    identityStore: new InMemoryIdentityStore(),
  });

  // 1) Cotação BRL→USDC (rota BR)
  const quote = await ramp.quote({
    direction: "onramp",
    country: "BR",
    fiat: "BRL",
    fiatAmount: "100",
  });
  console.log("quote     →", JSON.stringify(quote, null, 2));

  // 2) On-ramp: USDC entregue na carteira do usuário
  const on = await ramp.onramp({ quote, pubkey: "G-ALICE" });
  console.log("onramp    →", on.status, "|", on.id);

  // 3) Status da ordem
  const st = await ramp.getOrder(on.id);
  console.log("status    →", st.status);

  // 4) Off-ramp: USDC→MXN, com burn solicitado
  const qOut = await ramp.quote({
    direction: "offramp",
    country: "MX",
    fiat: "MXN",
    usdcAmount: "200",
  });
  const out = await ramp.offramp({
    quote: qOut,
    pubkey: "G-ALICE",
    usdcAsset: "USDC:ISSUER",
  });
  console.log(
    "offramp   →",
    out.status,
    "| burn?",
    Boolean(out.burnTransaction),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
