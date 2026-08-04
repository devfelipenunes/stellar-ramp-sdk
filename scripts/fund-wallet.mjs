#!/usr/bin/env node

import {
  Account,
  Asset,
  Keypair,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-base";

const NETWORK = "Test SDF Network ; September 2015";
const HORIZON = "https://horizon-testnet.stellar.org";
const FRIENDBOT = "https://friendbot.stellar.org";
const USDC = new Asset(
  "USDC",
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
);

const kp = Keypair.random();
const pubkey = kp.publicKey();
console.log("pubkey:", pubkey);
console.log("secret:", kp.secret());

const fb = await fetch(`${FRIENDBOT}?addr=${pubkey}`);
const fbJson = await fb.json();
console.log(
  "friendbot:",
  fb.ok ? "fundado ✓" : "ERRO " + JSON.stringify(fbJson.extras ?? fbJson).slice(0, 200),
);

const accRes = await fetch(`${HORIZON}/accounts/${pubkey}`);
const acc = await accRes.json();
const tx = new TransactionBuilder(new Account(pubkey, acc.sequence), {
  fee: "100",
  networkPassphrase: NETWORK,
})
  .addOperation(Operation.changeTrust({ asset: USDC, limit: "1000000" }))
  .setTimeout(30)
  .build();
tx.sign(kp);

const subRes = await fetch(`${HORIZON}/transactions`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ tx: tx.toXDR() }),
});
const subJson = await subRes.json();
console.log(
  "trustline:",
  subRes.ok ? "OK ✓ (tx " + subJson.hash + ")" : "ERRO " + JSON.stringify(subJson).slice(0, 300),
);

console.log("\nPUBKEY=" + pubkey);
