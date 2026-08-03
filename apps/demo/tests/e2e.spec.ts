import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createDemoServer } from "../server";
import type { NavSource } from "../../../packages/yield/src/index";

/**
 * Fonte de NAV fixa injetada no demo — mantém o E2E determinístico
 * (o runtime usa a fonte REAL da Etherfuse).
 */
const fakeNavSource: NavSource = {
  id: "etherfuse",
  getNav: async (code) => ({
    code,
    nav:
      code === "TESOURO"
        ? "1.236815"
        : code === "CETES"
          ? "1.174769"
          : "1.071279",
    updatedAt: "2026-08-03T00:00:00.000Z",
  }),
};

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createDemoServer({ navSource: fakeNavSource }).listen(0);
  await new Promise<void>((resolve) =>
    server.once("listening", () => resolve()),
  );
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("sem endereço");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

/**
 * E2E do demo — prova o fluxo completo em modo mock, via HTTP real.
 */
describe("apps/demo — E2E (PIX → USDC → TESOURO → rendendo → gasto JIT)", () => {
  it("status revela as duas tracks e os NAVs", async () => {
    const res = await fetch(`${baseUrl}/api/status`).then((r) => r.json());

    expect(res.ok).toBe(true);
    expect(res.tracks).toEqual(["sdk-ramp", "yield-engine"]);
    expect(res.navs.some((n: { code: string }) => n.code === "TESOURO")).toBe(
      true,
    );
  });

  it("depósito fiat→USDC→TESOURO + saldo rendendo (tokens × NAV)", async () => {
    const inRes = await post("/api/in", {
      fiat: "BRL",
      amount: "100",
      country: "BR",
    });

    expect(inRes.position.code).toBe("TESOURO");
    expect(Number(inRes.position.fiatValue)).toBeGreaterThan(0);

    const bal = await fetch(`${baseUrl}/api/balance`).then((r) => r.json());
    expect(bal.balances).toHaveLength(1);
    const [p] = bal.balances;
    expect(p.code).toBe("TESOURO");
    expect(
      Math.abs(Number(p.tokens) * Number(p.nav) - Number(p.fiatValue)),
    ).toBeLessThan(0.01);
  });

  it("gasto JIT liquida e sai via offramp com burn", async () => {
    await post("/api/in", { fiat: "BRL", amount: "100", country: "BR" });
    const spend = await post("/api/spend", { usdcAmount: "20" });

    expect(Number(spend.liquidatedUsdc)).toBeGreaterThan(0);
    expect(spend.out.direction).toBe("offramp");
    expect(spend.out.burnTransaction?.envelopeXdr).toBeTruthy();
  });

  it("oráculo de NAV mediana as 3 fontes (real injetada + 2 locais) sem outliers", async () => {
    const res = await fetch(`${baseUrl}/api/nav-live`).then((r) => r.json());

    // mediana de [real 1.236815, local 1.23677, local 1.23677] = 1.23677
    expect(res.TESOURO.nav.nav).toBe("1.23677");
    expect(res.CETES.nav.nav).toBe("1.174751");
    expect(res.USTRY.nav.nav).toBe("1.07127");
    expect(res.TESOURO.outliers).toEqual([]);
    expect(res.TESOURO.sourcesUsed).toHaveLength(3);
  });

  it("GET / serve a dashboard", async () => {
    const html = await fetch(`${baseUrl}/`).then((r) => r.text());

    expect(html).toContain("stellar-ramp");
    expect(html).toContain("autoPark");
    expect(html).toContain("NAV real da Etherfuse");
  });
});
