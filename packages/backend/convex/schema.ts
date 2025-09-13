import { defineSchema, defineTable } from "convex/server";
import { type Infer, v } from "convex/values";
import { brandedString, literals, typedV } from "convex-helpers/validators";

// Define a validator that requires an Email string type.
export const emailValidator = brandedString("email");
// Define the Email type based on the branded string.
export type Email = Infer<typeof emailValidator>;

const schema = defineSchema({
  users: defineTable({
    email: emailValidator,
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    createdAt: v.optional(v.number()),
  }).index("email", ["email"]),

  sessions: defineTable({
    userId: v.id("users"),
    title: v.string(),
    status: literals("creating", "active", "idle", "stopped", "error"),
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
    driver: literals("docker", "k8s", "local"),
    state: literals("provisioning", "running", "terminated", "error"),
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
});

export const vv = typedV(schema);

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
