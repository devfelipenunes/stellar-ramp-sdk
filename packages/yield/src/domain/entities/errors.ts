/** Códigos de erro de domínio do Yield — contratados nas specs Gherkin. */
export type YieldErrorCode =
  | "no_allocation_for_country"
  | "unsupported_bond"
  | "no_nav_source_available"
  | "invalid_sep38_pair"
  | "not_implemented";

export class YieldError extends Error {
  readonly code: YieldErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: YieldErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "YieldError";
    this.code = code;
    this.details = details;
  }
}

export const yerr = {
  noAllocationForCountry: (country: string) =>
    new YieldError(
      "no_allocation_for_country",
      `Nenhuma alocação de stablebond para ${country}`,
      {
        country,
      },
    ),
  unsupportedBond: (code: string) =>
    new YieldError("unsupported_bond", `Stablebond não suportado: ${code}`, {
      code,
    }),
  noNavSourceAvailable: (code: string) =>
    new YieldError(
      "no_nav_source_available",
      `Nenhuma fonte de NAV disponível para ${code}`,
      { code },
    ),
  invalidSep38Pair: (reason: string) =>
    new YieldError("invalid_sep38_pair", `Par SEP-38 inválido: ${reason}`, {
      reason,
    }),
  notImplemented: (feature: string) =>
    new YieldError(
      "not_implemented",
      `TDD fase red — implementação pendente: ${feature}`,
      { feature },
    ),
} as const;
