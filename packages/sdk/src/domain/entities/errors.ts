/** Códigos de erro de domínio — contratados nas specs Gherkin. */
export type RampErrorCode =
  | "no_provider_for_country"
  | "all_providers_failed"
  | "sandbox_quote_limit"
  | "insufficient_balance"
  | "identity_not_found"
  | "order_not_found"
  | "unsupported_fiat"
  | "not_implemented";

export class RampError extends Error {
  readonly code: RampErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: RampErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RampError";
    this.code = code;
    this.details = details;
  }
}

export const err = {
  noProviderForCountry: (country: string) =>
    new RampError(
      "no_provider_for_country",
      `Nenhum provider cobre o país ${country}`,
      { country },
    ),
  allProvidersFailed: (country: string, causes: unknown[]) =>
    new RampError(
      "all_providers_failed",
      `Todos os providers falharam para ${country}`,
      {
        country,
        causes,
      },
    ),
  sandboxQuoteLimit: (limit: string) =>
    new RampError(
      "sandbox_quote_limit",
      `Quote acima do limite da sandbox (${limit})`,
      { limit },
    ),
  insufficientBalance: (have: string, need: string) =>
    new RampError(
      "insufficient_balance",
      `Saldo insuficiente: tem ${have}, precisa ${need}`,
      {
        have,
        need,
      },
    ),
  identityNotFound: (pubkey: string, providerId: string) =>
    new RampError(
      "identity_not_found",
      `Identidade não encontrada para ${pubkey}@${providerId}`,
      {
        pubkey,
        providerId,
      },
    ),
  orderNotFound: (orderId: string) =>
    new RampError("order_not_found", `Ordem não encontrada: ${orderId}`, {
      orderId,
    }),
  notImplemented: (feature: string) =>
    new RampError(
      "not_implemented",
      `TDD fase red — implementação pendente: ${feature}`,
      { feature },
    ),
} as const;
