import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "threads",
    fileParallelism: false,
    environment: "edge-runtime",
    include: ["tests/**/*.test.ts"],
    timeout: 60_000,
    server: { deps: { inline: ["convex-test"] } },
    setupFiles: ["./test-utils/setup.ts"],
    alias: {
      "@opencode-ai/sdk": path.resolve(
        __dirname,
        "./test-utils/mocks/@opencode-ai/sdk/index.ts"
      ),
    },
  },
});
