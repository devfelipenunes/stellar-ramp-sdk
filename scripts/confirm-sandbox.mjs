#!/usr/bin/env node

import { randomUUID, createSign, generateKeyPairSync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const ISS = process.env.ETHERFUSE_ISS ??
  "https://gist.github.com/devfelipenunes";
const PRIV_KEY_PATH = process.env.ETHERFUSE_PRIVATE_KEY_PATH ?? "secrets/etherfuse/jwtRS256.key";

const KEY = process.env.ETHERFUSE_API_KEY ?? process.argv[2];
if (!KEY) {
  console.error("Missing API key");
  process.exit(1);
}

const BASE = "https://api.sand.etherfuse.com";
const LAUNCH = "https://sandbox.etherfuse.com/auth/launch";
const OUT = "/tmp/ef-confirm";
await mkdir(OUT, { recursive: true });

const uid = () => randomUUID();
const jh = (h) => ({ Authorization: KEY, "Content-Type": "application/json", ...h });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VARIANT = (process.env.VARIANT ?? "BR").toUpperCase();
if (!["MX", "BR"].includes(VARIANT)) {
  console.error("VARIANT deve ser BR ou MX");
  process.exit(1);
}

const EF_EMAIL = process.env.EF_EMAIL ?? "maria.silva@example.com";

const P = VARIANT === "BR"
  ? {
      firstName: "Maria",
      lastName: "Silva Souza",
      email: EF_EMAIL,
      taxId: "52998224725",
      dateOfBirth: "1992-05-20",
      country: "BRA",
      address: {
        street: "Av Paulista 1000",
        city: "Sao Paulo",
        region: "SP",
        postalCode: "01310-100",
        country: "BRA",
      },
      pix: { pixKey: EF_EMAIL, pixKeyType: "EMAIL" },
      quoteSource: "BRL",
    }
  : {
      firstName: "Juan",
      lastName: "Perez Lopez",
      email: "demo@example.com",
      taxId: "XEXX010101000",
      dateOfBirth: "1990-01-01",
      country: "MEX",
      address: {
        street: "Av Reforma 123",
        city: "CDMX",
        region: "CDMX",
        postalCode: "06600",
        country: "MEX",
      },
      quoteSource: "MXN",
    };

const FAKE_JPEG =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

function signIdvJwt({ orgId, privateKey, issuer, keyId, email, name }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: keyId };
  const payload = {
    iss: issuer,
    sub: orgId,
    aud: "https://api.sand.etherfuse.com/auth/token",
    scope: "verification",
    jti: uid(),
    email,
    name,
    iat: now,
    exp: now + 300,
  };
  const input = `${b64url(header)}.${b64url(payload)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(input);
  return `${input}.${signer.sign(privateKey, "base64url")}`;
}

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

const orgId = uid();
const org = await fetch(`${BASE}/ramp/organization`, {
  method: "POST", headers: jh(),
  body: JSON.stringify({
    id: orgId,
    accountType: "personal",
    displayName: P.firstName,
    userInfo: { displayName: P.firstName, email: P.email, firstName: P.firstName, lastName: P.lastName },
  }),
}).then((r) => r.json());
console.log(`✓ org = ${orgId} (${VARIANT})`);

await req("02_verification", `/ramp/customer/${orgId}/verification`, {
  method: "POST",
  body: JSON.stringify({
    firstName: P.firstName, lastName: P.lastName, dateOfBirth: P.dateOfBirth,
    taxId: P.taxId, country: P.country,
    address: P.address,
  }),
});

for (let i = 1; i <= 15; i++) {
  await sleep(2000);
  const r = await fetch(`${BASE}/ramp/customer/${orgId}/kyc?requirements=true`, { headers: jh() });
  const reqs = await r.json();
  const list = Array.isArray(reqs?.requirements) ? reqs.requirements : [];
  console.log(`  → poll ${i}: status=${reqs?.status} n_req=${list.length}`);
  if (list.length) { for (const x of list) console.log(`    - ${x.type}: ${x.status} launch=${x.requiresLaunch}`); break; }
}

{
  const form = new FormData();
  form.append("id_type", "ID_CARD");
  form.append("id_front", new Blob([Buffer.from(FAKE_JPEG, "base64")], { type: "image/jpeg" }), "front.jpg");
  form.append("id_back", new Blob([Buffer.from(FAKE_JPEG, "base64")], { type: "image/jpeg" }), "back.jpg");
  if (VARIANT === "MX") {
    form.append("tax_document", new Blob([Buffer.from(FAKE_JPEG, "base64")], { type: "image/jpeg" }), "tax.jpg");
  }
  const res = await fetch(`${BASE}/ramp/customer/${orgId}/verification/documents`, {
    method: "POST", headers: { Authorization: KEY }, body: form,
  });
  const txt = await res.text();
  await writeFile(`${OUT}/03_documents.json`, JSON.stringify({ status: res.status, body: txt }, null, 2));
  console.log(`\n=== documents → HTTP ${res.status} === ${txt.slice(0, 200)}`);
}

await req("04_questionnaire", `/ramp/customer/${orgId}/verification/questionnaire`, {
  method: "POST",
  body: JSON.stringify({ type: "occupation", jobTitle: "Engineer", industry: "1000000" }),
});

if (VARIANT === "BR") {
  await req("05_bank_account_pix", `/ramp/customer/${orgId}/bank-account`, {
    method: "POST",
    body: JSON.stringify({
      account: {
        transactionId: uid(),
        firstName: P.firstName,
        lastName: P.lastName,
        cpf: P.taxId,
        pixKey: P.pix.pixKey,
        pixKeyType: P.pix.pixKeyType,
      },
      skipAutoApproval: false,
    }),
  });
  await req("06_quote_brl", "/ramp/quote", {
    method: "POST",
    body: JSON.stringify({
      quoteId: uid(),
      customerId: orgId,
      blockchain: "stellar",
      wallet: "G-DEMO-WALLET",
      sourceAmount: "100",
      quoteAssets: {
        type: "onramp",
        sourceAsset: P.quoteSource,
        targetAsset:
          "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      },
    }),
  });
}

let privateKey;
try {
  privateKey = await readFile(PRIV_KEY_PATH, "utf8");
  console.log("  usando chave real:", PRIV_KEY_PATH);
} catch {
  ({ privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 }));
  console.log("  (sem chave real — usando chave mock. Registre o iss na Etherfuse p/ aceitar)");
}
const jwtArgs = {
  orgId,
  privateKey,
  issuer: ISS,
  keyId: process.env.ETHERFUSE_KID ?? "5ab266e5-0287-460a-98c6-8dda93a1cac9",
  email: P.email,
  name: `${P.firstName} ${P.lastName}`,
};
const assertion = signIdvJwt(jwtArgs);
const launchForm = (assertionValue) =>
  new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: assertionValue,
    target: "/idv",
    return_url: "https://example.com/kyc-ok",
  });

console.log("\n── JWT /idv (createIdvLaunch logic) ──");
console.log("  sub:", orgId, "| scope: idv | alg: RS256");

const form = launchForm(assertion);

const res = await fetch(LAUNCH, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: form.toString(),
});
const text = await res.text();
await writeFile(`${OUT}/07_launch.json`, JSON.stringify({ status: res.status, url: res.url, body: text }, null, 2));
console.log(`\n── POST /auth/launch → HTTP ${res.status} (final: ${res.url}) ──`);

const unknownIssuer = /Unknown\s+issuer:\s*([^"<\s]+)/i.exec(text)?.[1];
const rejected = unknownIssuer || /invalid_client|error_description/i.test(text);
console.log(`\n── POST /auth/launch: ${rejected ? "REJEITADO ⚠" : "LAUNCH ACEITO ✅"}`);
if (rejected) {
  console.log(
    unknownIssuer
      ? `  error: Unknown issuer: ${unknownIssuer}`
      : "  error: invalid_client (detalhe em 07_launch.json)",
  );
  console.log("  → confira ETHERFUSE_ISS (o iss registrado na Etherfuse) + kid/JWKS.");
} else {
  console.log(
    "  body: página",
    text.includes("idv") || text.includes("next") ? "HTML do /idv (Next.js)" : "(veja o raw)",
  );
}

const userForm = launchForm(signIdvJwt(jwtArgs));
const hidden = [...userForm.entries()]
  .map(([k, v]) => `  <input type="hidden" name="${k}" value="${v}" />`)
  .join("\n");
const html = `<form id="idv-launch" method="POST" action="${LAUNCH}">\n${hidden}\n</form>\n<script>document.getElementById("idv-launch").submit()</script>`;

const LAUNCH_FILE = `/tmp/idv-launch-${orgId}.html`;
await writeFile(LAUNCH_FILE, html);
console.log(`\n🌐 ABRA NO NAVEGADOR (rápido — JWT expira em ~5min):\n  file://${LAUNCH_FILE}`);
console.log("\nDepois de completar o /idv, me avisa que eu rodo o follow-up (conta compliant → ordem).");
console.log(`\nRaws in ${OUT}/`);
