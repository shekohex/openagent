import { setConvexModules } from "../../backend/test-utils/utils";

// Seed environment variables used by both backend and sidecar during tests
if (!process.env.SIDECAR_PORT) {
  process.env.SIDECAR_PORT = "4096";
}
if (!process.env.OPENAGENT_MASTER_KEY) {
  process.env.OPENAGENT_MASTER_KEY =
    "VStudIfC2sdNEX6WvRXhBLYmMZOvx7PID1Szvc9kMBg=";
}

// Load backend Convex function modules so sidecar tests can call into backend
// @ts-expect-error Vite provides import.meta.glob in Vitest
const modules = import.meta.glob("../../backend/convex/**/*.*s");
setConvexModules(modules);
