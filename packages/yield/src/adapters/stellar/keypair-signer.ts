import { Keypair, TransactionBuilder } from "@stellar/stellar-base";
import type { StellarSigner } from "../../domain/ports/stellar-signer";

export function createKeypairSigner(secret: string): StellarSigner {
  const keypair = Keypair.fromSecret(secret);

  return {
    publicKey: keypair.publicKey(),
    async sign(unsignedXdr: string, networkPassphrase: string): Promise<string> {
      const tx = TransactionBuilder.fromXDR(unsignedXdr, networkPassphrase);
      tx.sign(keypair);
      return tx.toXDR();
    },
  };
}
