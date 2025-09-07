import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";

const ALERT_THRESHOLD_FAILED_AUTH = 5;
const ALERT_THRESHOLD_FAILED_DECRYPT = 3;
const ALERT_THRESHOLD_RATE_LIMIT = 10;
const MONITORING_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

export type SecurityMetric = {
  name: string;
  value: number;
  timestamp: number;
  metadata?: Record<string, any>;
};

export type SecurityAlert = {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  type: string;
  message: string;
  details: Record<string, any>;
  timestamp: number;
  acknowledged: boolean;
};

export type MonitoringDashboard = {
  metrics: SecurityMetric[];
  alerts: SecurityAlert[];
  systemHealth: {
    encryptionService: "healthy" | "degraded" | "unhealthy";
    keyRotationService: "healthy" | "degraded" | "unhealthy";
    authenticationService: "healthy" | "degraded" | "unhealthy";
  };
  statistics: {
    totalKeys: number;
    activeUsers: number;
    recentRotations: number;
    failedOperations: number;
  };
};

// Track security metrics
export const recordMetric = mutation({
  args: {
    name: v.string(),
    value: v.number(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("securityMetrics", {
      name: args.name,
      value: args.value,
      timestamp: Date.now(),
      metadata: args.metadata,
    });

    // Check if metric triggers any alerts
    await checkMetricThresholds(ctx, args.name, args.value);
  },
});

// Check if metrics exceed thresholds
async function checkMetricThresholds(
  ctx: any,
  metricName: string,
  value: number
): Promise<void> {
  const thresholds: Record<
    string,
    { limit: number; severity: SecurityAlert["severity"] }
  > = {
    failed_auth_attempts: {
      limit: ALERT_THRESHOLD_FAILED_AUTH,
      severity: "high",
    },
    failed_decrypt_operations: {
      limit: ALERT_THRESHOLD_FAILED_DECRYPT,
      severity: "critical",
    },
    rate_limit_violations: {
      limit: ALERT_THRESHOLD_RATE_LIMIT,
      severity: "medium",
    },
    key_rotation_failures: { limit: 1, severity: "high" },
  };

  const threshold = thresholds[metricName];
  if (!threshold || value < threshold.limit) {
    return;
  }

  // Check if we've already alerted recently
  const recentAlert = await ctx.db
    .query("securityAlerts")
    .withIndex("by_type", (q: any) => q.eq("type", metricName))
    .order("desc")
    .first();

  if (recentAlert && Date.now() - recentAlert.timestamp < ALERT_COOLDOWN_MS) {
    return;
  }

  // Create alert
  await ctx.db.insert("securityAlerts", {
    severity: threshold.severity,
    type: metricName,
    message: `Threshold exceeded for ${metricName}: ${value} (limit: ${threshold.limit})`,
    details: {
      metric: metricName,
      value,
      threshold: threshold.limit,
    },
    timestamp: Date.now(),
    acknowledged: false,
  });
}

// Get recent metrics
export const getMetrics = query({
  args: {
    name: v.optional(v.string()),
    since: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const since = args.since || Date.now() - MONITORING_WINDOW_MS;
    const limit = args.limit || 100;

    let query = ctx.db
      .query("securityMetrics")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", since))
      .order("desc");

    if (args.name) {
      query = query.filter((q) => q.eq(q.field("name"), args.name));
    }

    return await query.take(limit);
  },
});

// Get active alerts
export const getAlerts = query({
  args: {
    severity: v.optional(
      v.union(
        v.literal("critical"),
        v.literal("high"),
        v.literal("medium"),
        v.literal("low")
      )
    ),
    acknowledged: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    let query = ctx.db.query("securityAlerts").order("desc");

    if (args.severity !== undefined) {
      query = query.filter((q) => q.eq(q.field("severity"), args.severity));
    }

    if (args.acknowledged !== undefined) {
      query = query.filter((q) =>
        q.eq(q.field("acknowledged"), args.acknowledged)
      );
    }

    const alerts = await query.take(limit);

    return alerts.map((alert) => ({
      id: alert._id,
      severity: alert.severity,
      type: alert.type,
      message: alert.message,
      details: alert.details,
      timestamp: alert.timestamp,
      acknowledged: alert.acknowledged,
    }));
  },
});

// Acknowledge an alert
export const acknowledgeAlert = mutation({
  args: {
    alertId: v.id("securityAlerts"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.alertId, {
      acknowledged: true,
      acknowledgedAt: Date.now(),
    });
  },
});

// Get monitoring dashboard
export const getDashboard = action({
  args: {},
  handler: async (ctx): Promise<MonitoringDashboard> => {
    const metrics = await ctx.runQuery(api.monitoring.getMetrics, {
      since: Date.now() - MONITORING_WINDOW_MS,
    });

    const alerts = await ctx.runQuery(api.monitoring.getAlerts, {
      acknowledged: false,
    });

    // Check failed operations
    const recentFailures = metrics.filter(
      (m: any) => m.name.includes("failed") && m.value > 0
    );

    const encryptionHealth = recentFailures.some(
      (m: any) => m.name === "failed_decrypt_operations"
    )
      ? "unhealthy"
      : recentFailures.some((m: any) => m.name === "failed_encrypt_operations")
        ? "degraded"
        : "healthy";

    const keyRotationHealth = recentFailures.some(
      (m: any) => m.name === "key_rotation_failures"
    )
      ? "unhealthy"
      : "healthy";

    const authHealth = recentFailures.some(
      (m: any) =>
        m.name === "failed_auth_attempts" &&
        m.value > ALERT_THRESHOLD_FAILED_AUTH
    )
      ? "unhealthy"
      : recentFailures.some((m: any) => m.name === "failed_auth_attempts")
        ? "degraded"
        : "healthy";

    const stats = await ctx.runQuery(api.monitoring.getStatistics, {});

    return {
      metrics,
      alerts,
      systemHealth: {
        encryptionService: encryptionHealth,
        keyRotationService: keyRotationHealth,
        authenticationService: authHealth,
      },
      statistics: stats,
    };
  },
});

// Get system statistics
export const getStatistics = query({
  args: {},
  handler: async (ctx) => {
    const totalKeys = await ctx.db.query("providerKeys").collect();
    const activeUsers = await ctx.db.query("users").collect();

    const recentRotations = await ctx.db.query("keyRotationAudit").collect();

    const failedOperations = await ctx.db
      .query("securityMetrics")
      .withIndex("by_timestamp", (q) =>
        q.gte("timestamp", Date.now() - 60 * 60 * 1000)
      )
      .filter((q) => q.gt(q.field("value"), 0))
      .filter((q) =>
        q.or(
          q.eq(q.field("name"), "failed_auth_attempts"),
          q.eq(q.field("name"), "failed_decrypt_operations"),
          q.eq(q.field("name"), "key_rotation_failures")
        )
      )
      .collect();

    return {
      totalKeys: totalKeys.length,
      activeUsers: activeUsers.length,
      recentRotations: recentRotations.length,
      failedOperations: failedOperations.reduce((sum, m) => sum + m.value, 0),
    };
  },
});

// Anomaly detection
export const detectAnomalies = action({
  args: {},
  handler: async (ctx) => {
    const metrics = await ctx.runQuery(api.monitoring.getMetrics, {
      since: Date.now() - 60 * 60 * 1000, // Last hour
    });

    const anomalies: Array<{
      type: string;
      description: string;
      severity: SecurityAlert["severity"];
    }> = [];

    // Check for unusual patterns
    const authFailures = metrics.filter(
      (m: any) => m.name === "failed_auth_attempts"
    );
    const avgAuthFailures =
      authFailures.reduce((sum: any, m: any) => sum + m.value, 0) /
      (authFailures.length || 1);

    if (avgAuthFailures > ALERT_THRESHOLD_FAILED_AUTH * 2) {
      anomalies.push({
        type: "auth_attack",
        description: "Possible authentication attack detected",
        severity: "critical",
      });
    }

    // Check for encryption failures
    const encryptFailures = metrics.filter(
      (m: any) => m.name === "failed_decrypt_operations"
    );
    if (encryptFailures.length > ALERT_THRESHOLD_FAILED_DECRYPT) {
      anomalies.push({
        type: "encryption_issue",
        description: "Multiple encryption failures detected",
        severity: "high",
      });
    }

    // Create alerts for anomalies
    for (const anomaly of anomalies) {
      await ctx.runMutation(api.monitoring.createAlert, {
        severity: anomaly.severity,
        type: anomaly.type,
        message: anomaly.description,
        details: { detected: Date.now() },
      });
    }

    return anomalies;
  },
});

// Create a manual alert
export const createAlert = mutation({
  args: {
    severity: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    type: v.string(),
    message: v.string(),
    details: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("securityAlerts", {
      severity: args.severity,
      type: args.type,
      message: args.message,
      details: args.details,
      timestamp: Date.now(),
      acknowledged: false,
    });
  },
});

// Health check endpoint
export const healthCheck = action({
  args: {},
  handler: async (ctx): Promise<any> => {
    const dashboard = await ctx.runAction(api.monitoring.getDashboard, {});

    const overallHealth =
      dashboard.systemHealth.encryptionService === "unhealthy" ||
      dashboard.systemHealth.keyRotationService === "unhealthy" ||
      dashboard.systemHealth.authenticationService === "unhealthy"
        ? "unhealthy"
        : dashboard.systemHealth.encryptionService === "degraded" ||
            dashboard.systemHealth.keyRotationService === "degraded" ||
            dashboard.systemHealth.authenticationService === "degraded"
          ? "degraded"
          : "healthy";

    const criticalAlerts = dashboard.alerts.filter(
      (a: any) => a.severity === "critical" && !a.acknowledged
    );

    return {
      status: overallHealth,
      timestamp: Date.now(),
      services: dashboard.systemHealth,
      criticalAlerts: criticalAlerts.length,
      statistics: dashboard.statistics,
    };
  },
});
