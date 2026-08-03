import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createDemoServer } from "../server";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createDemoServer().listen(0);
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

  it("GET / serve a dashboard", async () => {
    const html = await fetch(`${baseUrl}/`).then((r) => r.text());

    expect(html).toContain("stellar-ramp");
    expect(html).toContain("autoPark");
  });
});
