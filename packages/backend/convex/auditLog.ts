import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const MAX_QUERY_LIMIT = 1000;
const DEFAULT_QUERY_LIMIT = 100;

export type AuditSeverity = "info" | "warning" | "error" | "critical";

export type AuditMetadata = {
  ip?: string;
  userAgent?: string;
  requestId?: string;
  attemptNumber?: number;
  keyVersion?: number;
  previousValue?: string;
  newValue?: string;
  [key: string]: any;
};

export type AuditLogEntry = {
  operation: string;
  userId?: Id<"users">;
  sessionId?: Id<"sessions">;
  provider?: string;
  success: boolean;
  severity: AuditSeverity;
  errorMessage?: string;
  errorCode?: string;
  metadata?: AuditMetadata;
};

function computeTamperChecksum(
  entry: AuditLogEntry & { timestamp: number }
): string {
  // Create a deterministic string representation of the entry
  const dataString = JSON.stringify({
    timestamp: entry.timestamp,
    operation: entry.operation,
    userId: entry.userId,
    sessionId: entry.sessionId,
    provider: entry.provider,
    success: entry.success,
    severity: entry.severity,
    errorMessage: entry.errorMessage,
    errorCode: entry.errorCode,
    metadata: entry.metadata,
  });

  // Simple hash function for tamper detection (in production, use crypto.subtle.digest)
  let hash = 0;
  for (let i = 0; i < dataString.length; i++) {
    const char = dataString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return hash.toString(36);
}

export const logSecurityEvent = mutation({
  args: {
    operation: v.string(),
    userId: v.optional(v.id("users")),
    sessionId: v.optional(v.id("sessions")),
    provider: v.optional(v.string()),
    success: v.boolean(),
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("error"),
      v.literal("critical")
    ),
    errorMessage: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        ip: v.optional(v.string()),
        userAgent: v.optional(v.string()),
        requestId: v.optional(v.string()),
        attemptNumber: v.optional(v.number()),
        keyVersion: v.optional(v.number()),
        previousValue: v.optional(v.string()),
        newValue: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const timestamp = Date.now();

    const entry = {
      timestamp,
      operation: args.operation,
      userId: args.userId,
      sessionId: args.sessionId,
      provider: args.provider,
      success: args.success,
      severity: args.severity,
      errorMessage: args.errorMessage,
      errorCode: args.errorCode,
      metadata: args.metadata,
    };

    const tamperChecksum = computeTamperChecksum(entry);

    const logId = await ctx.db.insert("securityAuditLogs", {
      ...entry,
      tamperChecksum,
    });

    // For critical events, trigger additional alerting (in production)
    if (args.severity === "critical") {
      console.error(`CRITICAL SECURITY EVENT: ${args.operation}`, entry);
      // In production: Send to alerting service, PagerDuty, etc.
    }

    return { logId, timestamp };
  },
});

export const queryAuditLogs = query({
  args: {
    filters: v.optional(
      v.object({
        userId: v.optional(v.id("users")),
        sessionId: v.optional(v.id("sessions")),
        operation: v.optional(v.string()),
        provider: v.optional(v.string()),
        severity: v.optional(
          v.union(
            v.literal("info"),
            v.literal("warning"),
            v.literal("error"),
            v.literal("critical")
          )
        ),
        success: v.optional(v.boolean()),
        startTime: v.optional(v.number()),
        endTime: v.optional(v.number()),
      })
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit || DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);
    const filters = args.filters || {};

    // Apply index-based filtering where possible
    const baseQuery = filters.userId
      ? ctx.db
          .query("securityAuditLogs")
          .withIndex("by_user", (q) => q.eq("userId", filters.userId!))
      : filters.sessionId
        ? ctx.db
            .query("securityAuditLogs")
            .withIndex("by_session", (q) =>
              q.eq("sessionId", filters.sessionId!)
            )
        : filters.operation
          ? ctx.db
              .query("securityAuditLogs")
              .withIndex("by_operation", (q) =>
                q.eq("operation", filters.operation!)
              )
          : filters.severity
            ? ctx.db
                .query("securityAuditLogs")
                .withIndex("by_severity", (q) =>
                  q.eq("severity", filters.severity!)
                )
            : filters.success !== undefined
              ? ctx.db
                  .query("securityAuditLogs")
                  .withIndex("by_success", (q) =>
                    q.eq("success", filters.success!)
                  )
              : ctx.db.query("securityAuditLogs").withIndex("by_timestamp");

    // Build the query chain
    let finalQuery = baseQuery;

    // Apply time range filter
    if (filters.startTime) {
      finalQuery = finalQuery.filter((q) =>
        q.gte(q.field("timestamp"), filters.startTime!)
      );
    }
    if (filters.endTime) {
      finalQuery = finalQuery.filter((q) =>
        q.lte(q.field("timestamp"), filters.endTime!)
      );
    }

    // Apply additional filters
    if (filters.provider) {
      finalQuery = finalQuery.filter((q) =>
        q.eq(q.field("provider"), filters.provider!)
      );
    }

    const logs = await finalQuery.order("desc").take(limit);

    // Verify tamper checksums
    const verifiedLogs = logs.map((log) => {
      const expectedChecksum = computeTamperChecksum({
        timestamp: log.timestamp,
        operation: log.operation,
        userId: log.userId,
        sessionId: log.sessionId,
        provider: log.provider,
        success: log.success,
        severity: log.severity,
        errorMessage: log.errorMessage,
        errorCode: log.errorCode,
        metadata: log.metadata,
      });

      return {
        ...log,
        tamperVerified: log.tamperChecksum === expectedChecksum,
      };
    });

    return verifiedLogs;
  },
});

export const getAuditLogStats = query({
  args: {
    timeRangeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const startTime = now - (args.timeRangeMs || 24 * 60 * 60 * 1000); // Default 24 hours

    const recentLogs = await ctx.db
      .query("securityAuditLogs")
      .withIndex("by_timestamp")
      .filter((q) => q.gte(q.field("timestamp"), startTime))
      .collect();

    const stats = {
      total: recentLogs.length,
      byOperation: {} as Record<string, number>,
      bySeverity: {
        info: 0,
        warning: 0,
        error: 0,
        critical: 0,
      },
      successRate: 0,
      failureReasons: {} as Record<string, number>,
      topUsers: [] as Array<{ userId: Id<"users">; count: number }>,
    };

    const userCounts = new Map<Id<"users">, number>();

    for (const log of recentLogs) {
      // Count by operation
      stats.byOperation[log.operation] =
        (stats.byOperation[log.operation] || 0) + 1;

      // Count by severity
      stats.bySeverity[log.severity]++;

      // Track failure reasons
      if (!log.success && log.errorMessage) {
        stats.failureReasons[log.errorMessage] =
          (stats.failureReasons[log.errorMessage] || 0) + 1;
      }

      // Track user activity
      if (log.userId) {
        userCounts.set(log.userId, (userCounts.get(log.userId) || 0) + 1);
      }
    }

    // Calculate success rate
    const successCount = recentLogs.filter((log) => log.success).length;
    stats.successRate =
      recentLogs.length > 0 ? (successCount / recentLogs.length) * 100 : 0;

    // Get top users
    stats.topUsers = Array.from(userCounts.entries())
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return stats;
  },
});

// Helper functions for common audit scenarios
export const auditHelpers = {
  keyOperation: (
    operation: "create" | "read" | "update" | "delete" | "rotate",
    provider: string,
    success: boolean,
    metadata?: AuditMetadata
  ): Omit<AuditLogEntry, "userId" | "sessionId"> => ({
    operation: `key_${operation}`,
    provider,
    success,
    severity: success ? "info" : "warning",
    metadata,
  }),

  authOperation: (
    operation: "login" | "logout" | "register" | "verify",
    success: boolean,
    errorMessage?: string,
    metadata?: AuditMetadata
  ): Omit<AuditLogEntry, "userId" | "sessionId"> => ({
    operation: `auth_${operation}`,
    success,
    severity: success
      ? "info"
      : operation === "login" && !success
        ? "warning"
        : "error",
    errorMessage,
    metadata,
  }),

  securityIncident: (
    operation: string,
    errorMessage: string,
    metadata?: AuditMetadata
  ): Omit<AuditLogEntry, "userId" | "sessionId"> => ({
    operation: `security_${operation}`,
    success: false,
    severity: "critical",
    errorMessage,
    metadata,
  }),
};
