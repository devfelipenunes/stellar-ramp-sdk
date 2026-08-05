#!/usr/bin/env node

import {
  createSign,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

const KEY = process.env.ETHERFUSE_API_KEY ?? process.argv[2];
const ORG = process.env.FOLLOWUP_ORG ?? process.argv[3];
if (!KEY || !ORG) {
  console.error("Faltam ETHERFUSE_API_KEY e FOLLOWUP_ORG=<orgId>");
  process.exit(1);
}

const BASE = "https://api.sand.etherfuse.com";
const OUT = "/tmp/ef-confirm";
await mkdir(OUT, { recursive: true });

const jh = (h) => ({ Authorization: KEY, "Content-Type": "application/json", ...h });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(name, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: jh(init.headers) });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  await writeFile(`${OUT}/${name}.json`, JSON.stringify({ status: res.status, json }, null, 2));
  console.log(`\n=== ${name} → HTTP ${res.status} ===`);
  console.log(typeof json === "string" ? json : JSON.stringify(json, null, 2).slice(0, 700));
  return { status: res.status, json };
}

const CPF = process.env.CPF ?? "52998224725";
const EF_EMAIL = process.env.EF_EMAIL ?? "maria.silva@example.com";
const PIX = { pixKey: EF_EMAIL, pixKeyType: "EMAIL" };

function randomStellarPubkey() {
  const crc16 = (d) => {
    let c = 0;
    for (const b of d) {
      c ^= b << 8;
      for (let i = 0; i < 8; i++) {
        c = c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1;
        c &= 0xffff;
      }
    }
    return c;
  };
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const e32 = (b) => {
    let bits = 0, val = 0, out = "";
    for (const byte of b) {
      val = (val << 8) | byte;
      bits += 8;
      while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += B32[(val << (5 - bits)) & 31];
    return out;
  };
  const raw = Buffer.concat([Buffer.from([6 << 3]), randomBytes(32)]);
  const crc = crc16(raw);

  const withCrc = Buffer.concat([raw, Buffer.from([crc & 0xff, (crc >> 8) & 0xff])]);
  return e32(withCrc);
}

const PUBKEY = process.env.PUBKEY ?? randomStellarPubkey();

if (process.env.GEN_LAUNCH) {
  const ISS = process.env.ETHERFUSE_ISS ?? "https://gist.github.com/devfelipenunes";
  const KID = process.env.ETHERFUSE_KID ?? "5ab266e5-0287-460a-98c6-8dda93a1cac9";
  const PRIV = process.env.ETHERFUSE_PRIVATE_KEY_PATH ?? "secrets/etherfuse/jwtRS256.key";
  const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: KID };
  const payload = {
    iss: ISS,
    sub: ORG,
    aud: "https://api.sand.etherfuse.com/auth/token",
    scope: "verification",
    jti: randomUUID(),
    email: EF_EMAIL,
    name: "Maria Silva Souza",
    iat: now,
    exp: now + 300,
  };
  const signer = createSign("RSA-SHA256");
  signer.update(`${b64url(header)}.${b64url(payload)}`);
  const assertion = `${b64url(header)}.${b64url(payload)}.${signer.sign(readFileSync(PRIV, "utf8"), "base64url")}`;
  const form = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
    target: "/idv",
    return_url: "https://example.com/kyc-ok",
  });
  const hidden = [...form.entries()]
    .map(([k, v]) => `  <input type="hidden" name="${k}" value="${v}" />`)
    .join("\n");
  const html = `<form id="idv-launch" method="POST" action="https://sandbox.etherfuse.com/auth/launch">\n${hidden}\n</form>\n<script>document.getElementById("idv-launch").submit()</script>`;
  const LAUNCH_FILE = `/tmp/idv-launch-${ORG}.html`;
  await writeFile(LAUNCH_FILE, html);
  console.log(`🌐 LAUNCH NOVO p/ org ${ORG} — abra file://${LAUNCH_FILE} UMA vez (~5min)`);
  console.log("  sub:", ORG, "| scope: verification | jti:", payload.jti);
  process.exit(0);
}

for (let i = 1; i <= 5; i++) {
  const r = await fetch(`${BASE}/ramp/customer/${ORG}/kyc?requirements=true`, { headers: jh() });
  const reqs = await r.json();
  const list = Array.isArray(reqs?.requirements) ? reqs.requirements : [];
  console.log(`  → poll ${i}: status=${reqs?.status} n_req=${list.length}`);
  if (list.length) { for (const x of list) console.log(`    - ${x.type}: ${x.status} launch=${x.requiresLaunch}`); break; }
  await sleep(2000);
}

let bankAccountId = process.env.BANK_ACCOUNT_ID ?? "";
if (!bankAccountId) {
  const ba = await req("11_bank_account_pix", `/ramp/customer/${ORG}/bank-account`, {
    method: "POST",
    body: JSON.stringify({
      account: {
        transactionId: randomUUID(),
        firstName: "Maria",
        lastName: "Silva Souza",
        cpf: CPF,
        pixKey: PIX.pixKey,
        pixKeyType: PIX.pixKeyType,
      },
      skipAutoApproval: false,
    }),
  });
  bankAccountId = String(ba.json?.bankAccountId ?? "");
}
console.log("  bankAccountId:", bankAccountId || "(vazio)");

const { publicKey: ecPublic, privateKey: ecPrivate } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
});
const signerPublicKeyPem = ecPublic.export({ type: "spki", format: "pem" });
const signerPrivateKeyPem = ecPrivate.export({ type: "pkcs8", format: "pem" });
const w = await req("15_provision_wallet", "/ramp/wallet", {
  method: "POST",
  body: JSON.stringify({
    walletId: randomUUID(),
    signer: { signerPublicKeyPem },
  }),
});
const walletId = String(w.json?.walletId ?? "");
const walletPub = String(w.json?.publicKey ?? "");
console.log("  embedded wallet:", walletId, "| publicKey:", walletPub.slice(0, 16) + "…");

// Guarda a chave do signer P-256 — por padrão o script descartava isso depois do POST
// /ramp/wallet, mas é a única chance de testar se dá pra assinar sobre essa wallet depois
// (pergunta em aberto: embedded wallet vs external wallet, ver tutorial.md seção 3).
await mkdir("secrets/etherfuse", { recursive: true });
await writeFile(
  `secrets/etherfuse/embedded-wallet-${ORG}.json`,
  JSON.stringify({ orgId: ORG, walletId, publicKey: walletPub, signerPrivateKeyPem }, null, 2),
);
console.log(`  chave do signer salva em secrets/etherfuse/embedded-wallet-${ORG}.json`);

const q = await req("12_quote_brl", "/ramp/quote", {
  method: "POST",
  body: JSON.stringify({
    quoteId: randomUUID(),
    customerId: ORG,
    blockchain: "stellar",
    walletAddress: walletPub,
    sourceAmount: "100",
    quoteAssets: {
      type: "onramp",
      sourceAsset: "BRL",
      targetAsset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    },
  }),
});
const quoteId = String(q.json?.quoteId ?? "");

if (quoteId && bankAccountId && walletId) {
  const order = await req("13_order_brl", "/ramp/order", {
    method: "POST",
    body: JSON.stringify({
      orderId: randomUUID(),
      quoteId,
      customerId: ORG,
      bankAccountId,
      blockchain: "stellar",
      cryptoWalletId: walletId,
    }),
  });

  const orderId = String(
    order.json?.orderId ??
      order.json?.onramp?.orderId ??
      order.json?.offramp?.orderId ??
      order.json?.id ??
      "",
  );
  if (orderId) {
    await req("14_fiat_received", "/ramp/order/fiat_received", {
      method: "POST",
      body: JSON.stringify({ orderId }),
    });
  }
} else {
  console.log("  (sem quoteId/bankAccountId/walletId — pula a ordem)");
}

if (process.env.OFFRAMP) {
  const off = await req("20_quote_offramp", "/ramp/quote", {
    method: "POST",
    body: JSON.stringify({
      quoteId: randomUUID(),
      customerId: ORG,
      blockchain: "stellar",
      walletAddress: walletPub,
      sourceAmount: "10",
      quoteAssets: {
        type: "offramp",
        sourceAsset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        targetAsset: "BRL",
      },
    }),
  });
  if (off.json?.quoteId) {
    const order = await req("21_order_offramp", "/ramp/order", {
      method: "POST",
      body: JSON.stringify({
        orderId: randomUUID(),
        quoteId: off.json.quoteId,
        customerId: ORG,
        bankAccountId,
        blockchain: "stellar",
        cryptoWalletId: walletId,
      }),
    });
    console.log("  offramp order:", order.status);
  }
}

console.log("\n✅ follow-up done — conta PIX + quote BRL + ordem (ver raws em /tmp/ef-confirm/)");
