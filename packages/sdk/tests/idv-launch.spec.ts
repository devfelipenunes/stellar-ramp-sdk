import { describe, expect, it } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";
import {
  buildIdvLaunchHtml,
  createIdvLaunch,
} from "../src/adapters/etherfuse/idv-launch";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const launch = createIdvLaunch({
  orgId: "org-123",
  privateKey,
  issuer: "https://demo.example.com",
  keyId: "demo-key",
  email: "ana@example.com",
  name: "Ana Ejemplo",
  returnUrl: "https://app.example.com/pos-kyc",
});

function decodeJwt(jwt: string) {
  const [h, p, s] = jwt.split(".");
  return {
    header: JSON.parse(Buffer.from(h, "base64url").toString()),
    payload: JSON.parse(Buffer.from(p, "base64url").toString()),
    signature: Buffer.from(s, "base64url"),
    signingInput: `${h}.${p}`,
  };
}

describe("createIdvLaunch — hosted /idv verification (Etherfuse)", () => {
  it("assina um JWT RS256 com sub = orgId, scope idv e claims do usuário", () => {
    const { header, payload } = decodeJwt(launch.assertion);
    expect(header).toMatchObject({ alg: "RS256", kid: "demo-key" });
    expect(payload).toMatchObject({
      iss: "https://demo.example.com",
      sub: "org-123", // sub = organizationId do createCustomer (CRÍTICO)
      aud: "https://api.sand.etherfuse.com/auth/token",
      scope: "idv",
      email: "ana@example.com",
      name: "Ana Ejemplo",
    });
    expect(payload.jti).toBeTruthy();
    expect(payload.exp - payload.iat).toBe(300); // short-lived ~5 min
  });

  it("a assinatura é verificável com a chave pública", () => {
    const { signature, signingInput } = decodeJwt(launch.assertion);
    const ok = verify(
      "RSA-SHA256",
      Buffer.from(signingInput),
      publicKey,
      signature,
    );
    expect(ok).toBe(true);
  });

  it("retorna o form do /auth/launch (grant_type, target, return_url)", () => {
    expect(launch.action).toBe("https://sandbox.etherfuse.com/auth/launch");
    expect(launch.form.grant_type).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    expect(launch.form.assertion).toBe(launch.assertion);
    expect(launch.form.target).toBe("/idv");
    expect(launch.form.return_url).toBe("https://app.example.com/pos-kyc");
  });

  it("environment prod usa o launch host e o token audience de produção", () => {
    const prod = createIdvLaunch({
      orgId: "o-1",
      privateKey,
      issuer: "https://issuer.example.com",
      keyId: "k",
      email: "e",
      name: "n",
      environment: "prod",
    });
    expect(prod.action).toBe("https://app.etherfuse.com/auth/launch");
    const { payload } = decodeJwt(prod.assertion);
    expect(payload.aud).toBe("https://api.etherfuse.com/auth/token");
  });

  it("rejeita returnUrl que não é https (open redirect)", () => {
    expect(() =>
      createIdvLaunch({
        orgId: "o-1",
        privateKey,
        issuer: "https://issuer.example.com",
        keyId: "k",
        email: "e",
        name: "n",
        returnUrl: "javascript:alert(1)",
      }),
    ).toThrow(/returnUrl must be an absolute https URL/);
  });

  it("buildIdvLaunchHtml gera um form self-submitting com os campos", () => {
    const html = buildIdvLaunchHtml(launch);
    expect(html).toContain(`action="${launch.action}"`);
    expect(html).toContain('name="assertion"');
    expect(html).toContain('name="target"');
    expect(html).toContain("submit()");
  });
});
