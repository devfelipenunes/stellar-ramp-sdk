/**
 * apps/demo — thin HTTP server composing SDK (Ramp) + Yield (Engine).
 *
 * Wire (ADR-003): PIX → [ramp.onramp] → USDC → [yield.autoPark] → TESOURO → yielding
 *                 spend → [yield.liquidate JIT] → USDC → [ramp.offramp] → fiat
 *
 * Ramp/yield in "mock" mode (ADR-004/012). NAV comes from two sources:
 *  - local (mock, deterministic) source for the demo balance
 *  - REAL Etherfuse source (GET /lookup/stablebonds — public) in the `/api/nav-live` oracle
 *
 *   bun apps/demo/server.ts        # starts the server
 *   createDemoServer(opts?)        # used by the E2E test (apps/demo/tests)
 */
import { createServer, type Server } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import {
  buildIdvLaunchHtml,
  createIdvLaunch,
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

/** Reference NAVs from the research — oracle local sources (ADR-012). */
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
  /** NAV source for the oracle. Default: real Etherfuse (public). Injectable for tests. */
  navSource?: NavSource;
}

/** Creates the demo server (testable). State isolated per call. */
export function createDemoServer(opts: DemoOptions = {}): Server {
  // Demo-only RSA key for the /idv launch example. A real app keeps its own
  // private key server-side (registered `iss` + JWKS with Etherfuse).
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
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
      if (req.method === "GET" && url.pathname === "/api/idv-launch") {
        // Example of the /idv WebSDK link: signs a verification JWT and returns
        // the /auth/launch form. In prod, orgId = the organizationId returned by
        // createCustomer, and the private key is the app's (registered iss+JWKS).
        const launch = createIdvLaunch({
          orgId: DEMO_PUBKEY,
          privateKey,
          issuer: "demo-issuer",
          keyId: "demo-key",
          email: "demo@example.com",
          name: "Demo User",
          environment: "sandbox",
          returnUrl: `${url.origin}/?kyc=ok`,
        });
        json(res, 200, {
          action: launch.action,
          form: launch.form,
          html: buildIdvLaunchHtml(launch),
          note: "demo — em prod, use a chave privada do app + iss registrado na Etherfuse",
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

// Entry point: starts the server when executed directly (bun/node).
const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const PORT = Number(process.env.PORT ?? 8787);
  createDemoServer().listen(PORT, () => {
    console.log(`⭐ stellar-ramp demo at http://localhost:${PORT}`);
    console.log(
      `   flow: PIX → USDC → TESOURO (${ALLOCATION["BR"]}) → earning → JIT spend`,
    );
    console.log(`   real Etherfuse NAV (public): /api/nav-live`);
  });
}
