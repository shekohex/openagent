import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "threads",
    fileParallelism: false,
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    setupFiles: ["./test-utils/setup.ts"],
  },
});
