import { describe, expect, it } from "vitest";
import { sep38Amount, toSep38Quote } from "../src/application/sep38-quote";
import type { BondQuote } from "../src/domain/entities/position";

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const BOND_ISSUER = "GCRYUGD5NVARGXT56XEZI5CIFCQETYHAPQQTHO2O3IQZTHDH4LATMYWC";

const quote: BondQuote = {
  code: "TESOURO",
  usdcAmount: "100",
  tokens: "80.451498657",
  nav: "1.23677",
  fiatValue: "99.499999995",
  fiat: "BRL",
};

/**
 * TDD — SEP-38 para stablebonds ("espaço aberto" da pesquisa).
 */
describe("SEP-38 quotes para stablebonds", () => {
  it("converte BondQuote para o formato SEP-38", () => {
    const q = toSep38Quote(quote, {
      stablecoinIssuer: USDC_ISSUER,
      bondIssuer: BOND_ISSUER,
    });

    expect(q.sell_asset).toBe(`stellar:USDC:${USDC_ISSUER}`);
    expect(q.buy_asset).toBe(`stellar:TESOURO:${BOND_ISSUER}`);
    expect(q.sell_amount).toBe("100.0000000"); // 7 casas
    expect(q.buy_amount).toBe("80.4514986");
    expect(q.expires_at).toBeTruthy();
    expect(q.context).toBe("sep38-quote");
    // price = usdc / tokens
    expect(Math.abs(Number(q.price) - 100 / 80.451498657)).toBeLessThan(0.001);
  });

  it("valida que o pair é USDC ↔ stablebond (nunca USDC ↔ USDC)", () => {
    expect(() =>
      toSep38Quote(
        { ...quote, code: "USDC" },
        { stablecoinIssuer: "X", bondIssuer: "Y" },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_sep38_pair" }));
  });

  it("exige issuers configurados", () => {
    expect(() =>
      toSep38Quote(quote, { stablecoinIssuer: "", bondIssuer: "" }),
    ).toThrowError(expect.objectContaining({ code: "invalid_sep38_pair" }));
  });

  it("sep38Amount formata 7 casas decimais (padrão SEP-38)", () => {
    expect(sep38Amount("1.23677")).toBe("1.2367700");
    expect(sep38Amount("18.09090909")).toBe("18.0909090");
    expect(sep38Amount("100")).toBe("100.0000000");
  });
});
