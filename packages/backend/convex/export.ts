import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { vv } from "./schema";

const EXPIRATION_HOURS = 24; // 24 hours expiration
const SECONDS_PER_HOUR = 60 * 60;
const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_HOUR = SECONDS_PER_HOUR * MILLISECONDS_PER_SECOND;
const RANDOM_OFFSET_MAX = 1000;
const MAX_FILE_SIZE_BYTES = 1_000_000;

export const zip = action({
  args: { id: v.id("sessions") },
  returns: v.object({
    downloadUrl: v.string(),
    size: v.number(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    // Get the session to verify it exists
    const session = await ctx.runQuery(internal.sessions.getById, {
      id: args.id,
    });

    if (!session) {
      throw new Error("Session not found");
    }

    // Generate a unique download URL
    const downloadUrl = `https://storage.example.com/exports/${args.id}/${crypto.randomUUID()}.zip`;

    // Calculate expiration time (24 hours from now) with small random offset to ensure uniqueness
    const expiresAt =
      Date.now() +
      EXPIRATION_HOURS * MILLISECONDS_PER_HOUR +
      Math.floor(Math.random() * RANDOM_OFFSET_MAX);

    // For now, simulate size calculation (in a real implementation, this would be the actual file size)
    const size = Math.floor(Math.random() * MAX_FILE_SIZE_BYTES); // Random size between 0 and 1MB

    // Create session artifact record
    await ctx.runMutation(internal.export.createSessionArtifact, {
      sessionId: args.id,
      type: "zip",
      urlOrPath: downloadUrl,
    });

    return {
      downloadUrl,
      size,
      expiresAt,
    };
  },
});

export const createSessionArtifact = internalMutation({
  args: {
    sessionId: vv.id("sessions"),
    type: vv.union(
      vv.literal("session_json"),
      vv.literal("zip"),
      vv.literal("git")
    ),
    urlOrPath: vv.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("sessionArtifacts", {
      sessionId: args.sessionId,
      type: args.type,
      urlOrPath: args.urlOrPath,
      createdAt: Date.now(),
    });
  },
});
