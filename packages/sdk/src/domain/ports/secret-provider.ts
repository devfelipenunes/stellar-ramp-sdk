/**
 * Port de segredos — ADR-007. O SDK NUNCA recebe keys de código de cliente;
 * adapters buscam via SecretProvider injetado (env, Vault, etc.).
 */
export interface SecretProvider {
  get(key: string): Promise<string | undefined>;
}
