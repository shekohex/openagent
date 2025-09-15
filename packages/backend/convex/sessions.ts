import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { authenticatedMutation, authenticatedQuery } from "./authenticated";
import { vv } from "./schema";

const MAX_SESSIONS_LIMIT = 50;

export const getById = internalQuery({
  args: {
    id: vv.id("sessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);

    // Security: Only return session data if it's a system call or the user owns the session
    // For now, we'll keep it accessible for system operations but add validation later
    // This should be converted to an internal query once we refactor the action calls

    return session;
  },
});

export const getByIdWithToken = query({
  args: {
    id: vv.id("sessions"),
    token: vv.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);

    if (!session || session.registrationToken !== args.token) {
      return null;
    }

    return session;
  },
});

export const updateSidecarRegistration = internalMutation({
  args: {
    sessionId: vv.id("sessions"),
    sidecarKeyId: vv.string(),
    sidecarPublicKey: vv.string(),
    orchestratorPublicKey: vv.string(),
    orchestratorKeyId: vv.string(),
    registeredAt: vv.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    await ctx.db.patch(args.sessionId, {
      sidecarKeyId: args.sidecarKeyId,
      sidecarPublicKey: args.sidecarPublicKey,
      orchestratorPublicKey: args.orchestratorPublicKey,
      orchestratorKeyId: args.orchestratorKeyId,
      registeredAt: args.registeredAt,
      status: "active",
      updatedAt: Date.now(),
    });
  },
});

export const createSession = authenticatedMutation({
  args: {
    title: vv.optional(vv.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const registrationToken = crypto.randomUUID();

    const sessionId = await ctx.db.insert("sessions", {
      userId: ctx.userId,
      title: args.title || `Session ${new Date().toISOString()}`,
      status: "creating",
      registrationToken,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return {
      sessionId,
      registrationToken,
    };
  },
});

export const listUserSessions = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(MAX_SESSIONS_LIMIT);
  },
});

// --- Stubs for contract-tested actions (T011, T012) ---

export const provision = action({
  args: {
    sessionId: vv.id("sessions"),
    driver: vv.union(vv.literal("docker"), vv.literal("local")),
  },
  returns: vv.object({
    instanceId: vv.id("instances"),
    endpoint: vv.string(),
  }),
  handler: () => {
    throw new Error("sessions.provision not implemented");
  },
});

export const resume = action({
  args: { id: vv.id("sessions") },
  returns: vv.object({
    success: vv.boolean(),
    instanceId: vv.optional(vv.id("instances")),
    error: vv.optional(vv.string()),
  }),
  handler: () => {
    throw new Error("sessions.resume not implemented");
  },
});
