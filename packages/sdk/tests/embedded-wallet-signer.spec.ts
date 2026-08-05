import { createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createEmbeddedWalletSigner,
  generateEmbeddedWalletKeyPair,
} from "../src/adapters/stellar/embedded-wallet-signer";

describe("EmbeddedWalletSigner — assinatura P-256/ECDSA das aprovações", () => {
  it("gera um par de chaves P-256 em PEM", () => {
    const pair = generateEmbeddedWalletKeyPair();
    expect(pair.publicKeyPem).toContain("BEGIN PUBLIC KEY");
    expect(pair.privateKeyPem).toContain("BEGIN PRIVATE KEY");
  });

  it("deriva a chave pública correta a partir da privada", () => {
    const pair = generateEmbeddedWalletKeyPair();
    const signer = createEmbeddedWalletSigner(pair.privateKeyPem);
    expect(signer.publicKeyPem).toBe(pair.publicKeyPem);
  });

  it("assina o approvalMessage com uma assinatura verificável pela chave pública", () => {
    const pair = generateEmbeddedWalletKeyPair();
    const signer = createEmbeddedWalletSigner(pair.privateKeyPem);
    const approvalMessage = JSON.stringify({
      type: "ACTIVITY_TYPE_APPROVE_ACTIVITY",
      timestampMs: "1785943284053",
    });

    const signatureHex = signer.sign(approvalMessage);

    const verifier = createVerify("SHA256");
    verifier.update(approvalMessage);
    expect(verifier.verify(pair.publicKeyPem, signatureHex, "hex")).toBe(true);
  });

  it("rejeita quando verificado contra uma chave pública diferente", () => {
    const pair = generateEmbeddedWalletKeyPair();
    const otherPair = generateEmbeddedWalletKeyPair();
    const signer = createEmbeddedWalletSigner(pair.privateKeyPem);
    const approvalMessage = "Claim 19.49 USDC";

    const signatureHex = signer.sign(approvalMessage);

    const verifier = createVerify("SHA256");
    verifier.update(approvalMessage);
    expect(verifier.verify(otherPair.publicKeyPem, signatureHex, "hex")).toBe(
      false,
    );
  });
});
