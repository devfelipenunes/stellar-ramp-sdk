import { err } from "../domain/entities/errors";
import type { Quote, QuoteRequest } from "../domain/entities/quote";
import type { RampProvider } from "../domain/ports/ramp-provider";

/**
 * Router multi-anchor (ADR-002, spec router.feature).
 * Regra de domínio pura: filtra providers por país, consulta em paralelo,
 * escolhe o de MENOR CUSTO e faz failover quando um provider falha.
 */
export class Router {
  constructor(private readonly providers: RampProvider[]) {}

  async quote(req: QuoteRequest): Promise<Quote> {
    const candidates = this.providers.filter((p) =>
      p.countries.includes(req.country),
    );
    if (candidates.length === 0) throw err.noProviderForCountry(req.country);

    const settled = await Promise.allSettled(
      candidates.map((p) => p.quote(req)),
    );
    const fulfilled = settled
      .filter(
        (r): r is PromiseFulfilledResult<Quote> => r.status === "fulfilled",
      )
      .map((r) => r.value);
    const rejected = settled
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason);

    if (fulfilled.length === 0)
      throw err.allProvidersFailed(req.country, rejected);

    // Menor custo = menor feeBps (proxy simples de custo; evolui para custo total).
    fulfilled.sort((a, b) => a.feeBps - b.feeBps);
    return fulfilled[0]!;
  }
}
