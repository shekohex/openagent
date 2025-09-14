import { OpenAPIHono } from "@hono/zod-openapi";
import { logger } from "hono/logger";
import type { RequestIdVariables } from "hono/request-id";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";

import { errorHandler } from "./middleware/errors";
import { security } from "./middleware/security";
import eventsRoutes from "./routes/events";
import internalRoutes from "./routes/internal";
import opencodeRoutes from "./routes/opencode";
import terminalRoutes from "./routes/terminal";

const app = new OpenAPIHono<{
  Variables: RequestIdVariables;
}>()
  .doc("/doc", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "OpenAgent Sidecar",
      description: "Background coding agent sidecar service",
    },
  })
  .use(logger())
  .use(secureHeaders())
  .use("*", requestId())
  .use(security())
  .use("*", errorHandler())
  .route("/internal", internalRoutes)
  .route("/opencode", opencodeRoutes)
  .route("/events", eventsRoutes)
  .route("/terminal", terminalRoutes)
  .get("/", (c) => {
    const rid = c.get("requestId");
    return c.json({
      message: "OpenAgent Sidecar",
      requestId: rid,
      timestamp: new Date().toISOString(),
    });
  });

export type AppType = typeof app;
export default app;
