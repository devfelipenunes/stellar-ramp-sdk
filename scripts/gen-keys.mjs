#!/usr/bin/env node
/**
 * Generates the RSA keypair + public JWKS needed to register the /idv launch
 * issuer with Etherfuse.
 *
 *   node scripts/gen-keys.mjs
 *
 * Outputs to /tmp/etherfuse-keys/:
 *   - jwtRS256.key     PRIVATE key — keep server-side, never expose/commit
 *   - jwtRS256.key.pub public key (PEM) — reference
 *   - jwks.json        public JWKS — host at an https URL and register it
 */
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const OUT = "/tmp/etherfuse-keys";
await mkdir(OUT, { recursive: true });

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const kid = randomUUID();
const jwk = publicKey.export({ format: "jwk" });
const jwks = {
  keys: [{ kty: "RSA", use: "sig", alg: "RS256", kid, n: jwk.n, e: jwk.e }],
};

await writeFile(OUT + "/jwtRS256.key", privateKey.export({ type: "pkcs8", format: "pem" }));
await writeFile(OUT + "/jwtRS256.key.pub", publicKey.export({ type: "spki", format: "pem" }));
await writeFile(OUT + "/jwks.json", JSON.stringify(jwks, null, 2));

console.log(`Chaves geradas em ${OUT}/`);
console.log("  jwtRS256.key      PRIVADA — fica no servidor do app, NUNCA exponha/commite");
console.log("  jwtRS256.key.pub  pública (PEM) — referência");
console.log("  jwks.json         JWKS pública — hospede em https e registre na Etherfuse");
console.log("\nkid:", kid);
console.log("\n--- jwks.json ---");
console.log(JSON.stringify(jwks, null, 2));
