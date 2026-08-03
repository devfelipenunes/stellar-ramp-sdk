/**
 * apps/demo — server HTTP fino que compõe SDK (Ramp) + Yield (Engine).
 *
 * Wire (ADR-003): PIX → [ramp.onramp] → USDC → [yield.autoPark] → TESOURO → rendendo
 *                gasto → [yield.liquidate JIT] → USDC → [ramp.offramp] → fiat
 *
 * Ramp/yield em modo "mock" (ADR-004/012). O NAV vem de duas fontes:
 *  - fonte local (mock, determinística) para o balance do demo
 *  - fonte REAL da Etherfuse (GET /lookup/stablebonds — público) no oráculo `/api/nav-live`
 *
 *   bun apps/demo/server.ts        # sobe o servidor
 *   createDemoServer(opts?)        # usado pelo teste E2E (apps/demo/tests)
 */
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import {
  createRamp,
  InMemoryIdentityStore,
} from "../../packages/sdk/src/index";
import {
  createEtherfuseNavSource,
  createNavOracle,
  createYieldEngine,
  MockStablebondProvider,
  type NavSource,
} from "../../packages/yield/src/index";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALLOCATION: Record<string, string> = {
  BR: "TESOURO",
  MX: "CETES",
  US: "USTRY",
};
const DEMO_PUBKEY = "G-DEMO-USER";
const USDC_ASSET =
  "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"; // testnet

/** NAVs de referência da pesquisa — fontes locais do oráculo (ADR-012). */
const FALLBACK_NAV: Record<string, string> = {
  TESOURO: "1.23677",
  CETES: "1.174751",
  USTRY: "1.07127",
};
const mockNav = (id: string): NavSource => ({
  id,
  getNav: async (code) => ({
    code,
    nav: FALLBACK_NAV[code] ?? "1",
    updatedAt: new Date().toISOString(),
  }),
});

export interface DemoOptions {
  /** Fonte de NAV do oráculo. Default: Etherfuse real (público). Injetável p/ testes. */
  navSource?: NavSource;
}

/** Cria o server do demo (testável). Estado isolado por chamada. */
export function createDemoServer(opts: DemoOptions = {}): Server {
  const bondsProvider = new MockStablebondProvider();
  const ramp = createRamp({
    mode: "mock",
    providers: [],
    identityStore: new InMemoryIdentityStore(),
  });
  const yields = createYieldEngine({
    mode: "mock",
    provider: bondsProvider,
    allocation: ALLOCATION,
  });

  const navSource = opts.navSource ?? createEtherfuseNavSource();
  const navOracle = createNavOracle([
    navSource,
    mockNav("oracle-agg"),
    mockNav("defi-lens"),
  ]);

  let userCountry = "BR";

  async function doIn(body: { fiat: string; amount: string; country: string }) {
    userCountry = body.country;
    const quote = await ramp.quote({
      direction: "onramp",
      country: body.country,
      fiat: body.fiat,
      fiatAmount: body.amount,
    });
    const order = await ramp.onramp({ quote, pubkey: DEMO_PUBKEY });
    const position = await yields.autoPark({
      usdcAmount: quote.usdcAmount,
      country: body.country,
    });
    return { quote, order, position };
  }

  async function doBalance() {
    return {
      userCountry,
      balances: await yields.balance(),
      navs: bondsProvider.bonds,
    };
  }

  async function doSpend(body: { usdcAmount: string }) {
    const code = ALLOCATION[userCountry] ?? "TESOURO";
    const fiat = userCountry === "MX" ? "MXN" : "BRL";
    const liquidatedUsdc = await yields.liquidate({
      code,
      usdcAmount: body.usdcAmount,
    });
    const qOut = await ramp.quote({
      direction: "offramp",
      country: userCountry,
      fiat,
      usdcAmount: liquidatedUsdc,
    });
    const out = await ramp.offramp({
      quote: qOut,
      pubkey: DEMO_PUBKEY,
      usdcAsset: USDC_ASSET,
    });
    return { liquidatedUsdc, out };
  }

  async function doNavLive() {
    const out: Record<string, unknown> = {};
    for (const code of ["TESOURO", "CETES", "USTRY"]) {
      try {
        out[code] = await navOracle.getNav(code);
      } catch (e) {
        out[code] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    return out;
  }

  function json(
    res: import("node:http").ServerResponse,
    status: number,
    data: unknown,
  ) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(data, null, 2));
  }

  async function readBody(
    req: import("node:http").IncomingMessage,
  ): Promise<any> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const text = Buffer.concat(chunks).toString("utf-8");
    return text ? JSON.parse(text) : {};
  }

  return createServer(async (req, res) => {
    try {
      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`,
      );

      if (req.method === "GET" && url.pathname === "/") {
        const html = await readFile(
          join(__dirname, "public", "index.html"),
          "utf-8",
        );
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        json(res, 200, {
          ok: true,
          mode: "mock",
          tracks: ["sdk-ramp", "yield-engine"],
          navs: bondsProvider.bonds,
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/nav-live") {
        json(res, 200, await doNavLive());
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/in") {
        json(res, 200, await doIn(await readBody(req)));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/balance") {
        json(res, 200, await doBalance());
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/spend") {
        json(res, 200, await doSpend(await readBody(req)));
        return;
      }
      json(res, 404, { error: "not found" });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
}

// Entry point: sobe o servidor quando executado diretamente (bun/node).
const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const PORT = Number(process.env.PORT ?? 8787);
  createDemoServer().listen(PORT, () => {
    console.log(`⭐ stellar-ramp demo em http://localhost:${PORT}`);
    console.log(
      `   fluxo: PIX → USDC → TESOURO (${ALLOCATION["BR"]}) → rendendo → gasto JIT`,
    );
    console.log(`   NAV real da Etherfuse (público): /api/nav-live`);
  });
}
