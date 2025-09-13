/**
 * Convex API Contract Definitions
 * This file defines the expected inputs and outputs for all Convex functions
 * Used for contract testing and API documentation
 */

import { v } from "convex/values";

// ============================================================================
// QUERIES
// ============================================================================

export const queries = {
  // Session queries
  "sessions.listUserSessions": {
    args: {},
    returns: v.array(
      v.object({
        _id: v.id("sessions"),
        _creationTime: v.number(),
        userId: v.id("users"),
        title: v.string(),
        status: v.union(
          v.literal("creating"),
          v.literal("active"),
          v.literal("idle"),
          v.literal("stopped"),
          v.literal("error")
        ),
        lastActivityAt: v.number(),
        createdAt: v.number(),
        updatedAt: v.number(),
      })
    ),
  },

  "sessions.getById": {
    args: { id: v.id("sessions") },
    returns: v.union(
      v.object({
        _id: v.id("sessions"),
        _creationTime: v.number(),
        userId: v.id("users"),
        title: v.string(),
        status: v.union(
          v.literal("creating"),
          v.literal("active"),
          v.literal("idle"),
          v.literal("stopped"),
          v.literal("error")
        ),
        currentInstanceId: v.optional(v.id("instances")),
        lastActivityAt: v.number(),
        createdAt: v.number(),
        updatedAt: v.number(),
      }),
      v.null()
    ),
  },

  "sessions.getEvents": {
    args: {
      sessionId: v.id("sessions"),
      cursor: v.optional(v.string()),
    },
    returns: v.object({
      events: v.array(
        v.object({
          id: v.string(),
          type: v.string(),
          timestamp: v.number(),
          data: v.any(),
        })
      ),
      nextCursor: v.optional(v.string()),
    }),
  },

  // Provider key queries
  "providerKeys.listUserProviderKeys": {
    args: {},
    returns: v.array(
      v.object({
        provider: v.string(),
        keyVersion: v.number(),
        createdAt: v.number(),
        lastUsedAt: v.optional(v.number()),
      })
    ),
  },

  "providerKeys.hasProviderKey": {
    args: { provider: v.string() },
    returns: v.boolean(),
  },

  // Permission queries
  "permissions.listPending": {
    args: { sessionId: v.id("sessions") },
    returns: v.array(
      v.object({
        _id: v.id("pendingPermissions"),
        permissionId: v.string(),
        payload: v.object({
          type: v.string(),
          action: v.string(),
          resource: v.optional(v.string()),
        }),
        createdAt: v.number(),
      })
    ),
  },

  // Provider configuration
  "providers.list": {
    args: {},
    returns: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        requiresKey: v.boolean(),
        models: v.array(
          v.object({
            id: v.string(),
            name: v.string(),
            contextWindow: v.number(),
          })
        ),
      })
    ),
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const mutations = {
  // Session mutations
  "sessions.create": {
    args: {
      title: v.optional(v.string()),
      target: v.optional(v.string()),
    },
    returns: v.object({
      sessionId: v.id("sessions"),
      registrationToken: v.string(),
    }),
  },

  "sessions.delete": {
    args: { id: v.id("sessions") },
    returns: v.null(),
  },

  "sessions.updateStatus": {
    args: {
      id: v.id("sessions"),
      status: v.union(
        v.literal("active"),
        v.literal("idle"),
        v.literal("stopped"),
        v.literal("error")
      ),
    },
    returns: v.null(),
  },

  // Provider key mutations
  "providerKeys.upsert": {
    args: {
      provider: v.string(),
      key: v.string(),
    },
    returns: v.object({
      success: v.boolean(),
      keyVersion: v.number(),
    }),
  },

  "providerKeys.delete": {
    args: { provider: v.string() },
    returns: v.null(),
  },

  // Permission mutations
  "permissions.respond": {
    args: {
      sessionId: v.id("sessions"),
      permissionId: v.string(),
      response: v.object({
        granted: v.boolean(),
        reason: v.optional(v.string()),
      }),
    },
    returns: v.null(),
  },
};

// ============================================================================
// ACTIONS
// ============================================================================

export const actions = {
  // Session lifecycle actions
  "sessions.resume": {
    args: { id: v.id("sessions") },
    returns: v.object({
      success: v.boolean(),
      instanceId: v.optional(v.id("instances")),
      error: v.optional(v.string()),
    }),
  },

  "sessions.provision": {
    args: {
      sessionId: v.id("sessions"),
      driver: v.union(v.literal("docker"), v.literal("local")),
    },
    returns: v.object({
      instanceId: v.id("instances"),
      endpoint: v.string(),
    }),
  },

  // Agent interaction actions
  "sessions.prompt": {
    args: {
      id: v.id("sessions"),
      model: v.optional(v.string()),
      message: v.string(),
    },
    returns: v.object({
      messageId: v.string(),
      status: v.literal("sent"),
    }),
  },

  "sessions.command": {
    args: {
      id: v.id("sessions"),
      command: v.string(),
      args: v.optional(v.array(v.string())),
    },
    returns: v.object({
      commandId: v.string(),
      status: v.literal("executed"),
    }),
  },

  "sessions.shell": {
    args: {
      id: v.id("sessions"),
      command: v.string(),
      cwd: v.optional(v.string()),
    },
    returns: v.object({
      output: v.string(),
      exitCode: v.number(),
    }),
  },

  // Terminal actions
  "terminal.issueToken": {
    args: { sessionId: v.id("sessions") },
    returns: v.object({
      token: v.string(),
      wsUrl: v.string(),
      expiresAt: v.number(),
    }),
  },

  // Export actions
  "export.zip": {
    args: { id: v.id("sessions") },
    returns: v.object({
      downloadUrl: v.string(),
      size: v.number(),
      expiresAt: v.number(),
    }),
  },

  "export.github": {
    args: {
      id: v.id("sessions"),
      repo: v.string(),
      branch: v.string(),
      token: v.string(),
      commitMessage: v.optional(v.string()),
    },
    returns: v.object({
      success: v.boolean(),
      commitSha: v.optional(v.string()),
      pullRequestUrl: v.optional(v.string()),
      error: v.optional(v.string()),
    }),
  },

  // Provider key provisioning
  "provisionKeys.toSidecar": {
    args: {
      sessionId: v.id("sessions"),
      sidecarPublicKey: v.string(),
    },
    returns: v.object({
      encryptedKeys: v.array(
        v.object({
          provider: v.string(),
          encryptedKey: v.string(),
          nonce: v.string(),
        })
      ),
    }),
  },
};

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

export const internal = {
  // Internal queries
  "sessions.getByRegistrationToken": {
    args: { token: v.string() },
    returns: v.union(v.id("sessions"), v.null()),
  },

  "providerKeys.getDecrypted": {
    args: {
      userId: v.id("users"),
      provider: v.string(),
    },
    returns: v.union(
      v.object({
        key: v.string(),
        provider: v.string(),
      }),
      v.null()
    ),
  },

  // Internal mutations
  "sessions.updateSidecarRegistration": {
    args: {
      sessionId: v.id("sessions"),
      sidecarKeyId: v.string(),
      sidecarPublicKey: v.string(),
      orchestratorPublicKey: v.string(),
      orchestratorKeyId: v.string(),
      registeredAt: v.number(),
    },
    returns: v.null(),
  },

  "instances.create": {
    args: {
      sessionId: v.id("sessions"),
      driver: v.union(
        v.literal("docker"),
        v.literal("k8s"),
        v.literal("local")
      ),
      endpointInternal: v.string(),
    },
    returns: v.id("instances"),
  },

  "instances.updateState": {
    args: {
      id: v.id("instances"),
      state: v.union(
        v.literal("running"),
        v.literal("terminated"),
        v.literal("error")
      ),
    },
    returns: v.null(),
  },

  "usageEvents.track": {
    args: {
      sessionId: v.id("sessions"),
      userId: v.id("users"),
      type: v.union(
        v.literal("tokens"),
        v.literal("runtime"),
        v.literal("storage")
      ),
      quantity: v.number(),
      meta: v.optional(v.any()),
    },
    returns: v.id("usageEvents"),
  },

  "sessionArtifacts.create": {
    args: {
      sessionId: v.id("sessions"),
      type: v.union(
        v.literal("session_json"),
        v.literal("zip"),
        v.literal("git")
      ),
      urlOrPath: v.string(),
    },
    returns: v.id("sessionArtifacts"),
  },
};

// ============================================================================
// HTTP ENDPOINTS
// ============================================================================

export const httpEndpoints = {
  "/health": {
    method: "GET" as const,
    response: {
      status: "ok",
      timestamp: "number",
    },
  },

  "/internal/register": {
    method: "POST" as const,
    body: {
      sessionId: "string",
      registrationToken: "string",
      publicKey: "string",
    },
    response: {
      success: "boolean",
      sidecarAuthToken: "string",
      encryptedKeys: "array",
    },
  },
};

// Export type helpers for TypeScript usage
export type QueryContract = typeof queries;
export type MutationContract = typeof mutations;
export type ActionContract = typeof actions;
export type InternalContract = typeof internal;
export type HttpContract = typeof httpEndpoints;
