import { describe, expect, it } from "vitest";
import {
  Account,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-base";
import { createKeypairSigner } from "../src/adapters/stellar/keypair-signer";

const SECRET = "SBMWX6BTYUIY55A6XOUB7IHOHE5QVSNCWHFRSARWXUX4IJOC4V7FZ2X4";
const PUBLIC = Keypair.fromSecret(SECRET).publicKey();

function unsignedTestXdr(): string {
  const account = new Account(PUBLIC, "1");
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.bumpSequence({ bumpTo: "2" }))
    .setTimeout(60)
    .build();
  return tx.toXDR();
}

describe("createKeypairSigner", () => {
  it("expõe a publicKey derivada do secret", () => {
    const signer = createKeypairSigner(SECRET);
    expect(signer.publicKey).toBe(PUBLIC);
  });

  it("assina a XDR e devolve uma envelope com 1 assinatura válida", async () => {
    const signer = createKeypairSigner(SECRET);
    const signedXdr = await signer.sign(unsignedTestXdr(), Networks.TESTNET);

    const tx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
    expect(tx.signatures).toHaveLength(1);

    const keypair = Keypair.fromPublicKey(PUBLIC);
    const hint = tx.signatures[0]!.hint();
    expect(hint.equals(keypair.signatureHint())).toBe(true);
  });

  it("secret inválido falha na construção, não no sign", () => {
    expect(() => createKeypairSigner("not-a-secret")).toThrow();
  });
});
