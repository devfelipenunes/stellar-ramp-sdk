import { randomUUID } from "node:crypto";
import { YieldError } from "../domain/entities/errors";
import { div } from "../domain/lib/decimal";
import type { BondQuote } from "../domain/entities/position";
import type { Sep38Quote } from "../domain/entities/sep38";

export interface Sep38Config {
  /** USDC issuer on Stellar (sell_asset). */
  stablecoinIssuer: string;
  /** Stablebond issuer (buy_asset). */
  bondIssuer: string;
  quoteId?: string;
  /** Quote validity in seconds (default 60). */
  expiresInSeconds?: number;
}

/**
 * Converts a BondQuote (USDC → stablebond) into SEP-38 format.
 * Attacks the "open space" identified in the research: nobody exposes
 * SEP-38 quotes for stablebonds. Amounts use 7 decimal places (SEP-38 standard).
 */
export function toSep38Quote(
  bondQuote: BondQuote,
  cfg: Sep38Config,
): Sep38Quote {
  if (bondQuote.code === "USDC") {
    throw new YieldError(
      "invalid_sep38_pair",
      "pair must be USDC ↔ stablebond, not USDC ↔ USDC",
    );
  }
  if (!cfg.stablecoinIssuer || !cfg.bondIssuer) {
    throw new YieldError(
      "invalid_sep38_pair",
      "USDC and stablebond issuers are required",
    );
  }

  const price = div(bondQuote.usdcAmount, bondQuote.tokens);
  const expiresAt = new Date(
    Date.now() + (cfg.expiresInSeconds ?? 60) * 1000,
  ).toISOString();

  return {
    id: cfg.quoteId ?? randomUUID(),
    expires_at: expiresAt,
    sell_asset: `stellar:USDC:${cfg.stablecoinIssuer}`,
    buy_asset: `stellar:${bondQuote.code}:${cfg.bondIssuer}`,
    sell_amount: sep38Amount(bondQuote.usdcAmount),
    buy_amount: sep38Amount(bondQuote.tokens),
    fee: sep38Amount("0"),
    price: sep38Amount(price),
    total_price: sep38Amount(price),
    context: "sep38-quote",
  };
}

/** Formats to a fixed 7 decimal places (SEP-38 standard). */
export function sep38Amount(amount: string): string {
  const [int = "0", frac = ""] = amount.split(".");
  return `${int}.${frac.padEnd(7, "0").slice(0, 7)}`;
}
