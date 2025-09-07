import { setConvexModules } from "./utils";

/**
 * Global test setup for Convex testing.
 *
 * This file is executed by Vitest before any tests run (configured via setupFiles in vitest.config.mts).
 * It initializes the Convex modules that are needed by convex-test in monorepo environments
 * where automatic module discovery doesn't work reliably.
 *
 * The import.meta.glob pattern matches all Convex function files:
 * - The glob pattern matches files like providerKeys.ts and users/profile.ts
 * - This covers .ts, .js, and other extensions that convex-test needs
 *
 * This setup eliminates the need to manually pass import.meta.glob in every test file.
 */

// Set up test environment variables
process.env.OPENAGENT_MASTER_KEY =
  "VStudIfC2sdNEX6WvRXhBLYmMZOvx7PID1Szvc9kMBg=";

// Load all Convex function modules using Vite's glob import
// @ts-expect-error import.meta.glob available in Vite test
const modules = import.meta.glob("../convex/**/*.*s");

// Register modules with the test utility system
setConvexModules(modules);
