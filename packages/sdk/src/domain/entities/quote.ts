import type { CountryCode } from "./country";
import type { Amount, FiatCode } from "./money";

export type QuoteDirection = "onramp" | "offramp";

export interface QuoteRequest {
  direction: QuoteDirection;
  /** País do usuário — driver de seleção de provider (ADR-002). */
  country: CountryCode;
  fiat: FiatCode;
  /**
   * onramp: quanto de fiat o usuário manda (obrigatório).
   * offramp: ignorado (usa `usdcAmount`).
   */
  fiatAmount?: Amount;
  /**
   * offramp: quanto de USDC o usuário envia (obrigatório).
   * onramp: ignorado.
   */
  usdcAmount?: Amount;
}

export interface Quote {
  providerId: string;
  direction: QuoteDirection;
  country: CountryCode;
  fiat: FiatCode;
  /** Montante fiat envolvido (in no onramp, out no offramp). */
  fiatAmount: Amount;
  /** Montante USDC envolvido (out no onramp, in no offramp). */
  usdcAmount: Amount;
  /** Taxa em pontos base (0.25% = 25). */
  feeBps: number;
  /** Fee na moeda da perna de entrada (fiat no onramp, USDC no offramp). */
  fee: Amount;
  createdAt: string; // ISO 8601
}
