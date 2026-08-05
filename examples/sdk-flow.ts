import { createEtherfuseProvider } from "../packages/sdk/src/index";
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBalances(horizonUrl: string, pubkey: string): Promise<Record<string, string>> {
  const res = await fetch(`${horizonUrl}/accounts/${pubkey}`);
  if (res.status === 404) return {};
  if (!res.ok) throw new Error(`horizon ${res.status}`);
  const account = (await res.json()) as {
    balances?: { asset_type: string; asset_code?: string; balance: string }[];
  };
  const out: Record<string, string> = {};
  for (const b of account.balances ?? []) {
    out[b.asset_type === "native" ? "XLM" : (b.asset_code ?? "?")] = b.balance;
  }
  return out;
}

function printBalances(label: string, balances: Record<string, string>): void {
  console.log(`\n${label}`);
  for (const [code, balance] of Object.entries(balances)) console.log(`  ${code.padEnd(8)} ${balance}`);
}

function round7(n: number): string {
  return n.toFixed(7);
}

async function waitForBalanceChange(
  horizonUrl: string,
  pubkey: string,
  assetCode: string,
  previous: string,
  timeoutMs = 90_000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(4_000);
    const balances = await fetchBalances(horizonUrl, pubkey);
    const current = balances[assetCode] ?? "0";
    if (current !== previous) return current;
  }
  throw new Error(
    `saldo de ${assetCode} não mudou em ${timeoutMs / 1000}s (era ${previous}) — o webhook assíncrono ` +
      `da Etherfuse atrasou ou a transação falhou (ex.: sequence number colidindo com outra em voo). ` +
      `Confira https://stellar.expert/explorer/testnet/account/${pubkey} antes de repetir.`,
  );
}

async function main(): Promise<void> {
  const apiKey = requireEnv("ETHERFUSE_API_KEY");
  const customerId = requireEnv("ETHERFUSE_CUSTOMER_ID");
  const secret = requireEnv("YIELD_WALLET_SECRET");
  const webhookSecretBase64 = process.env.ETHERFUSE_WEBHOOK_SECRET;
  const baseUrl = process.env.ETHERFUSE_BASE_URL ?? "https://api.sand.etherfuse.com";
  const horizonUrl = process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";

  const signer = createKeypairSigner(secret);
  console.log("wallet única (PIX -> USDC -> TESOURO -> USDC, tudo aqui) →", signer.publicKey);

  printBalances("Saldo ANTES", await fetchBalances(horizonUrl, signer.publicKey));

  const secrets = { get: async (key: string) => (key === "ETHERFUSE_API_KEY" ? apiKey : undefined) };

  const rampProvider = createEtherfuseProvider({
    baseUrl,
    environment: "sandbox",
    countries: ["BR"],
    secrets,
  });

  const bondProvider = createEtherfuseStablebondProvider({
    baseUrl,
    secrets,
    customerId,
    signer,
    horizonUrl,
    webhookSecretBase64,
  });
  const engine = createYieldEngine({
    mode: "live",
    provider: bondProvider,
    allocation: { BR: "TESOURO", MX: "CETES", US: "USTRY" },
  });

  const brlAmount = process.argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? "100";

  console.log(`\n=== 1/3 PIX (BRL) → USDC — cotação real da Etherfuse ===`);
  const quote = await rampProvider.quote({
    direction: "onramp",
    country: "BR",
    fiat: "BRL",
    fiatAmount: brlAmount,
    customerId,
    pubkey: signer.publicKey,
  });
  console.log(`R$${brlAmount} -> ${quote.usdcAmount} USDC (taxa real Etherfuse, feeBps=${quote.feeBps})`);

  const balancesNow = await fetchBalances(horizonUrl, signer.publicKey);
  const usdcNow = Number(balancesNow.USDC ?? "0");
  const usdcNeeded = Number(quote.usdcAmount);

  if (usdcNow < usdcNeeded) {
    const shortfall = round7((usdcNeeded - usdcNow) * 1.1);
    console.log(
      `\n[SIMULADO] a wallet só tem ${usdcNow} USDC — o onramp real da Etherfuse exige uma embedded ` +
        `wallet própria dela (ver docs/production.md), incompatível com manter tudo numa carteira só. ` +
        `Auto-financiando a diferença (${shortfall} USDC) liquidando um pouco do TESOURO já existente ` +
        `nesta MESMA wallet — é a mesma engrenagem real usada no passo 3, só antecipada. Esperando ` +
        `assentar antes de seguir, pra não disparar dois swaps concorrentes na mesma conta:`,
    );
    const before = balancesNow.USDC ?? "0";
    const topUpQuote = await bondProvider.quote("TESOURO", shortfall);
    await bondProvider.swapBondToUsdc(topUpQuote.tokens, "TESOURO");
    const after = await waitForBalanceChange(horizonUrl, signer.publicKey, "USDC", before);
    console.log(`USDC depois do auto-financiamento: ${after}`);
  } else {
    console.log(
      `\n[SIMULADO] a wallet já detém USDC de testnet suficiente (${usdcNow}) — usando isso como ` +
        `"PIX recebido" (em produção chegaria via settlement do onramp real).`,
    );
  }

  console.log(`\n=== 2/3 USDC → TESOURO (autoPark real, mesma wallet) ===`);
  const beforePark = (await fetchBalances(horizonUrl, signer.publicKey)).TESOURO ?? "0";
  console.log(`autoPark — pedindo swap real ${quote.usdcAmount} USDC -> TESOURO...`);
  const position = await engine.autoPark({ usdcAmount: quote.usdcAmount, country: "BR" });
  console.log("swap aceito, aguardando o webhook assentar antes de liquidar →", position);
  await waitForBalanceChange(horizonUrl, signer.publicKey, "TESOURO", beforePark);
  printBalances("Saldo depois do autoPark", await fetchBalances(horizonUrl, signer.publicKey));

  console.log(`\n=== 3/3 TESOURO → USDC (liquidate real, mesma wallet) ===`);
  const beforeLiquidate = (await fetchBalances(horizonUrl, signer.publicKey)).USDC ?? "0";
  const usdcBack = await engine.liquidate({ code: "TESOURO" });
  console.log("liquidate aceito, USDC estimado de volta:", usdcBack);
  await waitForBalanceChange(horizonUrl, signer.publicKey, "USDC", beforeLiquidate);

  printBalances("Saldo FINAL", await fetchBalances(horizonUrl, signer.publicKey));

  console.log(`\nUma única wallet do início ao fim →`);
  console.log(`  https://stellar.expert/explorer/testnet/account/${signer.publicKey}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
