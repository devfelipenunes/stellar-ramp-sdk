import { createHmac, timingSafeEqual } from "node:crypto";
import canonicalize from "canonicalize";

export interface SwapUpdatedEvent {
  orderId: string;
  customerId: string;
  status: string;
  sendTransaction?: string;
  sendTransactionHash?: string;
  receiveTransactionHash?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function verifyEtherfuseWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecretBase64: string,
): boolean {
  if (!signatureHeader) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }

  const canonical = canonicalize(parsed);
  if (!canonical) return false;

  const key = Buffer.from(webhookSecretBase64, "base64");
  const digest = createHmac("sha256", key).update(canonical).digest("hex");
  const expected = `sha256=${digest}`;

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseSwapUpdatedEvent(rawBody: string): SwapUpdatedEvent | null {
  const parsed = JSON.parse(rawBody) as Record<string, unknown>;
  const event = parsed.swap_updated as SwapUpdatedEvent | undefined;
  return event ?? null;
}
