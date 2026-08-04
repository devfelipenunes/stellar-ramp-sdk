import { createSign, randomUUID } from "node:crypto";

export type EtherfuseEnvironment = "sandbox" | "prod";

export interface IdvLaunchOptions {
  environment?: EtherfuseEnvironment;

  orgId: string;

  privateKey: string;

  issuer: string;

  keyId: string;

  email: string;

  name: string;

  returnUrl?: string;

  scope?: string;

  target?: string;
}

export interface IdvLaunch {
  action: string;

  assertion: string;

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

const TOKEN_TTL_SECONDS = 5 * 60;

function base64Url(o: unknown): string {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}

export function createIdvLaunch(opts: IdvLaunchOptions): IdvLaunch {
  if (opts.returnUrl !== undefined && !/^https:\/\//.test(opts.returnUrl)) {
    throw new Error(
      "returnUrl must be an absolute https URL (avoid open redirect)",
    );
  }
  const env = opts.environment ?? "sandbox";
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: opts.keyId };
  const payload = {
    iss: opts.issuer,
    sub: opts.orgId,
    aud: TOKEN_AUDIENCE[env],
    scope: opts.scope ?? "verification",
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

export function buildIdvLaunchHtml(launch: IdvLaunch): string {
  const hidden = Object.entries(launch.form)
    .map(
      ([name, value]) =>
        `  <input type="hidden" name="${name}" value="${value}" />`,
    )
    .join("\n");
  return `<form id="idv-launch" method="POST" action="${launch.action}">\n${hidden}\n</form>\n<script>document.getElementById("idv-launch").submit()</script>`;
}
