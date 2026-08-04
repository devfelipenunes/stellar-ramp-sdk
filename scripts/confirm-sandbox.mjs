#!/usr/bin/env node
/**
 * Fluxo PERSONAL completo para destravar o compliant via /idv (auto-aprova no
 * sandbox): org personal → verification → documents → questionnaire →
 * onboarding-url → imprime o LINK /idv. Depois de abrir no navegador e
 * completar, rodar de novo para verificar approved/compliant e criar a conta.
 *
 * Usage: ETHERFUSE_API_KEY="api_sand:..." node scripts/confirm-sandbox.mjs
 * Raws in /tmp/ef-confirm/ (outside the repo).
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const KEY = process.env.ETHERFUSE_API_KEY ?? process.argv[2];
if (!KEY) {
  console.error("Missing API key");
  process.exit(1);
}

const BASE = "https://api.sand.etherfuse.com";
const OUT = "/tmp/ef-confirm";
await mkdir(OUT, { recursive: true });

const uid = () => randomUUID();
const results = [];
const truncate = (s, n = 900) =>
  s.length > n ? `${s.slice(0, n)}\n…[truncated]` : s;
const jh = (h) => ({ Authorization: KEY, "Content-Type": "application/json", ...h });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(name, path, init = {}, label = path) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: jh(init.headers) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  const entry = { name, path: label, status: res.status, json };
  results.push(entry);
  await writeFile(`${OUT}/${name}.json`, JSON.stringify(entry, null, 2));
  console.log(`\n=== ${name}  ${label} → HTTP ${res.status} ===`);
  console.log(truncate(JSON.stringify(json, null, 2)));
  return { status: res.status, json };
}

const pickId = (obj, ...keys) => {
  if (obj && typeof obj === "object")
    for (const k of keys)
      if (obj[k] != null && obj[k] !== "") return String(obj[k]);
  return undefined;
};

const FAKE_JPEG =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";

async function getRequirements(orgId) {
  const res = await fetch(`${BASE}/ramp/customer/${orgId}/kyc?requirements=true`, { headers: jh() });
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// ── 1. org PERSONAL (userInfo.displayName + email — model confirmed) ──
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
console.log(`✓ org sent=${orgId} returned=${pickId(org, "organizationId", "id")}`);

// ── 2. verification (country alpha-3 MEX, RFC personal placeholder) ──
await call("02_verification", `/ramp/customer/${orgId}/verification`, {
  method: "POST",
  body: JSON.stringify({
    firstName: "Juan",
    lastName: "Perez Lopez",
    dateOfBirth: "1990-01-01",
    taxId: "XEXX010101000",
    country: "MEX",
    address: { street: "Av Reforma 123", city: "CDMX", region: "CDMX", postalCode: "06600", country: "MEX" },
  }),
}, `POST .../verification`);

// ── 3. poll requirements até a lista aparecer ──
for (let i = 1; i <= 15; i++) {
  await sleep(2000);
  const req = await getRequirements(orgId);
  const list = Array.isArray(req?.requirements) ? req.requirements : [];
  console.log(`  → poll ${i}: status=${req?.status} n_req=${list.length}`);
  if (list.length > 0) {
    for (const r of list) console.log(`    - ${r.type}: ${r.status} requiresLaunch=${r.requiresLaunch}`);
    break;
  }
}

// ── 4. documents (multipart) + questionnaire ──
{
  const form = new FormData();
  form.append("id_type", "ID_CARD");
  form.append("id_front", new Blob([Buffer.from(FAKE_JPEG, "base64")], { type: "image/jpeg" }), "front.jpg");
  form.append("id_back", new Blob([Buffer.from(FAKE_JPEG, "base64")], { type: "image/jpeg" }), "back.jpg");
  form.append("tax_document", new Blob([Buffer.from(FAKE_JPEG, "base64")], { type: "image/jpeg" }), "tax.jpg");
  const res = await fetch(`${BASE}/ramp/customer/${orgId}/verification/documents`, {
    method: "POST", headers: { Authorization: KEY }, body: form,
  });
  const t = await res.text();
  console.log(`\n=== documents → HTTP ${res.status} ===\n${truncate(t)}`);
}

await call("04_questionnaire", `/ramp/customer/${orgId}/verification/questionnaire`, {
  method: "POST",
  body: JSON.stringify({ type: "occupation", jobTitle: "Engineer", industry: "1000000" }),
}, `POST .../questionnaire`);

// ── 4b. poll até personal_data sair de awaiting_review (auto-aprova?) ──
let personalOk = false;
for (let i = 1; i <= 20 && !personalOk; i++) {
  await sleep(2000);
  const req = await getRequirements(orgId);
  const pd = Array.isArray(req?.requirements) ? req.requirements.find((r) => r.type === "personal_data") : null;
  console.log(`  → poll personal_data ${i}: ${pd?.status} | org status=${req?.status} approvedAt=${req?.approvedAt ?? "-"}`);
  if (req?.status === "approved" || req?.approvedAt || (pd && pd.status === "approved")) personalOk = true;
  if (pd && pd.status === "denied") { console.log(`  ⚠️  denied: ${req?.currentRejectionReason}`); break; }
}

// ── 5. conta bancária PERSONAL (se org começou a aprovar) ──
const bankRes = await fetch(`${BASE}/ramp/customer/${orgId}/bank-account`, {
  method: "POST", headers: jh(),
  body: JSON.stringify({
    account: {
      transactionId: uid(),
      firstName: "Juan",
      paternalLastName: "Perez",
      maternalLastName: "Lopez",
      birthDate: "19900101",
      birthCountryIsoCode: "MX",
      curp: "PELJ900101HDFRRL05",
      rfc: "XEXX010101000",
      clabe: "012180015000000001",
    },
    skipAutoApproval: false,
  }),
});
const bankText = await bankRes.text();
let bank;
try { bank = JSON.parse(bankText); } catch { bank = bankText; }
const bankId = pickId(bank, "bankAccountId", "id");
console.log(`✓ bank (HTTP ${bankRes.status}) = ${bankId ?? bankText.slice(0, 140)}`);

// ── 6. onboarding-url com o bankAccountId real (gera o LINK /idv) ──
const WALLET = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const urlBody = {
  customerId: orgId,
  bankAccountId: bankId ?? uid(),
  publicKey: WALLET,
  blockchain: "stellar",
  userInfo: { displayName: "Demo User", email: "demo@example.com", firstName: "Juan", lastName: "Perez Lopez" },
};
for (let t = 0; t < 10; t++) {
  const { status, json } = await call(
    `06_url_t${t + 1}`,
    "/ramp/onboarding-url",
    { method: "POST", body: JSON.stringify(urlBody) },
    `POST /ramp/onboarding-url try${t + 1}`,
  );
  if (status === 200 || status === 201) {
    const link = typeof json === "object" ? (json.url ?? json.onboardingUrl ?? json.launchUrl ?? json) : json;
    console.log(`\n🔗 LINK /idv: ${truncate(JSON.stringify(link), 800)}`);
    break;
  }
  const f = json && typeof json === "object" && typeof json.error === "string"
    ? json.error.match(/missing field `(\w+)`/)?.[1] ?? null
    : null;
  if (!f) {
    const msg = json?.message ?? json?.error ?? String(json);
    console.log(`  → (${status}) ${String(msg).slice(0, 160)}`);
    break;
  }
  urlBody[f] = f.includes("bank") ? uid()
    : f.includes("blockchain") ? "stellar"
    : f.includes("public") || f.includes("wallet") ? WALLET
    : f.includes("customer") ? orgId
    : f.includes("email") ? "demo@example.com"
    : f.includes("display") || f.includes("name") ? "Demo User"
    : f.includes("first") ? "Juan"
    : f.includes("last") ? "Perez Lopez"
    : "";
  console.log(`→ url.${f}`);
}

// ── resumo ──
console.log("\n\n=== SUMMARY ===");
for (const r of results) {
  const keys = r.json && typeof r.json === "object" ? Object.keys(r.json).join(",") : typeof r.json;
  console.log(`${r.name.padEnd(22)} HTTP ${r.status}  ${keys}`);
}
console.log(`\nRaws in ${OUT}/`);
