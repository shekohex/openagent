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
    lastActivityAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_status", ["status"]),

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
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_provider", ["userId", "provider"]),

  pendingPermissions: defineTable({
    sessionId: v.id("sessions"),
    permissionId: v.string(),
    payload: v.any(),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
    response: v.optional(v.any()),
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
    meta: v.optional(v.any()),
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
