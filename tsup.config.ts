import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "packages/sdk/src/index.ts" },
    outDir: "packages/sdk/dist",
    format: ["esm"],
    dts: { tsconfig: "packages/sdk/tsconfig.json" },
    clean: true,
    sourcemap: true,
  },
]);
