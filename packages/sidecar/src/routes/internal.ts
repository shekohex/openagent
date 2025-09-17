import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { RequestIdVariables } from "hono/request-id";
import { z } from "zod";
import { isValidKeyId, isValidPublicKey } from "../auth/keys";
import { HTTP_STATUS } from "../constants";
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

      return c.json(
        {
          success: true,
          sidecarAuthToken: result.sidecarAuthToken,
          orchestratorPublicKey: result.orchestratorPublicKey,
          orchestratorKeyId: result.orchestratorKeyId,
          opencodePort: result.opencodePort,
          encryptedProviderKeys: result.encryptedProviderKeys,
        },
        HTTP_STATUS.OK
      );
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
}: ErrorResponseArgs): Response {
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
