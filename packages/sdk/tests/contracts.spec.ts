import { describe, expect, it } from "vitest";
import { err, RampError } from "../src/domain/entities/errors";
import { isSimulatable } from "../src/domain/ports/ramp-provider";
import type { Quote } from "../src/domain/entities/quote";
import { makeProvider } from "./fixtures";

describe("entities — shapes (SDD contracts)", () => {
  it("Quote possui todos os campos contratados na spec quote.feature", () => {
    const quote: Quote = {
      quoteId: "quote-1",
      providerId: "etherfuse",
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "1000",
      usdcAmount: "118.20",
      feeBps: 25,
      fee: "0.25",
      createdAt: "2026-08-03T00:00:00.000Z",
    };
    expect(quote.providerId).toBe("etherfuse");
    expect(quote.feeBps).toBeGreaterThanOrEqual(0);
    expect(Number(quote.usdcAmount)).toBeGreaterThan(0);
  });

  it("RampError carrega code + details para diagnóstico (spec router)", () => {
    const e = err.noProviderForCountry("AR");
    expect(e).toBeInstanceOf(RampError);
    expect(e.code).toBe("no_provider_for_country");
    expect(e.details).toMatchObject({ country: "AR" });
  });

  it("errors de domínio contratados existem", () => {
    expect(err.allProvidersFailed("BR", [new Error("x")]).code).toBe(
      "all_providers_failed",
    );
    expect(err.sandboxQuoteLimit("500 MXN").code).toBe("sandbox_quote_limit");
    expect(err.insufficientBalance("50", "200").code).toBe(
      "insufficient_balance",
    );
    expect(err.notImplemented("quote").code).toBe("not_implemented");
  });

  it("isSimulatable detecta o hook de sandbox (fiat_received)", () => {
    const semHook = makeProvider("etherfuse", ["MX"]);
    expect(isSimulatable(semHook)).toBe(false);

    const comHook = makeProvider("etherfuse", ["MX"]) as typeof semHook & {
      simulateFiatDeposit(): Promise<unknown>;
    };
    comHook.simulateFiatDeposit = async () => ({ status: "funded" });
    expect(isSimulatable(comHook)).toBe(true);
  });
});
