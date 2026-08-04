
import { createStellarRamp } from "../packages/sdk/src/index";
import { createStellarYield } from "../packages/yield/src/index";

async function main(): Promise<void> {

  const ramp = createStellarRamp({ mode: "mock" });
  const engine = createStellarYield({ mode: "mock" });

  const quote = await ramp.quote({
    direction: "onramp",
    country: "BR",
    fiat: "BRL",
    fiatAmount: "100",
  });
  console.log("quote     →", JSON.stringify(quote, null, 2));

  const on = await ramp.onramp({ quote, pubkey: "G-ALICE" });
  console.log("onramp    →", on.status, "|", on.id);

  const pos = await engine.autoPark({
    usdcAmount: quote.usdcAmount,
    country: "BR",
  });
  console.log("autoPark  →", pos.code, "|", pos.tokens, "tokens");

  const bal = await engine.balance();
  console.log("balance   →", JSON.stringify(bal, null, 2));

  const spent = await engine.liquidate({ code: "TESOURO", usdcAmount: "10" });
  console.log("liquidate →", spent, "USDC");

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
