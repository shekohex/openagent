import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { RequestIdVariables } from "hono/request-id";
import { z } from "zod";
import { HTTP_STATUS } from "../constants";

const app = new OpenAPIHono<{
  Variables: RequestIdVariables;
}>();

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  summary: "Health Check",
  description: "Basic health check endpoint",
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({
            status: z.string(),
            timestamp: z.string(),
          }),
        },
      },
    },
  },
});

const readyRoute = createRoute({
  method: "get",
  path: "/ready",
  summary: "Readiness Check",
  description: "Check if the service is ready to accept traffic",
  responses: {
    200: {
      description: "Ready",
      content: {
        "application/json": {
          schema: z.object({
            status: z.string(),
            ready: z.boolean(),
            timestamp: z.string(),
          }),
        },
      },
    },
  },
});

const registerRoute = createRoute({
  method: "post",
  path: "/register",
  summary: "Register Session",
  description: "Register a new session with the sidecar",
  responses: {
    501: {
      description: "Not Implemented",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            error: z.object({
              code: z.string(),
              message: z.string(),
            }),
          }),
        },
      },
    },
  },
});

app
  .openapi(readyRoute, (c) => {
    return c.json({
      status: "ok",
      ready: true,
      timestamp: new Date().toISOString(),
    });
  })
  .openapi(registerRoute, (c) => {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_IMPLEMENTED",
          message: "Session registration not yet implemented",
        },
      },
      HTTP_STATUS.NOT_IMPLEMENTED
    );
  })
  .openapi(healthRoute, (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

export type InternalRoutes = typeof app;

export default app;
