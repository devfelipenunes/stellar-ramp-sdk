
export interface SecretProvider {
  get(key: string): Promise<string | undefined>;
}
