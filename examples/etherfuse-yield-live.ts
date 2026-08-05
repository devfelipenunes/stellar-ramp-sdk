import { createEtherfuseStablebondProvider } from "../packages/yield/src/adapters/etherfuse/etherfuse-stablebond-provider";
import { createKeypairSigner } from "../packages/yield/src/adapters/stellar/keypair-signer";
import { createYieldEngine } from "../packages/yield/src/application/yield-engine";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta ${name} no .env — ver tutorial.md`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const apiKey = requireEnv("ETHERFUSE_API_KEY");
  const customerId = requireEnv("ETHERFUSE_CUSTOMER_ID");
  const secret = requireEnv("YIELD_WALLET_SECRET");
  const webhookSecretBase64 = process.env.ETHERFUSE_WEBHOOK_SECRET;
  const baseUrl = process.env.ETHERFUSE_BASE_URL ?? "https://api.sand.etherfuse.com";
  const horizonUrl = process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";

  const signer = createKeypairSigner(secret);
  console.log("wallet →", signer.publicKey);

  const provider = createEtherfuseStablebondProvider({
    baseUrl,
    secrets: { get: async (key) => (key === "ETHERFUSE_API_KEY" ? apiKey : undefined) },
    customerId,
    signer,
    horizonUrl,
    webhookSecretBase64,
  });

  const engine = createYieldEngine({
    mode: "live",
    provider,
    allocation: { BR: "TESOURO", MX: "CETES", US: "USTRY" },
  });

  console.log(
    "\nsaldo TESOURO na Stellar agora →",
    await provider.balanceOf(signer.publicKey, "TESOURO"),
  );

  if (process.argv.includes("--balance")) return;

  const amount = process.argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? "10";

  if (process.argv.includes("--liquidate")) {
    const bondQuote = await provider.quote("TESOURO", amount);
    console.log(`\nliquidate — pedindo swap real ${bondQuote.tokens} TESOURO -> ~${amount} USDC...`);
    const usdcBack = await provider.swapBondToUsdc(bondQuote.tokens, "TESOURO");
    console.log("swap aceito, USDC estimado de volta:", usdcBack);
    console.log(
      "\no swap é assíncrono: espere ~10-15s e confira com `pnpm example:live -- --balance`.",
    );
    return;
  }

  console.log("\nNAV real do TESOURO (GET /lookup/stablebonds) →", await engine.quote("TESOURO", "1"));
  console.log(`\nautoPark — pedindo swap real ${amount} USDC -> TESOURO...`);
  const position = await engine.autoPark({ usdcAmount: amount, country: "BR" });
  console.log("swap aceito, aguardando o webhook confirmar →", position);
  console.log(
    "\no swap é assíncrono: rode o webhook receiver (tutorial.md passo 5) e espere ~10s.",
  );
  console.log("Depois, confira: pnpm example:live -- --balance");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
