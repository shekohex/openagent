import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const MILLISECONDS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;
const CLEANUP_BATCH_SIZE = 100;

export type RateLimitConfig = {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs?: number;
  exponentialBackoff?: boolean;
};

const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  key_provision: {
    maxAttempts: 3,
    windowMs: 5 * SECONDS_IN_MINUTE * MILLISECONDS_IN_SECOND, // 5 minutes
    blockDurationMs: 15 * SECONDS_IN_MINUTE * MILLISECONDS_IN_SECOND, // 15 minutes
    exponentialBackoff: true,
  },
  key_decrypt: {
    maxAttempts: 10,
    windowMs: SECONDS_IN_MINUTE * MILLISECONDS_IN_SECOND, // 1 minute
    blockDurationMs: 5 * SECONDS_IN_MINUTE * MILLISECONDS_IN_SECOND, // 5 minutes
    exponentialBackoff: false,
  },
  auth_attempt: {
    maxAttempts: 5,
    windowMs: 15 * SECONDS_IN_MINUTE * MILLISECONDS_IN_SECOND, // 15 minutes
    blockDurationMs: 30 * SECONDS_IN_MINUTE * MILLISECONDS_IN_SECOND, // 30 minutes
    exponentialBackoff: true,
  },
  api_general: {
    maxAttempts: 100,
    windowMs: SECONDS_IN_MINUTE * MILLISECONDS_IN_SECOND, // 1 minute
    blockDurationMs: 5 * SECONDS_IN_MINUTE * MILLISECONDS_IN_SECOND, // 5 minutes
    exponentialBackoff: false,
  },
};

export const checkRateLimit = mutation({
  args: {
    identifier: v.string(),
    operation: v.string(),
    metadata: v.optional(
      v.object({
        ip: v.optional(v.string()),
        userAgent: v.optional(v.string()),
        sessionId: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const config =
      DEFAULT_CONFIGS[args.operation] || DEFAULT_CONFIGS.api_general;

    // Find existing rate limit record
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_identifier", (q) =>
        q
          .eq("identifier", args.identifier)
          .eq("operation", args.operation)
          .gte("windowEnd", now)
      )
      .first();

    // If blocked and still within block duration
    if (existing?.blocked && existing.windowEnd > now) {
      return {
        allowed: false,
        remainingAttempts: 0,
        resetTime: existing.windowEnd,
        reason: "Rate limit exceeded - temporarily blocked",
      };
    }

    // If no existing record or window expired, create new one
    if (!existing || existing.windowEnd <= now) {
      const windowEnd = now + config.windowMs;

      await ctx.db.insert("rateLimits", {
        identifier: args.identifier,
        operation: args.operation,
        attempts: 1,
        windowStart: now,
        windowEnd,
        blocked: false,
        lastAttempt: now,
        metadata: args.metadata,
      });

      return {
        allowed: true,
        remainingAttempts: config.maxAttempts - 1,
        resetTime: windowEnd,
      };
    }

    // Check if attempts exceeded
    if (existing.attempts >= config.maxAttempts) {
      // Apply exponential backoff if configured
      let blockDuration = config.blockDurationMs || config.windowMs;
      if (config.exponentialBackoff) {
        const blockCount = Math.floor(existing.attempts / config.maxAttempts);
        blockDuration =
          blockDuration * Math.pow(2, Math.min(blockCount - 1, 5)); // Cap at 2^5
      }

      const blockEnd = now + blockDuration;

      await ctx.db.patch(existing._id, {
        blocked: true,
        windowEnd: blockEnd,
        lastAttempt: now,
        attempts: existing.attempts + 1,
      });

      return {
        allowed: false,
        remainingAttempts: 0,
        resetTime: blockEnd,
        reason: `Rate limit exceeded - blocked until ${new Date(blockEnd).toISOString()}`,
      };
    }

    // Increment attempts
    await ctx.db.patch(existing._id, {
      attempts: existing.attempts + 1,
      lastAttempt: now,
    });

    return {
      allowed: true,
      remainingAttempts: config.maxAttempts - existing.attempts - 1,
      resetTime: existing.windowEnd,
    };
  },
});

export const resetRateLimit = mutation({
  args: {
    identifier: v.string(),
    operation: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get all records for the identifier
    const baseQuery = ctx.db
      .query("rateLimits")
      .withIndex("by_identifier", (q) => q.eq("identifier", args.identifier));

    // Filter by operation if specified
    const records = args.operation
      ? await baseQuery
          .filter((q) => q.eq(q.field("operation"), args.operation))
          .collect()
      : await baseQuery.collect();

    for (const record of records) {
      await ctx.db.delete(record._id);
    }

    return { deleted: records.length };
  },
});

export const getRateLimitStatus = query({
  args: {
    identifier: v.string(),
    operation: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const record = await ctx.db
      .query("rateLimits")
      .withIndex("by_identifier", (q) =>
        q
          .eq("identifier", args.identifier)
          .eq("operation", args.operation)
          .gte("windowEnd", now)
      )
      .first();

    if (!record) {
      const config =
        DEFAULT_CONFIGS[args.operation] || DEFAULT_CONFIGS.api_general;
      return {
        blocked: false,
        attempts: 0,
        maxAttempts: config.maxAttempts,
        resetTime: null,
      };
    }

    const config =
      DEFAULT_CONFIGS[args.operation] || DEFAULT_CONFIGS.api_general;

    return {
      blocked: record.blocked,
      attempts: record.attempts,
      maxAttempts: config.maxAttempts,
      resetTime: record.windowEnd,
      remainingAttempts: Math.max(0, config.maxAttempts - record.attempts),
    };
  },
});

export const cleanupExpiredRateLimits = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find expired rate limit records
    const expired = await ctx.db
      .query("rateLimits")
      .withIndex("by_window", (q) => q.lt("windowEnd", now))
      .take(CLEANUP_BATCH_SIZE);

    let deletedCount = 0;
    for (const record of expired) {
      await ctx.db.delete(record._id);
      deletedCount++;
    }

    return { deleted: deletedCount };
  },
});

export const getBlockedIdentifiers = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = args.limit || 100;

    const blocked = await ctx.db
      .query("rateLimits")
      .withIndex("by_blocked", (q) =>
        q.eq("blocked", true).gte("windowEnd", now)
      )
      .take(limit);

    return blocked.map((record) => ({
      identifier: record.identifier,
      operation: record.operation,
      attempts: record.attempts,
      blockedUntil: record.windowEnd,
      lastAttempt: record.lastAttempt,
      metadata: record.metadata,
    }));
  },
});
