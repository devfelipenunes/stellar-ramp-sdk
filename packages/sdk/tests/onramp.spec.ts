import { describe, expect, it } from "vitest";
import { createRamp } from "../src/application/ramp-service";
import { isSimulatable } from "../src/domain/ports/ramp-provider";
import { makeIdentityStore, makeProvider, makeOrder } from "./fixtures";

describe("onramp — fiat → USDC (spec onramp.feature)", () => {
  it("ciclo completo: created → funded → completed", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
    });
    const quote = await ramp.quote({
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "300",
    });

    const order = await ramp.onramp({ quote, pubkey: "G-USUARIO-1" });

    expect(order.id).toBeTruthy();
    expect(order.providerId).toBe("etherfuse");
    expect(order.direction).toBe("onramp");

    if (isSimulatable(etherfuse)) {
      const funded = await etherfuse.simulateFiatDeposit(order.id);
      expect(funded.status).toBe("funded");
    }

    const final = await ramp.getOrder(order.id);
    expect(["completed", "funded", "created"]).toContain(final.status);
  });

  it("consulta a ordem pelo orderId com statusPageUrl", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    etherfuse.getOrder = async () =>
      makeOrder("etherfuse", "onramp", "completed", {
        statusPageUrl: "sandbox.etherfuse.com/ramp/order/abc",
      });
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
    });

    const order = await ramp.getOrder("etherfuse-order-1");

    expect(order.status).toBe("completed");
    expect(order.statusPageUrl).toContain("sandbox.etherfuse.com");
  });

  it("ordem do mesmo usuário reusa identidade (ADR-005) — não recria customer/bank", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    const store = makeIdentityStore();
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: store,
    });
    const quote = await ramp.quote({
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "300",
    });

    await ramp.onramp({ quote, pubkey: "G-USUARIO-1" });
    await ramp.onramp({ quote, pubkey: "G-USUARIO-1" });

    expect(etherfuse.createCustomer).toHaveBeenCalledTimes(1);
    expect(etherfuse.createBankAccount).toHaveBeenCalledTimes(1);
    expect(store.saveIdentity).toHaveBeenCalledTimes(1);
  });

  it("quote com pubkey garante a organização antes de cotar (ADR-005, fluxo invertido)", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    const store = makeIdentityStore();
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: store,
    });

    await ramp.quote({
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "100",
      pubkey: "G-USUARIO-1",
    });

    expect(etherfuse.createCustomer).toHaveBeenCalledTimes(1);
    expect(etherfuse.quote).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "etherfuse-cust-1" }),
    );
    expect(store.map.get("G-USUARIO-1:etherfuse")).toBeDefined();
  });

  it("quote sem pubkey NÃO cria organização (consulta direta)", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    const store = makeIdentityStore();
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: store,
    });

    await ramp.quote({
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "100",
    });

    expect(etherfuse.createCustomer).not.toHaveBeenCalled();
    expect(store.map.size).toBe(0);
  });

  it("onramp cota FRESCO (2-pass) com o customerId da identity, não reusa o quote do input", async () => {
    const etherfuse = makeProvider("etherfuse", ["MX"]);
    const ramp = createRamp({
      mode: "live",
      providers: [etherfuse],
      identityStore: makeIdentityStore(),
    });
    const quote = await ramp.quote({
      direction: "onramp",
      country: "MX",
      fiat: "MXN",
      fiatAmount: "300",
    });

    await ramp.onramp({ quote, pubkey: "G-USUARIO-1" });

    expect(etherfuse.quote).toHaveBeenCalledTimes(2);
    expect(etherfuse.quote).toHaveBeenLastCalledWith(
      expect.objectContaining({
        customerId: "etherfuse-cust-1",
        pubkey: "G-USUARIO-1",
      }),
    );
    expect(etherfuse.createOnrampOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        quote: expect.objectContaining({ quoteId: "etherfuse-quote-1" }),
      }),
    );
  });
});
