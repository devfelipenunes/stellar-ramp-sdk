import type { Amount } from "../../domain/entities/money";
import type { StellarWallet } from "../../domain/ports/stellar-wallet";

export interface LiveStellarWalletOptions {
  horizonUrl?: string;
}

export function createLiveStellarWallet(
  opts: LiveStellarWalletOptions = {},
): StellarWallet {
  const horizon = opts.horizonUrl ?? "https://horizon-testnet.stellar.org";

  return {
    async getBalance(pubkey, assetCode): Promise<Amount> {
      const [code, issuer] = assetCode.split(":");
      const res = await fetch(`${horizon}/accounts/${pubkey}`);
      if (res.status === 404) return "0";
      if (!res.ok) throw new Error(`horizon ${res.status}`);
      const account = (await res.json()) as {
        balances?: {
          asset_code?: string;
          asset_issuer?: string;
          balance?: string;
        }[];
      };
      const balance = (account.balances ?? []).find(
        (b) => b.asset_code === code && b.asset_issuer === issuer,
      );
      return balance ? String(balance.balance) : "0";
    },
  };
}
