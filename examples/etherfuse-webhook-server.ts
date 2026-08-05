import { createServer } from "node:http";
import { createEtherfuseStablebondProvider } from "../packages/yield/src/adapters/etherfuse/etherfuse-stablebond-provider";
import { createKeypairSigner } from "../packages/yield/src/adapters/stellar/keypair-signer";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta ${name} no .env — ver tutorial.md`);
    process.exit(1);
  }
  return value;
}

const apiKey = requireEnv("ETHERFUSE_API_KEY");
const customerId = requireEnv("ETHERFUSE_CUSTOMER_ID");
const secret = requireEnv("YIELD_WALLET_SECRET");
const webhookSecretBase64 = requireEnv("ETHERFUSE_WEBHOOK_SECRET");

const provider = createEtherfuseStablebondProvider({
  baseUrl: process.env.ETHERFUSE_BASE_URL ?? "https://api.sand.etherfuse.com",
  secrets: { get: async (key) => (key === "ETHERFUSE_API_KEY" ? apiKey : undefined) },
  customerId,
  signer: createKeypairSigner(secret),
  horizonUrl: process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org",
  webhookSecretBase64,
});

const port = Number(process.env.PORT ?? 8788);

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const rawBody = Buffer.concat(chunks).toString("utf-8");

  try {
    const confirmation = await provider.confirmSwapWebhook(
      rawBody,
      (req.headers["x-signature"] as string | undefined) ?? null,
    );
    console.log("swap_updated →", confirmation ?? "(sem sendTransaction ainda)");
    res.writeHead(200).end();
  } catch (e) {
    console.error("falha ao confirmar swap:", e);
    res.writeHead(401).end();
  }
}).listen(port, () => {
  console.log(`webhook receiver em http://localhost:${port}`);
  console.log(
    "exponha com ngrok e registre em POST /ramp/webhook — ver tutorial.md passo 5",
  );
});
