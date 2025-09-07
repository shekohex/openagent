import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";

// Performance configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 100;
const MAX_CONCURRENT_OPERATIONS = 10;
const PERFORMANCE_SAMPLE_SIZE = 1000;

export type PerformanceMetrics = {
  operation: string;
  averageTime: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  sampleSize: number;
  timestamp: number;
};

export type OptimizationSuggestion = {
  area: string;
  impact: "high" | "medium" | "low";
  suggestion: string;
  estimatedImprovement: string;
};

// Track operation performance
export const trackPerformance = mutation({
  args: {
    operation: v.string(),
    duration: v.number(),
    success: v.boolean(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("performanceMetrics", {
      operation: args.operation,
      duration: args.duration,
      success: args.success,
      timestamp: Date.now(),
      metadata: args.metadata,
    });

    // Clean up old metrics
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    const oldMetrics = await ctx.db
      .query("performanceMetrics")
      .filter((q) => q.lt(q.field("timestamp"), cutoff))
      .take(100);

    for (const metric of oldMetrics) {
      await ctx.db.delete(metric._id);
    }
  },
});

// Get performance statistics
export const getPerformanceStats = query({
  args: {
    operation: v.optional(v.string()),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PerformanceMetrics[]> => {
    const since = args.since || Date.now() - 60 * 60 * 1000; // Last hour

    let query = ctx.db
      .query("performanceMetrics")
      .filter((q) => q.gte(q.field("timestamp"), since));

    if (args.operation) {
      query = query.filter((q) => q.eq(q.field("operation"), args.operation));
    }

    const metrics = await query.take(PERFORMANCE_SAMPLE_SIZE);

    // Group by operation
    const grouped = new Map<string, number[]>();
    for (const metric of metrics) {
      if (!grouped.has(metric.operation)) {
        grouped.set(metric.operation, []);
      }
      grouped.get(metric.operation)!.push(metric.duration);
    }

    const results: PerformanceMetrics[] = [];
    for (const [operation, durations] of grouped) {
      if (durations.length === 0) continue;

      const sorted = durations.sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);

      results.push({
        operation,
        averageTime: sum / sorted.length,
        minTime: sorted[0],
        maxTime: sorted[sorted.length - 1],
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)],
        sampleSize: sorted.length,
        timestamp: Date.now(),
      });
    }

    return results;
  },
});

// Batch key operations for better performance
export const batchEncryptKeys = action({
  args: {
    keys: v.array(
      v.object({
        provider: v.string(),
        key: v.string(),
      })
    ),
  },
  handler: async (ctx, args): Promise<any> => {
    const results = [];
    const batches = [];

    // Split into batches
    for (let i = 0; i < args.keys.length; i += BATCH_SIZE) {
      batches.push(args.keys.slice(i, i + BATCH_SIZE));
    }

    // Process batches with limited concurrency
    for (const batch of batches) {
      const batchPromises = batch.map(async (keyData): Promise<any> => {
        const startTime = Date.now();
        try {
          // This would call the actual encryption logic
          const result = await ctx.runMutation(
            api.providerKeys.upsertProviderKey,
            keyData
          );

          await ctx.runMutation(api.performance.trackPerformance, {
            operation: "batch_encrypt",
            duration: Date.now() - startTime,
            success: true,
          });

          return { ...result, provider: keyData.provider };
        } catch (error) {
          await ctx.runMutation(api.performance.trackPerformance, {
            operation: "batch_encrypt",
            duration: Date.now() - startTime,
            success: false,
          });

          throw error;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);
    }

    return {
      total: args.keys.length,
      successful: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
      results,
    };
  },
});

// Optimize database queries with caching
export const getCachedProviderKey = action({
  args: {
    userId: v.id("users"),
    provider: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    const cacheKey = `${args.userId}:${args.provider}`;

    // Check cache first
    const cached = await ctx.runQuery(api.performance.getCache, {
      key: cacheKey,
    });

    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.value;
    }

    // Fetch from database
    const startTime = Date.now();
    const key = await ctx.runAction(api.providerKeys.getProviderKey, {
      userId: args.userId,
      provider: args.provider,
    });

    // Track performance
    await ctx.runMutation(api.performance.trackPerformance, {
      operation: "get_provider_key",
      duration: Date.now() - startTime,
      success: key !== null,
    });

    // Update cache
    if (key) {
      await ctx.runMutation(api.performance.setCache, {
        key: cacheKey,
        value: key,
      });
    }

    return key;
  },
});

// Cache management
export const getCache = query({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("performanceCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
  },
});

export const setCache = mutation({
  args: {
    key: v.string(),
    value: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("performanceCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        timestamp: Date.now(),
      });
    } else {
      await ctx.db.insert("performanceCache", {
        key: args.key,
        value: args.value,
        timestamp: Date.now(),
      });
    }
  },
});

// Analyze performance and provide optimization suggestions
export const analyzePerformance = action({
  args: {},
  handler: async (ctx): Promise<OptimizationSuggestion[]> => {
    const stats = await ctx.runQuery(api.performance.getPerformanceStats, {
      since: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
    });

    const suggestions: OptimizationSuggestion[] = [];

    // Analyze each operation
    for (const stat of stats) {
      // Check for slow operations
      if (stat.p95 > 1000) {
        suggestions.push({
          area: stat.operation,
          impact: "high",
          suggestion: `Operation "${stat.operation}" has high p95 latency (${stat.p95}ms)`,
          estimatedImprovement: "30-50% reduction in response time",
        });
      }

      // Check for high variance
      const variance = stat.maxTime - stat.minTime;
      if (variance > stat.averageTime * 5) {
        suggestions.push({
          area: stat.operation,
          impact: "medium",
          suggestion: `Operation "${stat.operation}" has high variance in execution time`,
          estimatedImprovement: "More consistent performance",
        });
      }
    }

    // Check cache hit rates
    const cacheOps = stats.filter((s: any) => s.operation.includes("cache"));
    const nonCacheOps = stats.filter(
      (s: any) => !s.operation.includes("cache")
    );

    if (cacheOps.length > 0 && nonCacheOps.length > 0) {
      const avgCacheTime =
        cacheOps.reduce((sum: any, s: any) => sum + s.averageTime, 0) /
        cacheOps.length;
      const avgNonCacheTime =
        nonCacheOps.reduce((sum: any, s: any) => sum + s.averageTime, 0) /
        nonCacheOps.length;

      if (avgNonCacheTime > avgCacheTime * 3) {
        suggestions.push({
          area: "caching",
          impact: "high",
          suggestion: "Increase cache usage for frequently accessed data",
          estimatedImprovement: `${Math.round((1 - avgCacheTime / avgNonCacheTime) * 100)}% faster reads`,
        });
      }
    }

    // Check for operations that could be batched
    const highFreqOps = stats.filter((s: any) => s.sampleSize > 100);
    for (const op of highFreqOps) {
      if (!op.operation.includes("batch")) {
        suggestions.push({
          area: op.operation,
          impact: "medium",
          suggestion: `Consider batching "${op.operation}" operations`,
          estimatedImprovement: "Reduce API calls by 50-80%",
        });
      }
    }

    return suggestions;
  },
});

// Cleanup old performance data
export const cleanupPerformanceData = mutation({
  args: {
    olderThan: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = args.olderThan || Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

    // Clean metrics
    const oldMetrics = await ctx.db
      .query("performanceMetrics")
      .filter((q) => q.lt(q.field("timestamp"), cutoff))
      .collect();

    let deletedCount = 0;
    for (const metric of oldMetrics) {
      await ctx.db.delete(metric._id);
      deletedCount++;
    }

    // Clean cache
    const oldCache = await ctx.db
      .query("performanceCache")
      .filter((q) => q.lt(q.field("timestamp"), cutoff))
      .collect();

    for (const cache of oldCache) {
      await ctx.db.delete(cache._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});

// Optimize key rotation performance
export const optimizedBatchRotation = action({
  args: {
    userId: v.id("users"),
    providers: v.optional(v.array(v.string())),
    newKeyVersion: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    const startTime = Date.now();

    // Get all keys to rotate
    const keys = await ctx.runQuery(api.providerKeys.listUserProviderKeys, {});
    const keysToRotate = args.providers
      ? keys.filter((k: any) => args.providers!.includes(k.provider))
      : keys;

    if (keysToRotate.length === 0) {
      return { rotated: 0, duration: 0 };
    }

    // Rotate in parallel with limited concurrency
    const results = [];
    for (let i = 0; i < keysToRotate.length; i += MAX_CONCURRENT_OPERATIONS) {
      const batch = keysToRotate.slice(i, i + MAX_CONCURRENT_OPERATIONS);
      const batchPromises = batch.map((key: any) =>
        ctx.runAction(api.actions.rotateKeys.rotateProviderKey, {
          userId: args.userId,
          provider: key.provider,
          newKeyVersion: args.newKeyVersion,
        })
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);
    }

    const duration = Date.now() - startTime;
    const successful = results.filter((r) => r.status === "fulfilled").length;

    // Track performance
    await ctx.runMutation(api.performance.trackPerformance, {
      operation: "optimized_batch_rotation",
      duration,
      success: successful === keysToRotate.length,
      metadata: {
        totalKeys: keysToRotate.length,
        successful,
      },
    });

    return {
      rotated: successful,
      failed: keysToRotate.length - successful,
      duration,
      averagePerKey: duration / keysToRotate.length,
    };
  },
});
