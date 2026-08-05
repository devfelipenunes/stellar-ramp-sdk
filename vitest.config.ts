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
      exclude: [
        "**/domain/ports/**",
        "**/domain/config.ts",
        "**/domain/entities/country.ts",
        "**/domain/entities/money.ts",
        "**/domain/entities/identity.ts",
        "**/domain/entities/order.ts",
        "**/domain/entities/quote.ts",
        "**/domain/entities/position.ts",
        "**/domain/entities/sep38.ts",
        "**/domain/entities/stablebond.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 88,
        branches: 78,
        statements: 90,
      },
    },
    server: {
      deps: { external: [/node:sqlite/] },
    },
  },
});
