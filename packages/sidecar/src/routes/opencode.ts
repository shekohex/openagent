import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { RequestIdVariables } from "hono/request-id";
import { z } from "zod";
import { HTTP_STATUS } from "../constants";
import { logger } from "../logger";

import { eventSubscriber } from "../opencode/events";

const DEFAULT_OPENCODE_PORT = 4097;

import { opencodeServer, type ServerConfig } from "../opencode/server";

// Health check route
const healthRoute = createRoute({
  method: "get",
  path: "/health",
  summary: "OpenCode server health",
  description: "Check if OpenCode server is running and healthy",
  responses: {
    200: {
      description: "Server health status",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(true),
            data: z.object({
              isRunning: z.boolean(),
              isHealthy: z.boolean(),
              url: z.string().nullable(),
              sessionId: z.string().nullable(),
              uptime: z.number().nullable(),
              lastHealthCheck: z.number().nullable(),
            }),
          }),
        },
      },
    },
    503: {
      description: "Server not available",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
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

// Start server route
const startRoute = createRoute({
  method: "post",
  path: "/start",
  summary: "Start OpenCode server",
  description: "Start the OpenCode server with provided configuration",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            hostname: z.string().default("127.0.0.1"),
            port: z.number().default(DEFAULT_OPENCODE_PORT), // Default OpenCode server port
            sessionId: z.string(),
            providerKeys: z
              .array(
                z.object({
                  provider: z.string(),
                  encryptedKey: z.string(),
                  nonce: z.string(),
                })
              )
              .optional(),
            orchestratorConfig: z.record(z.string(), z.unknown()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Server started successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(true),
            data: z.object({
              url: z.string(),
              sessionId: z.string(),
              startTime: z.number(),
            }),
          }),
        },
      },
    },
    400: {
      description: "Invalid request",
    },
    500: {
      description: "Failed to start server",
    },
  },
});

// Stop server route
const stopRoute = createRoute({
  method: "post",
  path: "/stop",
  summary: "Stop OpenCode server",
  description: "Stop the running OpenCode server",
  responses: {
    200: {
      description: "Server stopped successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(true),
            data: z.object({
              message: z.string(),
            }),
          }),
        },
      },
    },
    404: {
      description: "Server not running",
    },
  },
});

// Server info route
const infoRoute = createRoute({
  method: "get",
  path: "/info",
  summary: "Get server information",
  description: "Get current OpenCode server state and information",
  responses: {
    200: {
      description: "Server information",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(true),
            data: z.object({
              url: z.string().nullable(),
              sessionId: z.string().nullable(),
              uptime: z.number().nullable(),
              isHealthy: z.boolean(),
              isRunning: z.boolean(),
            }),
          }),
        },
      },
    },
    500: {
      description: "Internal Server Error",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
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

// Ensure the same Env (Variables) type as the root app so .route() remains type-safe
const app = new OpenAPIHono<{
  Variables: RequestIdVariables;
}>()
  .openapi(healthRoute, async (c) => {
    try {
      const serverState = opencodeServer.getState();

      if (!serverState.isRunning) {
        return c.json(
          {
            success: false,
            error: {
              code: "SERVER_NOT_RUNNING",
              message: "OpenCode server is not running",
            },
          },
          HTTP_STATUS.SERVICE_UNAVAILABLE
        );
      }

      // Perform actual health check
      const healthCheckResult = await opencodeServer.healthCheck();

      return c.json(
        {
          success: true,
          data: {
            isRunning: serverState.isRunning,
            isHealthy: healthCheckResult,
            url: serverState.url,
            sessionId: serverState.sessionId,
            uptime: serverState.startTime
              ? Date.now() - serverState.startTime
              : null,
            lastHealthCheck: serverState.lastHealthCheck,
          },
        },
        HTTP_STATUS.OK
      );
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "OpenCode health check failed"
      );
      return c.json(
        {
          success: false,
          error: {
            code: "HEALTH_CHECK_FAILED",
            message: "Failed to check OpenCode server health",
          },
        },
        HTTP_STATUS.SERVICE_UNAVAILABLE
      );
    }
  })
  .openapi(startRoute, async (c) => {
    try {
      const body = c.req.valid("json");

      const serverConfig: ServerConfig = {
        hostname: body.hostname,
        port: body.port,
        sessionId: body.sessionId,
        providerKeys: body.providerKeys || [],
        orchestratorConfig: body.orchestratorConfig,
      };

      const url = await opencodeServer.start(serverConfig);

      // Subscribe to events after server starts
      await eventSubscriber.subscribeToEvents();

      return c.json({
        success: true,
        data: {
          url,
          sessionId: serverConfig.sessionId,
          startTime: Date.now(),
        },
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to start OpenCode server"
      );
      return c.json(
        {
          success: false,
          error: {
            code: "SERVER_START_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to start OpenCode server",
          },
        },
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  })
  .openapi(stopRoute, async (c) => {
    try {
      await opencodeServer.stop();

      // Unsubscribe from events
      await eventSubscriber.unsubscribeFromEvents();

      return c.json({
        success: true,
        data: {
          message: "OpenCode server stopped successfully",
        },
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to stop OpenCode server"
      );
      return c.json(
        {
          success: false,
          error: {
            code: "SERVER_STOP_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to stop OpenCode server",
          },
        },
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  })
  .openapi(infoRoute, async (c) => {
    try {
      const serverInfo = await opencodeServer.getServerInfo();

      return c.json(
        {
          success: true,
          data: {
            ...serverInfo,
            isRunning: opencodeServer.getState().isRunning,
          },
        },
        HTTP_STATUS.OK
      );
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to get OpenCode server info"
      );
      return c.json(
        {
          success: false,
          error: {
            code: "SERVER_INFO_FAILED",
            message: "Failed to get OpenCode server information",
          },
        },
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  });

// unified chaining above

export default app;
