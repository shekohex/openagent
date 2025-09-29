import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { RequestIdVariables } from "hono/request-id";
import { z } from "zod";
import { isValidKeyId, isValidPublicKey } from "../auth/keys";
import { HTTP_STATUS } from "../constants";

const DEFAULT_GRACE_PERIOD_MS = 1000;

import { logger } from "../logger";
import { eventSubscriber } from "../opencode/events";
import { opencodeServer } from "../opencode/server";
import { OrchestratorError, registerSidecar } from "../orchestrator/adapter";

const registerRequestSchema = z.object({
  sessionId: z.string().min(1),
  registrationToken: z.string().min(1),
  publicKey: z.string().min(1),
  keyId: z.string().min(1),
});

const errorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    id: z.string().optional(),
  }),
});

type InternalContext = Context<{ Variables: RequestIdVariables }>;

type ErrorStatus =
  | typeof HTTP_STATUS.BAD_REQUEST
  | typeof HTTP_STATUS.UNAUTHORIZED
  | typeof HTTP_STATUS.FORBIDDEN
  | typeof HTTP_STATUS.CONFLICT
  | typeof HTTP_STATUS.INTERNAL_SERVER_ERROR;

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
  request: {
    body: {
      content: {
        "application/json": {
          schema: registerRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Registration successful",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(true),
            sidecarAuthToken: z.string(),
            orchestratorPublicKey: z.string(),
            orchestratorKeyId: z.string(),
            opencodePort: z.number(),
            encryptedProviderKeys: z.object({
              ciphertext: z.string(),
              nonce: z.string(),
              tag: z.string(),
              recipientKeyId: z.string(),
            }),
          }),
        },
      },
    },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: errorSchema } },
    },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: errorSchema } },
    },
    403: {
      description: "Forbidden",
      content: { "application/json": { schema: errorSchema } },
    },
    409: {
      description: "Conflict",
      content: { "application/json": { schema: errorSchema } },
    },
    500: {
      description: "Internal error",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

const updateKeysRoute = createRoute({
  method: "put",
  path: "/update-keys",
  summary: "Update provider keys",
  description: "Rotate/update encrypted provider keys for the sidecar",
  request: {
    headers: z.object({ Authorization: z.string().optional() }),
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
    headers: z.object({ Authorization: z.string().optional() }),
    body: {
      content: {
        "application/json": {
          schema: z
            .object({
              gracePeriodMs: z.any().optional(),
            })
            .optional(),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Shutdown initiated successfully",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(true),
            data: z.object({
              message: z.string(),
              gracePeriodMs: z.number(),
            }),
          }),
        },
      },
    },
    400: {
      description: "Bad Request",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.object({
              code: z.literal("INVALID_GRACE_PERIOD"),
              message: z.string(),
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
              code: z.literal("SHUTDOWN_FAILED"),
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
  .openapi(readyRoute, (c) => {
    const serverState = opencodeServer.getState();
    const isHealthy = opencodeServer.isHealthy();

    // Service is ready if OpenCode server is running and healthy
    const ready = serverState.isRunning && isHealthy;

    return c.json(
      {
        status: "ok",
        ready,
        opencodeServer: {
          isRunning: serverState.isRunning,
          isHealthy,
          url: serverState.url,
          sessionId: serverState.sessionId,
        },
        timestamp: new Date().toISOString(),
      },
      HTTP_STATUS.OK
    );
  })
  .openapi(registerRoute, async (c) => {
    const requestId = c.get("requestId");
    const payload = c.req.valid("json");

    if (!isValidPublicKey(payload.publicKey)) {
      return errorResponse({
        context: c,
        status: HTTP_STATUS.BAD_REQUEST,
        code: "INVALID_PUBLIC_KEY",
        message: "Provided public key is not a valid uncompressed P-256 key",
        requestId,
      });
    }

    if (!isValidKeyId(payload.keyId)) {
      return errorResponse({
        context: c,
        status: HTTP_STATUS.BAD_REQUEST,
        code: "INVALID_KEY_ID",
        message: "Provided key identifier is not valid",
        requestId,
      });
    }

    try {
      const result = await registerSidecar({
        sessionId: payload.sessionId,
        registrationToken: payload.registrationToken,
        sidecarPublicKey: payload.publicKey,
        sidecarKeyId: payload.keyId,
      });

      // Start OpenCode server after successful registration
      try {
        const opencodeUrl = await opencodeServer.start({
          hostname: "127.0.0.1",
          port: result.opencodePort,
          sessionId: payload.sessionId,
          providerKeys: [], // Provider keys will be injected separately
          orchestratorConfig: {
            // Pass orchestrator config if needed
          },
        });

        logger.info(
          {
            sessionId: payload.sessionId,
            opencodeUrl,
            opencodePort: result.opencodePort,
          },
          "OpenCode server started successfully after registration"
        );

        // Subscribe to events
        await eventSubscriber.subscribeToEvents();

        return c.json(
          {
            success: true,
            sidecarAuthToken: result.sidecarAuthToken,
            orchestratorPublicKey: result.orchestratorPublicKey,
            orchestratorKeyId: result.orchestratorKeyId,
            opencodePort: result.opencodePort,
            encryptedProviderKeys: result.encryptedProviderKeys,
            opencodeUrl,
          },
          HTTP_STATUS.OK
        );
      } catch (opencodeError) {
        logger.error(
          {
            sessionId: payload.sessionId,
            error:
              opencodeError instanceof Error
                ? opencodeError.message
                : String(opencodeError),
          },
          "Failed to start OpenCode server after registration"
        );

        // Return registration success but note OpenCode server failure
        return c.json(
          {
            success: true,
            sidecarAuthToken: result.sidecarAuthToken,
            orchestratorPublicKey: result.orchestratorPublicKey,
            orchestratorKeyId: result.orchestratorKeyId,
            opencodePort: result.opencodePort,
            encryptedProviderKeys: result.encryptedProviderKeys,
            opencodeUrl: null,
            warning:
              "Registration successful but OpenCode server failed to start",
          },
          HTTP_STATUS.OK
        );
      }
    } catch (error) {
      if (error instanceof OrchestratorError) {
        const status = normalizeStatus(error.status);
        return errorResponse({
          context: c,
          status,
          code: error.code,
          message: error.message,
          requestId,
        });
      }

      return errorResponse({
        context: c,
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        code: "REGISTRATION_FAILURE",
        message:
          error instanceof Error ? error.message : "Failed to register sidecar",
        requestId,
      });
    }
  })
  .openapi(healthRoute, (c) => {
    const serverState = opencodeServer.getState();
    const isHealthy = opencodeServer.isHealthy();

    return c.json(
      {
        status: "ok",
        opencodeServer: {
          isRunning: serverState.isRunning,
          isHealthy,
          url: serverState.url,
          sessionId: serverState.sessionId,
          uptime: serverState.startTime
            ? Date.now() - serverState.startTime
            : null,
          lastHealthCheck: serverState.lastHealthCheck,
        },
        timestamp: new Date().toISOString(),
      },
      HTTP_STATUS.OK
    );
  })
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
  .openapi(shutdownRoute, async (c) => {
    try {
      const body = c.req.valid("json");
      const gracePeriodMs =
        body?.gracePeriodMs !== undefined
          ? body.gracePeriodMs
          : DEFAULT_GRACE_PERIOD_MS;

      // Validate gracePeriodMs - check for null (which is what NaN becomes in JSON) or actual NaN
      if (
        gracePeriodMs === null ||
        typeof gracePeriodMs !== "number" ||
        Number.isNaN(gracePeriodMs)
      ) {
        return c.json(
          {
            success: false as const,
            error: {
              code: "INVALID_GRACE_PERIOD" as const,
              message: "gracePeriodMs must be a valid number",
            },
          },
          HTTP_STATUS.BAD_REQUEST
        );
      }

      logger.info({ gracePeriodMs }, "Initiating graceful shutdown...");

      // Stop OpenCode server first
      if (opencodeServer.getState().isRunning) {
        await opencodeServer.stop();
        logger.info("OpenCode server stopped successfully");
      }

      // Unsubscribe from events
      await eventSubscriber.unsubscribeFromEvents();

      // Schedule shutdown after grace period
      setTimeout(() => {
        logger.info("Grace period completed, shutting down...");
        process.exit(0);
      }, gracePeriodMs);

      return c.json(
        {
          success: true as const,
          data: {
            message: "Shutdown initiated",
            gracePeriodMs,
          },
        },
        HTTP_STATUS.OK
      );
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to initiate shutdown"
      );
      return c.json(
        {
          success: false as const,
          error: {
            code: "SHUTDOWN_FAILED" as const,
            message: "Failed to initiate shutdown",
          },
        },
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  });

// (no-op) previous unchained block removed in favor of a single chained creation

export type InternalRoutes = typeof app;

export default app;

function normalizeStatus(status?: number): ErrorStatus {
  switch (status) {
    case HTTP_STATUS.BAD_REQUEST:
    case HTTP_STATUS.UNAUTHORIZED:
    case HTTP_STATUS.FORBIDDEN:
    case HTTP_STATUS.CONFLICT:
    case HTTP_STATUS.INTERNAL_SERVER_ERROR:
      return status;
    default:
      return HTTP_STATUS.INTERNAL_SERVER_ERROR;
  }
}

type ErrorResponseArgs = {
  context: InternalContext;
  status: ErrorStatus;
  code: string;
  message: string;
  requestId?: string;
};

function errorResponse({
  context,
  status,
  code,
  message,
  requestId,
}: ErrorResponseArgs) {
  return context.json(
    {
      success: false,
      error: {
        code,
        message,
        id: requestId,
      },
    },
    status
  );
}
