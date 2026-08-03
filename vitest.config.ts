import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: [
      "packages/*/tests/**/*.{spec,test}.ts",
      "apps/*/tests/**/*.{spec,test}.ts",
    ],
    reporters: ["default"],
  },
});
