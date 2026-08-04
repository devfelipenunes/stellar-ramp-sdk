import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createDemoServer } from "../server";
import type { NavSource } from "../../../packages/yield/src/index";

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

describe("apps/demo — E2E (KYC /idv → PIX → USDC → TESOURO → rendendo → gasto JIT)", () => {
  it("status revela as duas tracks, os NAVs e o estado KYC inicial", async () => {
    const res = await fetch(`${baseUrl}/api/status`).then((r) => r.json());

    expect(res.ok).toBe(true);
    expect(res.tracks).toEqual(["sdk-ramp", "yield-engine"]);
    expect(res.kyc.status).toBe("none");
    expect(res.kyc.compliant).toBe(false);
    expect(res.navs.some((n: { code: string }) => n.code === "TESOURO")).toBe(
      true,
    );
  });

  it("depósito é bloqueado antes do /idv (kyc_required — mesmo contrato do live)", async () => {
    const r = await fetch(`${baseUrl}/api/in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiat: "BRL", amount: "100", country: "BR" }),
    });

    expect(r.status).toBe(409);
    const res = await r.json();
    expect(res.error).toBe("kyc_required");
  });

  it("launch /idv emite o form do WebSDK e marca pending", async () => {
    const res = await fetch(`${baseUrl}/api/idv-launch`).then((r) => r.json());

    expect(res.status).toBe("pending");
    expect(res.compliant).toBe(false);
    expect(res.action).toContain("sandbox.etherfuse.com/auth/launch");
    expect(res.form.grant_type).toContain("jwt-bearer");
    expect(res.form.target).toBe("/idv");

    expect(res.form.assertion.split(".")).toHaveLength(3);
    expect(res.html).toContain("idv-launch");

    const st = await fetch(`${baseUrl}/api/status`).then((r) => r.json());
    expect(st.kyc.status).toBe("pending");
  });

  it("?kyc=ok (returnUrl do widget) marca a conta approved/compliant", async () => {
    await fetch(`${baseUrl}/?kyc=ok`);

    const st = await fetch(`${baseUrl}/api/status`).then((r) => r.json());
    expect(st.kyc.status).toBe("approved");
    expect(st.kyc.compliant).toBe(true);
  });

  it("POST /api/kyc/complete simula o webhook kyc_updated (idempotente)", async () => {
    const res = await post("/api/kyc/complete", {});

    expect(res.status).toBe("approved");
    expect(res.compliant).toBe(true);

    const st = await fetch(`${baseUrl}/api/status`).then((r) => r.json());
    expect(st.kyc.status).toBe("approved");
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

    expect(res.TESOURO.nav.nav).toBe("1.23677");
    expect(res.CETES.nav.nav).toBe("1.174751");
    expect(res.USTRY.nav.nav).toBe("1.07127");
    expect(res.TESOURO.outliers).toEqual([]);
    expect(res.TESOURO.sourcesUsed).toHaveLength(3);
  });

  it("GET / serve a dashboard com o card de KYC /idv", async () => {
    const html = await fetch(`${baseUrl}/`).then((r) => r.text());

    expect(html).toContain("stellar-ramp");
    expect(html).toContain("autoPark");
    expect(html).toContain("NAV real da Etherfuse");
    expect(html).toContain("/idv");
    expect(html).toContain("kyc-badge");
  });
});
