import type { SecretProvider } from "../../domain/ports/secret-provider";

export function createEnvSecretProvider(
  source: Record<string, string | undefined> = process.env,
): SecretProvider {
  return {
    get: async (key) => source[key],
  };
}
