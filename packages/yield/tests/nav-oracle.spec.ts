import { describe, expect, it, vi } from "vitest";
import { createNavOracle } from "../src/application/nav-oracle";
import type { NavSource } from "../src/domain/ports/nav-source";

const fonte = (id: string, nav: string, fail = false): NavSource => ({
  id,
  getNav: vi.fn(async () => {
    if (fail) throw new Error(`[${id}] fora do ar`);
    return { code: "USTRY", nav, updatedAt: "2026-08-03T00:00:00.000Z" };
  }),
});

/**
 * TDD — spec nav-oracle.feature (ADR-010: lição do exploit da Blend fev/2026).
 */
describe("NAV oracle multi-fonte (ADR-010)", () => {
  it("descarta fonte com NAV anômalo (outlier) e usa a mediana das honestas", async () => {
    const oracle = createNavOracle([
      fonte("a", "1.07127"),
      fonte("b", "1.07130"),
      fonte("maliciosa", "106.74"), // a anomalia do exploit (USTRY $1,06 → $106,74)
    ]);

    const res = await oracle.getNav("USTRY");

    expect(Math.abs(Number(res.nav.nav) - 1.07128)).toBeLessThan(0.001);
    expect(res.outliers).toContain("maliciosa");
    expect(res.sourcesUsed).not.toContain("maliciosa");
  });

  it("com 2 fontes usa a mediana", async () => {
    const res = await createNavOracle([
      fonte("a", "1.07127"),
      fonte("b", "1.07127"),
    ]).getNav("USTRY");
    expect(res.nav.nav).toBe("1.07127");
  });

  it("fonte fora do ar não derruba o oráculo", async () => {
    const res = await createNavOracle([
      fonte("a", "1.07127"),
      fonte("b", "1.07127", true),
    ]).getNav("USTRY");
    expect(res.sourcesUsed).toContain("a");
    expect(res.sourcesUsed).not.toContain("b");
    expect(res.nav.nav).toBe("1.07127");
  });

  it("sem nenhuma fonte disponível falha com no_nav_source_available", async () => {
    await expect(
      createNavOracle([fonte("a", "1", true)]).getNav("USTRY"),
    ).rejects.toMatchObject({
      code: "no_nav_source_available",
    });
  });
});
