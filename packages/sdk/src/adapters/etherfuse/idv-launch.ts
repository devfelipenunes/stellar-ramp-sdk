/**
 * Hosted identity verification (/idv) — the app-side link that completes the
 * onboarding. The SDK covers the programmatic part (org, KYC data, bank
 * account, quote, order); the /idv steps (email confirmation, selfie, customer
 * agreement) have NO API and are done by the end user in the Etherfuse widget.
 *
 * The app signs a short-lived RS256 JWT (sub = the organizationId that
 * createCustomer generated) and posts it to /auth/launch — this redirects the
 * user into /idv. In the sandbox the verification auto-approves and a
 * `kyc_updated` webhook fires with status "approved"; only then the bank
 * account becomes compliant and orders close.
 *
 * Reference: docs.etherfuse.com/guides/kyc-websdk + jwt-authentication.
 * Uses only node:crypto — no external JWT dependency.
 */
import { createSign, randomUUID } from "node:crypto";

export type EtherfuseEnvironment = "sandbox" | "prod";

export interface IdvLaunchOptions {
  environment?: EtherfuseEnvironment;
  /**
   * The organizationId returned by createCustomer (ADR-005). The JWT `sub`
   * MUST equal this id — any other sub registers a brand-new person and the
   * verification won't attach to your customer.
   */
  orgId: string;
  /** RSA private key (PEM) used to sign the JWT (RS256). */
  privateKey: string;
  /**
   * Your registered issuer (`iss`) with Etherfuse (registered 1× with the team).
   * MUST be an absolute URL — the server parses `iss` as a URL and rejects a
   * bare string with "relative URL without a base".
   */
  issuer: string;
  /** Key id (`kid`) — must match an entry in your published JWKS. */
  keyId: string;
  /** User's email — the address they confirm during verification. */
  email: string;
  /** User's full name. */
  name: string;
  /** Where to send the user back when they leave /idv. */
  returnUrl?: string;
  /** Launch scope. Default "idv". */
  scope?: string;
  /** Launch target path. Default "/idv". */
  target?: string;
}

export interface IdvLaunch {
  /** Launch host URL (the form `action` for POST /auth/launch). */
  action: string;
  /** The signed JWT to send as `assertion`. */
  assertion: string;
  /** Form fields: grant_type, assertion, target, return_url. */
  form: Record<string, string>;
}

const LAUNCH_HOST = {
  sandbox: "https://sandbox.etherfuse.com/auth/launch",
  prod: "https://app.etherfuse.com/auth/launch",
} as const;

const TOKEN_AUDIENCE = {
  sandbox: "https://api.sand.etherfuse.com/auth/token",
  prod: "https://api.etherfuse.com/auth/token",
} as const;

const TOKEN_TTL_SECONDS = 5 * 60; // short-lived (~5 min, per docs)

function base64Url(o: unknown): string {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}

/**
 * Signs a verification-scoped JWT and returns the /auth/launch form fields.
 * The app should POST the form (top-level navigation or iframe) to send the
 * user into the /idv widget.
 */
export function createIdvLaunch(opts: IdvLaunchOptions): IdvLaunch {
  const env = opts.environment ?? "sandbox";
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: opts.keyId };
  const payload = {
    iss: opts.issuer,
    sub: opts.orgId,
    aud: TOKEN_AUDIENCE[env],
    scope: opts.scope ?? "idv",
    jti: randomUUID(),
    email: opts.email,
    name: opts.name,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const signingInput = `${base64Url(header)}.${base64Url(payload)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const assertion = `${signingInput}.${signer.sign(opts.privateKey, "base64url")}`;

  const form: Record<string, string> = {
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
    target: opts.target ?? "/idv",
  };
  if (opts.returnUrl) form.return_url = opts.returnUrl;

  return {
    action: LAUNCH_HOST[env],
    assertion,
    form,
  };
}

/**
 * Builds a self-submitting HTML form for the /idv launch — useful as a quick
 * server-rendered redirect. In an iframe, add `allow="camera *; microphone *"`.
 */
export function buildIdvLaunchHtml(launch: IdvLaunch): string {
  const hidden = Object.entries(launch.form)
    .map(
      ([name, value]) =>
        `  <input type="hidden" name="${name}" value="${value}" />`,
    )
    .join("\n");
  return `<form id="idv-launch" method="POST" action="${launch.action}">\n${hidden}\n</form>\n<script>document.getElementById("idv-launch").submit()</script>`;
}
