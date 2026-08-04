#!/usr/bin/env node
/**
 * Full personal onboarding up to the /idv launch. Creates org + KYC
 * programmatically, signs the verification JWT (same logic as the SDK's
 * createIdvLaunch), POSTs /auth/launch, and prints the result.
 *
 *   ETHERFUSE_API_KEY="api_sand:..." node scripts/confirm-idv.mjs
 *
 * Raws in /tmp/ef-confirm/ (outside the repo).
 */
import { randomUUID, createSign, generateKeyPairSync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Real issuer/key: set ETHERFUSE_ISS and put the private key in
// secrets/etherfuse/jwtRS256.key (or set ETHERFUSE_PRIVATE_KEY_PATH).
const ISS = process.env.ETHERFUSE_ISS ?? "https://demo.example.com";
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
    scope: "idv",
    jti: uid(),
    email,
    name,
    iat: now,
    exp: now + 300, // ~5 min
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

// ── 1. org personal (userInfo.email) ──
const orgId = uid();
const org = await fetch(`${BASE}/ramp/organization`, {
  method: "POST", headers: jh(),
  body: JSON.stringify({
    id: orgId,
    accountType: "personal",
    displayName: "Demo User",
    userInfo: { displayName: "Demo User", email: "demo@example.com", firstName: "Juan", lastName: "Perez Lopez" },
  }),
}).then((r) => r.json());
console.log(`✓ org = ${orgId}`);

// ── 2. KYC programmatic ──
await req("02_verification", `/ramp/customer/${orgId}/verification`, {
  method: "POST",
  body: JSON.stringify({
    firstName: "Juan", lastName: "Perez Lopez", dateOfBirth: "1990-01-01",
    taxId: "XEXX010101000", country: "MEX",
    address: { street: "Av Reforma 123", city: "CDMX", region: "CDMX", postalCode: "06600", country: "MEX" },
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
  form.append("tax_document", new Blob([Buffer.from(FAKE_JPEG, "base64")], { type: "image/jpeg" }), "tax.jpg");
  const res = await fetch(`${BASE}/ramp/customer/${orgId}/verification/documents`, {
    method: "POST", headers: { Authorization: KEY }, body: form,
  });
  console.log(`\n=== documents → HTTP ${res.status} ===`);
}

await req("04_questionnaire", `/ramp/customer/${orgId}/verification/questionnaire`, {
  method: "POST",
  body: JSON.stringify({ type: "occupation", jobTitle: "Engineer", industry: "1000000" }),
});

// ── 3. sign the /idv launch JWT (same logic as SDK createIdvLaunch) ──
// Use the real private key from secrets/ if present; otherwise a mock one.
let privateKey;
try {
  privateKey = await readFile(PRIV_KEY_PATH, "utf8");
  console.log("  usando chave real:", PRIV_KEY_PATH);
} catch {
  ({ privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 }));
  console.log("  (sem chave real — usando chave mock. Registre o iss na Etherfuse p/ aceitar)");
}
const assertion = signIdvJwt({
  orgId,
  privateKey,
  issuer: ISS, // MUST be an absolute URL (server parses iss as URL)
  keyId: process.env.ETHERFUSE_KID ?? "demo-key",
  email: "demo@example.com",
  name: "Demo User",
});

console.log("\n── JWT /idv (createIdvLaunch logic) ──");
console.log("  sub:", orgId, "| scope: idv | alg: RS256");

// POST the launch form (like the browser would)
const form = new URLSearchParams({
  grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
  assertion,
  target: "/idv",
  return_url: "https://example.com/kyc-ok",
});
const res = await fetch(LAUNCH, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: form.toString(),
  redirect: "manual",
});
const text = await res.text();
console.log(`\n── POST /auth/launch → HTTP ${res.status} ──`);
console.log("  location:", res.headers.get("location") ?? "(none)");
console.log("  body:", text.slice(0, 400));

console.log(`\n── POST /auth/launch: HTTP ${res.status} — ${res.status === 200 ? "LAUNCH ACEITO ✅" : "rejeitado"}`);
console.log("  body: página", text.includes("idv") || text.includes("next") ? "HTML do /idv (Next.js)" : "(veja o raw)");

// Save a self-submitting HTML so the user can open /idv in a real browser
// (the JWT expires in ~5 minutes — open it fast).
const hidden = [...form.entries()]
  .map(([k, v]) => `  <input type="hidden" name="${k}" value="${v}" />`)
  .join("\n");
const html = `<form id="idv-launch" method="POST" action="${LAUNCH}">\n${hidden}\n</form>\n<script>document.getElementById("idv-launch").submit()</script>`;
await writeFile("/tmp/idv-launch.html", html);
console.log(`\n🌐 ABRA NO NAVEGADOR (rápido — JWT expira em ~5min):\n  file:///tmp/idv-launch.html`);
console.log("\nDepois de completar o /idv, me avisa que eu rodo o follow-up (conta compliant → ordem).");
console.log(`\nRaws in ${OUT}/`);
