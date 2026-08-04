import { err } from "../domain/entities/errors";
import type { Quote, QuoteRequest } from "../domain/entities/quote";
import type { RampProvider } from "../domain/ports/ramp-provider";

export class Router {
  constructor(private readonly providers: RampProvider[]) {}

  providersFor(country: QuoteRequest["country"]): RampProvider[] {
    return this.providers.filter((p) => p.countries.includes(country));
  }

  async quote(
    req: QuoteRequest,
    prepare?: (
      p: RampProvider,
      req: QuoteRequest,
    ) => Promise<QuoteRequest> | QuoteRequest,
  ): Promise<Quote> {
    const candidates = this.providersFor(req.country);
    if (candidates.length === 0) throw err.noProviderForCountry(req.country);

    const settled = await Promise.allSettled(
      candidates.map(async (p) => {
        const enriched = prepare ? await prepare(p, req) : req;
        return p.quote(enriched);
      }),
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

    fulfilled.sort((a, b) => a.feeBps - b.feeBps);
    return fulfilled[0]!;
  }
}
