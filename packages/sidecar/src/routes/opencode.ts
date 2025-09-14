import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { RequestIdVariables } from "hono/request-id";
import { HTTP_STATUS } from "../constants";
import { z } from "zod";

const indexRoute = createRoute({
  method: "get",
  path: "/",
  summary: "OpenCode root (placeholder)",
  description: "Placeholder endpoint for OpenCode routes",
  responses: {
    501: {
      description: "Not Implemented",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.object({
              code: z.literal("NOT_IMPLEMENTED"),
              message: z.string(),
            }),
          }),
        },
      },
    },
  },
});

// Ensure the same Env (Variables) type as the root app so .route() remains type-safe
const app = new OpenAPIHono<{
  Variables: RequestIdVariables;
}>()
  .openapi(indexRoute, (c) =>
    c.json(
      {
        success: false,
        error: {
          code: "NOT_IMPLEMENTED",
          message: "OpenCode routes not yet implemented",
        },
      },
      HTTP_STATUS.NOT_IMPLEMENTED
    )
  );

// unified chaining above

export default app;
