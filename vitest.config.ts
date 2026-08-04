import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: [
      "packages/*/tests/**/*.{spec,test}.ts",
      "apps/*/tests/**/*.{spec,test}.ts",
    ],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
    },
  },
});
