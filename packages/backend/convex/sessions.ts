import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { authenticatedMutation, authenticatedQuery } from "./lib/auth";

const MAX_SESSIONS_LIMIT = 50;

export const getById = internalQuery({
  args: {
    id: v.id("sessions"),
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
    id: v.id("sessions"),
    token: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id("sessions"),
      _creationTime: v.number(),
      title: v.string(),
      status: v.union(
        v.literal("creating"),
        v.literal("active"),
        v.literal("idle"),
        v.literal("stopped"),
        v.literal("error")
      ),
      userId: v.id("users"),
      registrationToken: v.optional(v.string()),
      lastActivityAt: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null()
  ),
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
    sessionId: v.id("sessions"),
    sidecarKeyId: v.string(),
    sidecarPublicKey: v.string(),
    orchestratorPublicKey: v.string(),
    orchestratorKeyId: v.string(),
    registeredAt: v.number(),
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
    title: v.optional(v.string()),
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
