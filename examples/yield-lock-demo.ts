import { createStellarYield } from "../packages/yield/src/index";

async function main(): Promise<void> {
  const engine = createStellarYield({ mode: "mock" });

  console.log("1. autoPark — 100 USDC entram e viram TESOURO rendendo");
  const position = await engine.autoPark({ usdcAmount: "100", country: "BR" });
  console.log("   posição:", position);

  console.log("\n2. balance — saldo atual, já com NAV aplicado");
  console.log("   balance:", await engine.balance());

  console.log(
    "\n3. lock — travando 400 tokens como garantia (ex.: caução de leilão)",
  );
  const lock = await engine.lock({
    lockId: "leilao-42",
    code: "TESOURO",
    tokens: "400",
    reason: "auction_collateral",
  });
  console.log("   lock:", lock);

  console.log(
    "\n4. liquidate tentando sacar mais do que está destravado → deve falhar",
  );
  try {
    await engine.liquidate({ code: "TESOURO", usdcAmount: "90" });
    console.log("   inesperado: não deveria ter permitido");
  } catch (e) {
    console.log("   recusado como esperado:", (e as Error).message);
  }

  console.log("\n5. liquidate dentro do saldo destravado → funciona");
  const spent = await engine.liquidate({ code: "TESOURO", usdcAmount: "5" });
  console.log("   USDC recebido:", spent);

  console.log(
    "\n6. unlock — leilão terminou, libera a garantia com o rendimento acumulado",
  );
  const unlocked = await engine.unlock("leilao-42");
  console.log("   unlock:", unlocked);

  console.log("\n7. agora dá pra liquidar o resto também");
  console.log("   USDC recebido:", await engine.liquidate({ code: "TESOURO" }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
