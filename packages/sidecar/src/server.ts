import { serve } from "bun";
import { config } from "./config";
import app from "./index";

const server = serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host,
});

const gracefulShutdown = (signal: string) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

  server.stop();

  setTimeout(() => {
    console.log(`⏰ Shutdown timeout exceeded, forcing exit`);
    process.exit(1);
  }, 5000);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
