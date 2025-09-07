import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const schema = defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    githubId: v.optional(v.number()),
    createdAt: v.optional(v.number()),
  }).index("email", ["email"]),

  sessions: defineTable({
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
    registrationToken: v.optional(v.string()),
    sidecarKeyId: v.optional(v.string()),
    sidecarPublicKey: v.optional(v.string()),
    orchestratorPublicKey: v.optional(v.string()),
    orchestratorKeyId: v.optional(v.string()),
    registeredAt: v.optional(v.number()),
    lastActivityAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_status", ["status"])
    .index("by_registration_token", ["registrationToken"]),

  instances: defineTable({
    sessionId: v.id("sessions"),
    driver: v.union(v.literal("docker"), v.literal("k8s"), v.literal("local")),
    state: v.union(
      v.literal("provisioning"),
      v.literal("running"),
      v.literal("terminated"),
      v.literal("error")
    ),
    endpointInternal: v.optional(v.string()),
    registeredAt: v.optional(v.number()),
    terminatedAt: v.optional(v.number()),
    sessionJsonPath: v.optional(v.string()),
  })
    .index("by_session", ["sessionId"])
    .index("by_state", ["state"]),

  providerKeys: defineTable({
    userId: v.id("users"),
    provider: v.string(),
    encryptedKey: v.string(),
    encryptedDataKey: v.string(),
    keyVersion: v.number(),
    nonce: v.string(),
    tag: v.string(),
    dataKeyNonce: v.string(),
    dataKeyTag: v.string(),
    masterKeyId: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_provider", ["userId", "provider"]),

  pendingPermissions: defineTable({
    sessionId: v.id("sessions"),
    permissionId: v.string(),
    payload: v.object({
      type: v.string(),
      action: v.string(),
      resource: v.optional(v.string()),
      data: v.optional(
        v.object({
          path: v.optional(v.string()),
          content: v.optional(v.string()),
          permissions: v.optional(v.array(v.string())),
        })
      ),
    }),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
    response: v.optional(
      v.object({
        granted: v.boolean(),
        reason: v.optional(v.string()),
        expiresAt: v.optional(v.number()),
      })
    ),
  })
    .index("by_session", ["sessionId", "createdAt"])
    .index("by_permission", ["permissionId"]),

  usageEvents: defineTable({
    sessionId: v.id("sessions"),
    userId: v.id("users"),
    type: v.union(
      v.literal("tokens"),
      v.literal("runtime"),
      v.literal("storage")
    ),
    quantity: v.number(),
    meta: v.optional(
      v.object({
        model: v.optional(v.string()),
        provider: v.optional(v.string()),
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
        duration: v.optional(v.number()),
        storageType: v.optional(v.string()),
        storageSize: v.optional(v.number()),
      })
    ),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId", "createdAt"])
    .index("by_user", ["userId", "createdAt"]),

  sessionArtifacts: defineTable({
    sessionId: v.id("sessions"),
    type: v.union(
      v.literal("session_json"),
      v.literal("zip"),
      v.literal("git")
    ),
    urlOrPath: v.string(),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_type", ["sessionId", "type"]),

  providerCache: defineTable({
    providers: v.array(v.string()),
    updatedAt: v.number(),
  }),

  keyRotationAudit: defineTable({
    userId: v.id("users"),
    provider: v.string(),
    oldVersion: v.number(),
    newVersion: v.number(),
    timestamp: v.number(),
    success: v.boolean(),
    error: v.optional(v.string()),
  })
    .index("by_user", ["userId", "timestamp"])
    .index("by_provider", ["userId", "provider", "timestamp"]),

  scheduledRotations: defineTable({
    userId: v.id("users"),
    provider: v.string(),
    scheduledFor: v.number(),
    newKeyVersion: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_schedule", ["scheduledFor", "status"]),

  securityMetrics: defineTable({
    name: v.string(),
    value: v.number(),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_name", ["name"])
    .index("by_timestamp", ["timestamp"]),

  securityAlerts: defineTable({
    severity: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    type: v.string(),
    message: v.string(),
    details: v.any(),
    timestamp: v.number(),
    acknowledged: v.boolean(),
    acknowledgedAt: v.optional(v.number()),
  })
    .index("by_type", ["type"])
    .index("by_severity", ["severity", "acknowledged"])
    .index("by_timestamp", ["timestamp"]),

  backups: defineTable({
    userId: v.id("users"),
    version: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    size: v.number(),
    keyCount: v.number(),
    checksum: v.string(),
    description: v.optional(v.string()),
    encryptedData: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_expiration", ["expiresAt"]),

  performanceMetrics: defineTable({
    operation: v.string(),
    duration: v.number(),
    success: v.boolean(),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_operation", ["operation"])
    .index("by_timestamp", ["timestamp"]),

  performanceCache: defineTable({
    key: v.string(),
    value: v.any(),
    timestamp: v.number(),
  }).index("by_key", ["key"]),
});

export default schema;

export type SessionStatus =
  typeof schema.tables.sessions.validator.fields.status.type;
export type InstanceDriver =
  typeof schema.tables.instances.validator.fields.driver.type;
export type InstanceState =
  typeof schema.tables.instances.validator.fields.state.type;
export type UsageEventType =
  typeof schema.tables.usageEvents.validator.fields.type.type;
export type ArtifactType =
  typeof schema.tables.sessionArtifacts.validator.fields.type.type;
