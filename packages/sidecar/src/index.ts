import { OpenAPIHono } from "@hono/zod-openapi";
import { logger } from "hono/logger";
import type { RequestIdVariables } from "hono/request-id";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";

// https://github.com/honojs/middleware/blob/main/packages/zod-openapi/README.md
const app = new OpenAPIHono<{
  Variables: RequestIdVariables;
}>();
app.use(logger());
app.use(secureHeaders());
app.use("*", requestId());

app.get("/", (c) => {
  const rid = c.get("requestId");
  return c.text(`Hello Hono! ${rid}`);
});

app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "OpenAgent Sidecar",
  },
});

export default app;
