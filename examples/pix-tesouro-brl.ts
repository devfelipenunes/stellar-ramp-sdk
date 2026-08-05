import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  createEmbeddedWalletSigner,
  createEnvSecretProvider,
  createEtherfuseProvider,
  createRamp,
  generateEmbeddedWalletKeyPair,
  InMemoryIdentityStore,
} from "../packages/sdk/src/index";

const TESOURO_ASSET =
  "TESOURO:GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4";
const HORIZON_URL = process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta ${name} no .env — ver Workflow-Manual-teste.md`);
    process.exit(1);
  }
  return value;
}

async function fetchBalance(pubkey: string, assetCode: string): Promise<string> {
  const res = await fetch(`${HORIZON_URL}/accounts/${pubkey}`);
  if (res.status === 404) return "0";
  if (!res.ok) throw new Error(`horizon ${res.status}`);
  const account = (await res.json()) as {
    balances?: { asset_code?: string; balance: string }[];
  };
  const [code] = assetCode.split(":");
  const balance = (account.balances ?? []).find((b) => b.asset_code === code);
  return balance ? balance.balance : "0";
}

async function main(): Promise<void> {
  requireEnv("ETHERFUSE_API_KEY");
  const customerId = requireEnv("ETHERFUSE_CUSTOMER_ID");
  const baseUrl = process.env.ETHERFUSE_BASE_URL ?? "https://api.sand.etherfuse.com";
  const keyPath =
    process.env.ETHERFUSE_SIGNER_PRIVATE_KEY_PATH ??
    "secrets/etherfuse/embedded-wallet-signer.pem";

  const etherfuse = createEtherfuseProvider({
    baseUrl,
    environment: "sandbox",
    countries: ["BR"],
    secrets: createEnvSecretProvider(),
  });
  const identityStore = new InMemoryIdentityStore();
  const ramp = createRamp({ mode: "live", providers: [etherfuse], identityStore });

  let walletId = process.env.ETHERFUSE_WALLET_ID;
  let walletPublicKey = process.env.ETHERFUSE_WALLET_PUBLIC_KEY;
  let privateKeyPem: string;

  if (walletId && walletPublicKey && existsSync(keyPath)) {
    privateKeyPem = readFileSync(keyPath, "utf8");
    console.log("Embedded wallet existente →", walletPublicKey);
  } else {
    console.log("\nNenhuma embedded wallet configurada — provisionando uma nova...");
    const pair = generateEmbeddedWalletKeyPair();
    const wallet = await ramp.provisionWallet("etherfuse", pair.publicKeyPem);
    walletId = wallet.walletId;
    walletPublicKey = wallet.publicKey;
    privateKeyPem = pair.privateKeyPem;

    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, privateKeyPem);

    console.log("Nova embedded wallet criada →", walletPublicKey);
    console.log("\nCole isto no seu .env antes de rodar de novo:");
    console.log(`  ETHERFUSE_WALLET_ID=${walletId}`);
    console.log(`  ETHERFUSE_WALLET_PUBLIC_KEY=${walletPublicKey}`);
    console.log(`  ETHERFUSE_SIGNER_PRIVATE_KEY_PATH=${keyPath}`);
  }

  const signer = createEmbeddedWalletSigner(privateKeyPem);
  const bankAccountId = process.env.ETHERFUSE_BANK_ACCOUNT_ID;

  await identityStore.saveIdentity({
    pubkey: walletPublicKey,
    providerId: "etherfuse",
    customerId,
    bankAccounts: bankAccountId
      ? [{ bankAccountId, providerId: "etherfuse", country: "BR", fiat: "BRL" }]
      : [],
    createdAt: new Date().toISOString(),
  });

  const pixDetails = {
    kind: "pix_personal" as const,
    firstName: "Maria",
    lastName: "Silva Souza",
    cpf: process.env.CPF ?? "52998224725",
    pixKey: process.env.EF_EMAIL ?? "maria.silva@example.com",
    pixKeyType: "EMAIL" as const,
  };

  const brlAmount = process.argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? "10";
  const onlyOnramp = process.argv.includes("--onramp-only");
  const onlyOfframp = process.argv.includes("--offramp-only");

  console.log(`\nSaldo TESOURO ANTES → ${await fetchBalance(walletPublicKey, TESOURO_ASSET)}`);

  let cryptoAmount = "0";

  if (!onlyOfframp) {
    console.log(`\n=== 1/2 PIX (BRL ${brlAmount}) → TESOURO (onramp real) ===`);
    const quote = await ramp.quote({
      direction: "onramp",
      country: "BR",
      fiat: "BRL",
      fiatAmount: brlAmount,
      cryptoAsset: TESOURO_ASSET,
      pubkey: walletPublicKey,
      walletAddress: walletPublicKey,
    });
    console.log(`cotação real: R$${brlAmount} -> ${quote.cryptoAmount} TESOURO`);

    const order = await ramp.onramp({
      quote,
      pubkey: walletPublicKey,
      walletAddress: walletPublicKey,
      cryptoWalletId: walletId,
      bankAccount: pixDetails,
    });
    console.log("ordem criada:", order.id, "status:", order.status);

    const identity = await identityStore.getIdentity(walletPublicKey, "etherfuse");
    const newBankAccountId = identity?.bankAccounts[0]?.bankAccountId;
    if (newBankAccountId && newBankAccountId !== bankAccountId) {
      console.log(
        `\nConta PIX criada — cole no .env: ETHERFUSE_BANK_ACCOUNT_ID=${newBankAccountId}`,
      );
    }

    console.log("simulando o depósito PIX (sandbox)...");
    await etherfuse.simulateFiatDeposit(order.id);

    console.log("aguardando aprovação (pode levar ~1 min) e assinando com a chave P-256...");
    const settled = await ramp.settleEmbeddedOrder(order.id, signer, {
      pollIntervalMs: 5_000,
      timeoutMs: 3 * 60_000,
    });
    console.log("ordem final:", settled.status, "| TESOURO recebido:", settled.cryptoAmount);
    cryptoAmount = settled.cryptoAmount;
  }

  console.log(`\nSaldo TESOURO DEPOIS do onramp → ${await fetchBalance(walletPublicKey, TESOURO_ASSET)}`);

  if (!onlyOnramp) {
    const amountToSell = onlyOfframp
      ? (process.argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? "5")
      : cryptoAmount;

    console.log(`\n=== 2/2 TESOURO (${amountToSell}) → BRL (offramp real) ===`);
    const outQuote = await ramp.quote({
      direction: "offramp",
      country: "BR",
      fiat: "BRL",
      cryptoAmount: amountToSell,
      cryptoAsset: TESOURO_ASSET,
      pubkey: walletPublicKey,
      walletAddress: walletPublicKey,
    });
    console.log(`cotação real: ${amountToSell} TESOURO -> R$${outQuote.fiatAmount}`);

    const outOrder = await ramp.offramp({
      quote: outQuote,
      pubkey: walletPublicKey,
      walletAddress: walletPublicKey,
      cryptoWalletId: walletId,
      bankAccount: pixDetails,
    });
    console.log("ordem criada:", outOrder.id, "status:", outOrder.status);

    console.log("aguardando aprovação (pode levar ~1 min) e assinando com a chave P-256...");
    const outSettled = await ramp.settleEmbeddedOrder(outOrder.id, signer, {
      pollIntervalMs: 5_000,
      timeoutMs: 3 * 60_000,
    });
    console.log("ordem final:", outSettled.status);
  }

  console.log(`\nSaldo TESOURO FINAL → ${await fetchBalance(walletPublicKey, TESOURO_ASSET)}`);
  console.log(
    `\nEmbedded wallet → https://stellar.expert/explorer/testnet/account/${walletPublicKey}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
