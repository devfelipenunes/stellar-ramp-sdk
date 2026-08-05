import { createHmac } from "node:crypto";
import canonicalize from "canonicalize";
import { describe, expect, it } from "vitest";
import {
  parseSwapUpdatedEvent,
  verifyEtherfuseWebhookSignature,
} from "../src/adapters/etherfuse/webhook";

const SECRET_B64 = Buffer.from("test-webhook-secret").toString("base64");

function sign(body: unknown): string {
  const canonical = canonicalize(body)!;
  const digest = createHmac("sha256", Buffer.from(SECRET_B64, "base64"))
    .update(canonical)
    .digest("hex");
  return `sha256=${digest}`;
}

const REAL_PENDING_EVENT = {
  swap_updated: {
    createdAt: "2026-08-03T21:11:38.848512Z",
    customerId: "8c200036-ed1d-4455-8977-d2efb4aa1416",
    orderId: "c8665236-919c-4402-acbc-aa280dc8d03b",
    receiveTransactionHash: null,
    sendTransaction: "AAAAAgAAAABTJqMHmr8uKrlPjl4UgsCAHLjrqEm5HhhBhv8v",
    sendTransactionHash:
      "00985a5985f20fd2ab78576ae729f1f5d19c7eeebfe0c7c6a4bc779e5e8c310f",
    status: "pending",
    updatedAt: "2026-08-03T21:11:39.269291Z",
  },
};

const NO_TX_EVENT = {
  swap_updated: {
    ...REAL_PENDING_EVENT.swap_updated,
    sendTransaction: undefined,
    status: "created",
  },
};

describe("verifyEtherfuseWebhookSignature", () => {
  it("aceita uma assinatura válida", () => {
    const body = JSON.stringify(REAL_PENDING_EVENT);
    expect(
      verifyEtherfuseWebhookSignature(body, sign(REAL_PENDING_EVENT), SECRET_B64),
    ).toBe(true);
  });

  it("rejeita assinatura incorreta", () => {
    const body = JSON.stringify(REAL_PENDING_EVENT);
    expect(
      verifyEtherfuseWebhookSignature(
        body,
        "sha256=" + "0".repeat(64),
        SECRET_B64,
      ),
    ).toBe(false);
  });

  it("rejeita header ausente", () => {
    const body = JSON.stringify(REAL_PENDING_EVENT);
    expect(verifyEtherfuseWebhookSignature(body, null, SECRET_B64)).toBe(false);
  });

  it("rejeita JSON malformado", () => {
    expect(
      verifyEtherfuseWebhookSignature("{not json", "sha256=abc", SECRET_B64),
    ).toBe(false);
  });

  it("assinatura calculada sobre o body cru (fora de ordem, não canonicalizado) é rejeitada", () => {
    const outOfOrder = { status: "pending", orderId: "z-1", createdAt: "t" };
    const rawJson = JSON.stringify(outOfOrder);
    const digest = createHmac("sha256", Buffer.from(SECRET_B64, "base64"))
      .update(rawJson)
      .digest("hex");

    expect(canonicalize(outOfOrder)).not.toBe(rawJson);
    expect(
      verifyEtherfuseWebhookSignature(rawJson, `sha256=${digest}`, SECRET_B64),
    ).toBe(false);
    expect(
      verifyEtherfuseWebhookSignature(rawJson, sign(outOfOrder), SECRET_B64),
    ).toBe(true);
  });
});

describe("parseSwapUpdatedEvent", () => {
  it("extrai o evento de dentro da chave swap_updated (não é campo eventType)", () => {
    const parsed = parseSwapUpdatedEvent(JSON.stringify(REAL_PENDING_EVENT));
    expect(parsed?.orderId).toBe("c8665236-919c-4402-acbc-aa280dc8d03b");
    expect(parsed?.status).toBe("pending");
    expect(parsed?.sendTransaction).toContain("AAAAAgAAAABTJqMHmr");
  });

  it("devolve null para um payload sem swap_updated", () => {
    expect(
      parseSwapUpdatedEvent(JSON.stringify({ order_updated: {} })),
    ).toBeNull();
  });

  it("evento sem sendTransaction ainda é parseado (chamador decide o que fazer)", () => {
    const parsed = parseSwapUpdatedEvent(JSON.stringify(NO_TX_EVENT));
    expect(parsed?.status).toBe("created");
    expect(parsed?.sendTransaction).toBeUndefined();
  });
});
