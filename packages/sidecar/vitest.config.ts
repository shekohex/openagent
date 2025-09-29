import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "edge-runtime",
    // Enable Vitest type testing powered by `tsc`
    typecheck: {
      enabled: true,
      // Only pick up dedicated type test files
      include: ["tests/**/*.test-d.ts"],
      // Use a test-specific tsconfig that includes test files
      tsconfig: "./tsconfig.tests.json",
    },
  },
  resolve: {
    alias: {
      "@opencode-ai/sdk": path.resolve(
        __dirname,
        "./tests/mocks/opencode-sdk.ts"
      ),
    },
  },
});
