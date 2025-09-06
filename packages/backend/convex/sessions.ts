import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { authenticatedMutation, authenticatedQuery } from "./lib/auth";

export const getById = query({
  args: {
    id: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByIdWithToken = query({
  args: {
    id: v.id("sessions"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    
    if (!session || session.registrationToken !== args.token) {
      return null;
    }
    
    return session;
  },
});

export const updateSidecarRegistration = mutation({
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
      .take(50);
  },
});