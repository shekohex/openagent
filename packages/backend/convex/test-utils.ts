import { convexTest, type TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";

// Global modules variable - will be set by setupFiles during test initialization
let _convexModules: Record<string, () => Promise<unknown>>;

/**
 * Internal function to initialize the Convex modules for testing.
 * This is called automatically by the test setup file.
 *
 * @param modules - The result of import.meta.glob containing all Convex functions
 * @internal
 */
export function setConvexModules(
  modules: Record<string, () => Promise<unknown>>
): void {
  _convexModules = modules;
}

/**
 * Creates a configured Convex test instance with modules pre-loaded.
 *
 * This is a centralized helper that eliminates the need to manually pass
 * import.meta.glob in every test file. The modules are automatically
 * configured through the test setup file.
 *
 * Why this helper exists:
 * - DRY Principle: Avoid repeating import.meta.glob in every test
 * - Monorepo Support: Handles convex-test module resolution issues in Bun/pnpm monorepos
 * - Type Safety: Provides proper TypeScript types with full IntelliSense support
 * - Maintainability: Centralized configuration makes updates easier
 *
 * ## Usage:
 * ```typescript
 * import { createConvexTest } from "./test-utils";
 * import schema from "./schema";
 *
 * describe("My Test", () => {
 *   const t = createConvexTest(schema);
 *   // ... your tests
 * });
 * ```
 *
 * @param schema - Your Convex schema (usually imported from "./schema")
 * @returns A TestConvex instance with all your functions loaded and ready to test
 * @throws {Error} If modules haven't been initialized by the test setup
 */
export async function createConvexTest<Schema extends GenericSchema>(
  schema: SchemaDefinition<Schema, boolean>
): Promise<TestConvex<SchemaDefinition<Schema, boolean>>> {
  if (!_convexModules) {
    throw new Error(
      "Convex modules not initialized. Make sure setupFiles is configured in vitest.config.mts " +
        "and points to './convex/test-setup.ts'"
    );
  }

  const t = convexTest(schema, _convexModules);
  await registerRateLimiterComponent(t);
  return t;
}

export async function registerRateLimiterComponent<
  Schema extends GenericSchema,
>(t: TestConvex<SchemaDefinition<Schema, boolean>>): Promise<void> {
  const { default: rateLimiterSchema } = await import(
    "../node_modules/@convex-dev/rate-limiter/src/component/schema"
  );
  t.registerComponent(
    "rateLimiter",
    rateLimiterSchema,
    // @ts-expect-error ...
    import.meta.glob(
      "../node_modules/@convex-dev/rate-limiter/src/component/**/*.*s"
    )
  );
}
