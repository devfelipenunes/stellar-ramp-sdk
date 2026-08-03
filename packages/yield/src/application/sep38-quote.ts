import { randomUUID } from "node:crypto";
import { YieldError } from "../domain/entities/errors";
import { div } from "../domain/lib/decimal";
import type { BondQuote } from "../domain/entities/position";
import type { Sep38Quote } from "../domain/entities/sep38";

export interface Sep38Config {
  /** Issuer do USDC no Stellar (sell_asset). */
  stablecoinIssuer: string;
  /** Issuer do stablebond (buy_asset). */
  bondIssuer: string;
  quoteId?: string;
  /** Validade da quote em segundos (default 60). */
  expiresInSeconds?: number;
}

/**
 * Converte uma BondQuote (USDC → stablebond) para o formato SEP-38.
 * Ataca o "espaço aberto" identificado na pesquisa: ninguém expõe quotes
 * SEP-38 de stablebond. Amounts com 7 casas decimais (padrão SEP-38).
 */
export function toSep38Quote(
  bondQuote: BondQuote,
  cfg: Sep38Config,
): Sep38Quote {
  if (bondQuote.code === "USDC") {
    throw new YieldError(
      "invalid_sep38_pair",
      "pair deve ser USDC ↔ stablebond, não USDC ↔ USDC",
    );
  }
  if (!cfg.stablecoinIssuer || !cfg.bondIssuer) {
    throw new YieldError(
      "invalid_sep38_pair",
      "issuers de USDC e do stablebond são obrigatórios",
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

/** Formata para 7 casas decimais fixas (padrão SEP-38). */
export function sep38Amount(amount: string): string {
  const [int = "0", frac = ""] = amount.split(".");
  return `${int}.${frac.padEnd(7, "0").slice(0, 7)}`;
}
