/**
 * Secrets port — ADR-007. The SDK NEVER receives keys from client code;
 * adapters fetch them via an injected SecretProvider (env, Vault, etc.).
 */
export interface SecretProvider {
  get(key: string): Promise<string | undefined>;
}
