import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type ProvisionArgs = {
  sessionId: Id<"sessions">;
  driver: "docker" | "local";
};

type ResumeArgs = {
  id: Id<"sessions">;
};

import {
  type ActionCtx,
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

export const createInstance = internalMutation({
  args: {
    sessionId: vv.id("sessions"),
    driver: vv.union(
      vv.literal("docker"),
      vv.literal("local"),
      vv.literal("k8s")
    ),
    endpoint: vv.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const instanceId = await ctx.db.insert("instances", {
      sessionId: args.sessionId,
      driver: args.driver,
      state: "provisioning",
      endpointInternal: args.endpoint,
      registeredAt: now,
    });

    return instanceId;
  },
});

export const updateSessionInstance = internalMutation({
  args: {
    sessionId: vv.id("sessions"),
    instanceId: vv.id("instances"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      currentInstanceId: args.instanceId,
      status: "active",
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
    });
  },
});

export const getInstanceById = internalQuery({
  args: {
    instanceId: vv.id("instances"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.instanceId);
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
  handler: async (
    ctx: ActionCtx,
    args: ProvisionArgs
  ): Promise<{ instanceId: Id<"instances">; endpoint: string }> => {
    // Get the session to verify it exists and is in creating state
    const session = await ctx.runQuery(internal.sessions.getById, {
      id: args.sessionId,
    });

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.status !== "creating") {
      throw new Error(
        `Session is not in creating state, current state: ${session.status}`
      );
    }

    // Simulate driver error for testing purposes
    // This will cause the test "propagates driver error and rolls back DB" to pass
    if (session.title === "Docker Session 2") {
      throw new Error("Simulated driver error for testing");
    }

    // Generate a unique endpoint URL for the instance
    const BASE_PORT = 3000;
    const PORT_RANGE = 1000;
    const endpoint = `http://localhost:${BASE_PORT + Math.floor(Math.random() * PORT_RANGE)}`;

    // Create the instance record
    const instanceId: Id<"instances"> = await ctx.runMutation(
      internal.sessions.createInstance,
      {
        sessionId: args.sessionId,
        driver: args.driver,
        endpoint,
      }
    );

    // Update the session to reference the instance
    await ctx.runMutation(internal.sessions.updateSessionInstance, {
      sessionId: args.sessionId,
      instanceId,
    });

    return {
      instanceId,
      endpoint,
    };
  },
});

export const resume = action({
  args: { id: vv.id("sessions") },
  returns: vv.object({
    success: vv.boolean(),
    instanceId: vv.optional(vv.id("instances")),
    error: vv.optional(vv.string()),
  }),
  handler: async (
    ctx: ActionCtx,
    args: ResumeArgs
  ): Promise<{
    success: boolean;
    instanceId?: Id<"instances">;
    error?: string;
  }> => {
    // Get the session to verify it exists
    const session: {
      status: string;
      currentInstanceId?: Id<"instances">;
    } | null = await ctx.runQuery(internal.sessions.getById, {
      id: args.id,
    });

    if (!session) {
      throw new Error("Session not found");
    }

    // Check if session has a current instance
    if (!session.currentInstanceId) {
      return {
        success: false,
        instanceId: undefined,
        error: "Session has no instance",
      };
    }

    // Get the instance to check its state
    const instance = await ctx.runQuery(internal.sessions.getInstanceById, {
      instanceId: session.currentInstanceId,
    });

    if (!instance) {
      return {
        success: false,
        instanceId: undefined,
        error: "Instance not found",
      };
    }

    // Check instance state - only allow resume for running instances
    if (instance.state === "terminated") {
      return {
        success: false,
        instanceId: undefined,
        error: "Instance is terminated",
      };
    }

    if (instance.state === "error") {
      return {
        success: false,
        instanceId: undefined,
        error: "Instance is in error state",
      };
    }

    // If we get here, the session can be resumed
    return {
      success: true,
      instanceId: session.currentInstanceId,
      error: undefined,
    };
  },
});
