import {
  MockProvider,
  type MockProviderOptions,
} from "../adapters/mock/mock-provider";
import { InMemoryIdentityStore } from "../adapters/memory/in-memory-identity-store";
import { createEnvSecretProvider } from "../adapters/memory/env-secret-provider";
import { createEtherfuseProvider } from "../adapters/etherfuse/etherfuse-provider";
import type { CountryCode } from "../domain/entities/country";
import type { IdentityStore } from "../domain/ports/identity-store";
import type { RampProvider } from "../domain/ports/ramp-provider";
import type { SecretProvider } from "../domain/ports/secret-provider";
import type { StellarWallet } from "../domain/ports/stellar-wallet";
import { createRamp, type RampService } from "./ramp-service";

const ETHERFUSE_BASE_URL = {
  sandbox: "https://api.sand.etherfuse.com",
  prod: "https://api.etherfuse.com",
} as const;

const DEFAULT_COUNTRIES: CountryCode[] = ["BR", "MX", "US"];

export interface StellarRampEtherfuseOptions {
  environment: "sandbox" | "prod";
  countries?: CountryCode[];
  accountType?: "personal" | "business";
  usdcAsset?: string;
  blockchain?: string;
  customerEmail?: string;

  apiKey?: string;

  apiKeyEnv?: string;
}

export type StellarRampOptions =
  | { mode: "mock"; mock?: MockProviderOptions; identityStore?: IdentityStore }
  | {
      mode: "live";

      providers?: RampProvider[];
      etherfuse?: StellarRampEtherfuseOptions;
      identityStore?: IdentityStore;
      stellarWallet?: StellarWallet;
    };

export function createStellarRamp(opts: StellarRampOptions): RampService {
  const identityStore = opts.identityStore ?? new InMemoryIdentityStore();

  if (opts.mode === "mock") {
    return createRamp({
      mode: "mock",
      providers: [new MockProvider(opts.mock)],
      identityStore,
    });
  }

  const providers: RampProvider[] = [...(opts.providers ?? [])];

  if (opts.etherfuse) {
    const e = opts.etherfuse;
    if (!e.apiKey && !e.apiKeyEnv) {
      throw new Error(
        "createStellarRamp: etherfuse.apiKey ou etherfuse.apiKeyEnv obrigatório (chave server-side, ADR-007)",
      );
    }

    const secrets: SecretProvider = e.apiKey
      ? { get: async () => e.apiKey }
      : createEnvSecretProvider();
    providers.push(
      createEtherfuseProvider({
        baseUrl: ETHERFUSE_BASE_URL[e.environment],
        environment: e.environment,
        countries: e.countries ?? DEFAULT_COUNTRIES,
        secrets,
        keyName: e.apiKeyEnv ?? "ETHERFUSE_API_KEY",
        ...(e.accountType ? { accountType: e.accountType } : {}),
        ...(e.usdcAsset ? { usdcAsset: e.usdcAsset } : {}),
        ...(e.blockchain ? { blockchain: e.blockchain } : {}),
        ...(e.customerEmail ? { customerEmail: e.customerEmail } : {}),
      }),
    );
  }

  if (providers.length === 0) {
    throw new Error(
      "createStellarRamp: modo live exige ao menos um provider (etherfuse ou providers[])",
    );
  }

  return createRamp({
    mode: "live",
    providers,
    identityStore,
    ...(opts.stellarWallet ? { stellarWallet: opts.stellarWallet } : {}),
  });
}
