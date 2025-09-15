import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { RequestIdVariables } from "hono/request-id";
import { z } from "zod";
import { HTTP_STATUS } from "../constants";

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

const updateKeysRoute = createRoute({
  method: "put",
  path: "/update-keys",
  summary: "Update provider keys",
  description: "Rotate/update encrypted provider keys for the sidecar",
  request: {
    headers: z.object({ Authorization: z.string().optional() }).optional(),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            encryptedProviderKeys: z.array(
              z.object({
                provider: z.string(),
                encryptedKey: z.string(),
                nonce: z.string(),
              })
            ),
          }),
        },
      },
    },
  },
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

const shutdownRoute = createRoute({
  method: "post",
  path: "/shutdown",
  summary: "Graceful shutdown",
  description: "Initiate a graceful shutdown with optional delay",
  request: {
    headers: z.object({ Authorization: z.string().optional() }).optional(),
    body: {
      content: {
        "application/json": {
          schema: z.object({ gracePeriodMs: z.number().optional() }).optional(),
        },
      },
    },
  },
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

const app = new OpenAPIHono<{
  Variables: RequestIdVariables;
}>()
  .openapi(readyRoute, (c) =>
    c.json(
      {
        status: "ok",
        ready: true,
        timestamp: new Date().toISOString(),
      },
      HTTP_STATUS.OK
    )
  )
  .openapi(registerRoute, (c) =>
    c.json(
      {
        success: false,
        error: {
          code: "NOT_IMPLEMENTED",
          message: "Session registration not yet implemented",
        },
      },
      HTTP_STATUS.NOT_IMPLEMENTED
    )
  )
  .openapi(healthRoute, (c) =>
    c.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
      },
      HTTP_STATUS.OK
    )
  )
  .openapi(updateKeysRoute, (c) =>
    c.json(
      {
        success: false,
        error: {
          code: "NOT_IMPLEMENTED",
          message: "Key update not yet implemented",
        },
      },
      HTTP_STATUS.NOT_IMPLEMENTED
    )
  )
  .openapi(shutdownRoute, (c) =>
    c.json(
      {
        success: false,
        error: {
          code: "NOT_IMPLEMENTED",
          message: "Shutdown not yet implemented",
        },
      },
      HTTP_STATUS.NOT_IMPLEMENTED
    )
  );

// (no-op) previous unchained block removed in favor of a single chained creation

export type InternalRoutes = typeof app;

export default app;
