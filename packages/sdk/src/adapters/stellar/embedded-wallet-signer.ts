import {
  createPrivateKey,
  createPublicKey,
  createSign,
  generateKeyPairSync,
} from "node:crypto";

export interface EmbeddedWalletSigner {
  readonly publicKeyPem: string;

  sign(approvalMessage: string): string;
}

export function createEmbeddedWalletSigner(
  privateKeyPem: string,
): EmbeddedWalletSigner {
  const publicKeyPem = createPublicKey(createPrivateKey(privateKeyPem))
    .export({ type: "spki", format: "pem" })
    .toString();

  return {
    publicKeyPem,
    sign(approvalMessage: string): string {
      return createSign("SHA256")
        .update(approvalMessage)
        .sign(privateKeyPem)
        .toString("hex");
    },
  };
}

export interface EmbeddedWalletKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
}

export function generateEmbeddedWalletKeyPair(): EmbeddedWalletKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  };
}
