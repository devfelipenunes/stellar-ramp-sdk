
import { createServer, type Server } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
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
  "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

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

  navSource?: NavSource;
}

export function createDemoServer(opts: DemoOptions = {}): Server {

  const realIss = process.env.EF_ISS;
  const privPath =
    process.env.EF_PRIVATE_KEY_PATH ?? "secrets/etherfuse/jwtRS256.key";
  const jwksPath = process.env.EF_JWKS_PATH ?? "secrets/etherfuse/jwks.json";
  let privateKey: string | null = null;
  let jwksJson: string | null = null;
  if (realIss) {
    try {
      privateKey = readFileSync(join(process.cwd(), privPath), "utf8");
      jwksJson = readFileSync(join(process.cwd(), jwksPath), "utf8");
    } catch {

    }
  }
  if (!privateKey) {
    privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  }
  const idvIssuer = realIss ?? "demo-issuer";
  const idvKid = realIss
    ? (process.env.EF_KID ?? "5ab266e5-0287-460a-98c6-8dda93a1cac9")
    : "demo-key";
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

  let kycStatus: "none" | "pending" | "approved" = "none";

  const str = (b: Record<string, unknown>, k: string): string =>
    String(b[k] ?? "");

  async function doIn(body: Record<string, unknown>) {
    const fiat = str(body, "fiat");
    const amount = str(body, "amount");
    const country = str(body, "country") || "BR";
    userCountry = country;
    const quote = await ramp.quote({
      direction: "onramp",
      country,
      fiat,
      fiatAmount: amount,
    });
    const order = await ramp.onramp({ quote, pubkey: DEMO_PUBKEY });
    const position = await yields.autoPark({
      usdcAmount: quote.usdcAmount,
      country,
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

  async function doSpend(body: Record<string, unknown>) {
    const code = ALLOCATION[userCountry] ?? "TESOURO";
    const fiat = userCountry === "MX" ? "MXN" : "BRL";
    const liquidatedUsdc = await yields.liquidate({
      code,
      usdcAmount: str(body, "usdcAmount"),
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
  ): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const text = Buffer.concat(chunks).toString("utf-8");
    if (!text) return {};
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  }

  return createServer(async (req, res) => {
    try {
      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`,
      );

      if (req.method === "GET" && url.pathname === "/") {

        if (url.searchParams.get("kyc") === "ok") kycStatus = "approved";
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
          kyc: { status: kycStatus, compliant: kycStatus === "approved" },
          navs: bondsProvider.bonds,
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/jwks.json") {

        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(jwksJson ?? JSON.stringify({ keys: [] }));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/idv-launch") {

        if (kycStatus === "approved") {
          json(res, 200, { status: "approved", compliant: true });
          return;
        }

        const returnUrl = `${url.origin}/?kyc=ok`.replace(
          /^http:\/\//,
          "https://",
        );
        const launch = createIdvLaunch({
          orgId: DEMO_PUBKEY,
          privateKey,
          issuer: idvIssuer,
          keyId: idvKid,
          email: "demo@example.com",
          name: "Demo User",
          environment: "sandbox",
          returnUrl,
        });
        kycStatus = "pending";
        json(res, 200, {
          status: "pending",
          compliant: false,
          action: launch.action,
          form: launch.form,
          html: buildIdvLaunchHtml(launch),
          note: "demo — em prod, use a chave privada do app + iss registrado na Etherfuse",
        });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/kyc/complete") {

        kycStatus = "approved";
        json(res, 200, {
          status: "approved",
          compliant: true,
          note: "simula o webhook kyc_updated (status approved) — conta compliant",
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/nav-live") {
        json(res, 200, await doNavLive());
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/in") {

        if (kycStatus !== "approved") {
          json(res, 409, {
            error: "kyc_required",
            message:
              "Complete o WebSDK /idv para a conta ficar compliant antes de fechar a ordem.",
          });
          return;
        }
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
