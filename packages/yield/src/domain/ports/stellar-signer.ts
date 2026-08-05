export interface StellarSigner {
  readonly publicKey: string;
  sign(unsignedXdr: string, networkPassphrase: string): Promise<string>;
}
