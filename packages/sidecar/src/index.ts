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
}>();

app.use(logger());
app.use(secureHeaders());
app.use("*", requestId());
app.use(security());
app.use("*", errorHandler());

app.get("/", (c) => {
  const rid = c.get("requestId");
  return c.json({
    message: "OpenAgent Sidecar",
    requestId: rid,
    timestamp: new Date().toISOString(),
  });
});

app.route("/internal", internalRoutes);
app.route("/opencode", opencodeRoutes);
app.route("/events", eventsRoutes);
app.route("/terminal", terminalRoutes);

app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "OpenAgent Sidecar",
    description: "Background coding agent sidecar service",
  },
});

export default app;
