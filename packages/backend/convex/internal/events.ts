import { v } from "convex/values";
import { mutation } from "../_generated/server";

export const publish = mutation({
  args: {
    sessionId: v.id("sessions"),
    type: v.string(),
    source: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    // Validate session exists
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    // Validate event type
    const supportedEventTypes = [
      "session.updated",
      "session.created",
      "session.terminated",
      "sidecar.ready",
      "message.updated",
      "session.idle",
    ];
    if (!supportedEventTypes.includes(args.type)) {
      throw new Error(`Unsupported event type: ${args.type}`);
    }

    // Store the event
    await ctx.db.insert("sessionEvents", {
      sessionId: args.sessionId,
      type: args.type,
      source: args.source,
      payload: args.payload,
      timestamp: Date.now(),
    });

    return { success: true };
  },
});
