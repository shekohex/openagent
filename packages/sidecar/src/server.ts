import { logger } from "@openagent/logger";
import { serve } from "bun";
import { config } from "./config";
import app from "./index";

const server = serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host,
});

const SHUTDOWN_TIMEOUT_MS = 1000;

const gracefulShutdown = (signal: string) => {
  logger.info({ signal }, "Received signal, shutting down gracefully...");

  server.stop();

  setTimeout(() => {
    logger.warn(
      { timeoutMs: SHUTDOWN_TIMEOUT_MS },
      "Shutdown timeout exceeded, forcing exit"
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
