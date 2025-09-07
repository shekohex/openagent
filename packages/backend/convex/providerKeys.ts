import { v } from "convex/values";
import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import { authenticatedMutation, authenticatedQuery } from "./lib/auth";
import { CryptoError } from "./lib/crypto";
import { getDefaultEnvelopeEncryption } from "./lib/envelope";

const MAX_PROVIDER_NAME_LENGTH = 50;
const MIN_PROVIDER_KEY_LENGTH = 8;
const MAX_PROVIDER_KEY_LENGTH = 1000;
const HOURS_IN_DAY = 24;
const MINUTES_IN_HOUR = 60;
const SECONDS_IN_MINUTE = 60;
const MILLISECONDS_IN_SECOND = 1000;
const PROVIDER_CACHE_TTL =
  HOURS_IN_DAY * MINUTES_IN_HOUR * SECONDS_IN_MINUTE * MILLISECONDS_IN_SECOND;
const DEFAULT_AUDIT_LOG_LIMIT = 50;
const MAX_SCHEDULED_ROTATIONS = 100;

const PROVIDER_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

type CachedProviders = {
  providers: string[];
  updatedAt: number;
};

function validateProviderName(provider: string): void {
  if (!provider || typeof provider !== "string") {
    throw new Error("Provider name is required");
  }

  const trimmed = provider.trim();
  if (trimmed.length === 0) {
    throw new Error("Provider name cannot be empty");
  }

  if (trimmed.length > MAX_PROVIDER_NAME_LENGTH) {
    throw new Error(
      `Provider name too long (max ${MAX_PROVIDER_NAME_LENGTH} characters)`
    );
  }

  if (!PROVIDER_NAME_REGEX.test(trimmed)) {
    throw new Error(
      "Provider name must start with alphanumeric and contain only letters, numbers, dots, hyphens, and underscores"
    );
  }
}

export const listUserProviderKeys = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const keys = await ctx.db
      .query("providerKeys")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .collect();

    return keys.map((key) => ({
      provider: key.provider,
      keyVersion: key.keyVersion,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
    }));
  },
});

export const hasProviderKey = authenticatedQuery({
  args: { provider: v.string() },
  handler: async (ctx, args) => {
    try {
      validateProviderName(args.provider);
    } catch {
      return false;
    }

    const existing = await ctx.db
      .query("providerKeys")
      .withIndex("by_provider", (q) =>
        q
          .eq("userId", ctx.userId)
          .eq("provider", args.provider.trim().toLowerCase())
      )
      .unique();

    return existing !== null;
  },
});

export const upsertProviderKey = authenticatedMutation({
  args: {
    provider: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    validateProviderName(args.provider);

    if (!args.key || args.key.trim().length === 0) {
      // TODO: Audit failed validation
      // await ctx.runMutation(api.auditLog.logSecurityEvent, {
      //   operation: "key_create",
      //   userId: ctx.userId,
      //   provider: args.provider,
      //   success: false,
      //   severity: "warning",
      //   errorMessage: "Provider key cannot be empty",
      // });
      throw new Error("Provider key cannot be empty");
    }

    const trimmedKey = args.key.trim();
    const normalizedProvider = args.provider.trim().toLowerCase();

    if (trimmedKey.length < MIN_PROVIDER_KEY_LENGTH) {
      throw new Error(
        `Provider key too short (minimum ${MIN_PROVIDER_KEY_LENGTH} characters)`
      );
    }

    if (trimmedKey.length > MAX_PROVIDER_KEY_LENGTH) {
      throw new Error(
        `Provider key too long (maximum ${MAX_PROVIDER_KEY_LENGTH} characters)`
      );
    }

    try {
      const envelope = getDefaultEnvelopeEncryption();
      const encryptedKey = await envelope.encryptProviderKey(trimmedKey);

      const existing = await ctx.db
        .query("providerKeys")
        .withIndex("by_provider", (q) =>
          q.eq("userId", ctx.userId).eq("provider", normalizedProvider)
        )
        .unique();

      const now = Date.now();

      if (existing) {
        await ctx.db.patch(existing._id, {
          encryptedKey: encryptedKey.encryptedKey,
          encryptedDataKey: encryptedKey.encryptedDataKey,
          keyVersion: encryptedKey.keyVersion,
          nonce: encryptedKey.nonce,
          tag: encryptedKey.tag,
          dataKeyNonce: encryptedKey.dataKeyNonce,
          dataKeyTag: encryptedKey.dataKeyTag,
          masterKeyId: encryptedKey.masterKeyId,
          createdAt: now,
        });
        return { updated: true, provider: normalizedProvider };
      }

      await ctx.db.insert("providerKeys", {
        userId: ctx.userId,
        provider: normalizedProvider,
        encryptedKey: encryptedKey.encryptedKey,
        encryptedDataKey: encryptedKey.encryptedDataKey,
        keyVersion: encryptedKey.keyVersion,
        nonce: encryptedKey.nonce,
        tag: encryptedKey.tag,
        dataKeyNonce: encryptedKey.dataKeyNonce,
        dataKeyTag: encryptedKey.dataKeyTag,
        masterKeyId: encryptedKey.masterKeyId,
        createdAt: now,
      });

      // TODO: Audit successful key creation
      // await ctx.runMutation(api.auditLog.logSecurityEvent, {
      //   operation: "key_create",
      //   userId: ctx.userId,
      //   provider: normalizedProvider,
      //   success: true,
      //   severity: "info",
      //   metadata: {
      //     keyVersion: encryptedKey.keyVersion,
      //   },
      // });

      return { created: true, provider: normalizedProvider };
    } catch (error) {
      if (error instanceof CryptoError) {
        throw new Error(`Encryption error: ${error.message}`);
      }
      throw new Error("Failed to store provider key");
    }
  },
});

export const deleteProviderKey = authenticatedMutation({
  args: {
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    validateProviderName(args.provider);

    const normalizedProvider = args.provider.trim().toLowerCase();
    const existing = await ctx.db
      .query("providerKeys")
      .withIndex("by_provider", (q) =>
        q.eq("userId", ctx.userId).eq("provider", normalizedProvider)
      )
      .unique();

    if (!existing) {
      throw new Error(`No key found for provider: ${args.provider}`);
    }

    await ctx.db.delete(existing._id);
    return { deleted: true, provider: normalizedProvider };
  },
});

export const getProviderKey = action({
  args: {
    userId: v.id("users"),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    validateProviderName(args.provider);

    const normalizedProvider = args.provider.trim().toLowerCase();
    const key = await ctx.runQuery(api.providerKeys.getEncryptedProviderKey, {
      userId: args.userId,
      provider: normalizedProvider,
    });

    if (!key) {
      return null;
    }

    try {
      const envelope = getDefaultEnvelopeEncryption();
      const decryptedKey = await envelope.decryptProviderKey(key);

      await ctx.runMutation(api.providerKeys.updateLastUsed, {
        userId: args.userId,
        provider: normalizedProvider,
      });

      return decryptedKey;
    } catch (error) {
      if (error instanceof CryptoError) {
        throw new Error(`Decryption error: ${error.message}`);
      }
      throw new Error("Failed to decrypt provider key");
    }
  },
});

export const getEncryptedProviderKey = query({
  args: {
    userId: v.id("users"),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query("providerKeys")
      .withIndex("by_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider)
      )
      .unique();

    if (!key) {
      return null;
    }

    return {
      encryptedKey: key.encryptedKey,
      encryptedDataKey: key.encryptedDataKey,
      keyVersion: key.keyVersion,
      nonce: key.nonce,
      tag: key.tag,
      dataKeyNonce: key.dataKeyNonce,
      dataKeyTag: key.dataKeyTag,
      masterKeyId: key.masterKeyId,
    };
  },
});

export const updateLastUsed = mutation({
  args: {
    userId: v.id("users"),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query("providerKeys")
      .withIndex("by_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider)
      )
      .unique();

    if (key) {
      await ctx.db.patch(key._id, {
        lastUsedAt: Date.now(),
      });
    }
  },
});

export const getKnownProviders = action({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const cached: CachedProviders | null = await ctx.runQuery(
      api.providerKeys.getCachedProviders,
      {}
    );

    if (cached && Date.now() - cached.updatedAt < PROVIDER_CACHE_TTL) {
      return cached.providers;
    }

    try {
      const response = await fetch("https://models.dev/api.json");
      if (!response.ok) {
        throw new Error("Failed to fetch providers");
      }

      const data = await response.json();
      const providers = Object.keys(data).sort();

      await ctx.runMutation(api.providerKeys.updateCachedProviders, {
        providers,
      });

      return providers;
    } catch {
      if (cached) {
        return cached.providers;
      }

      return [
        "openai",
        "anthropic",
        "google",
        "openrouter",
        "groq",
        "togetherai",
        "mistral",
      ];
    }
  },
});

export const getCachedProviders = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("providerCache").order("desc").first();
  },
});

export const updateCachedProviders = mutation({
  args: {
    providers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("providerCache").order("desc").first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        providers: args.providers,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("providerCache", {
        providers: args.providers,
        updatedAt: Date.now(),
      });
    }
  },
});

export const updateProviderKeyData = mutation({
  args: {
    userId: v.id("users"),
    provider: v.string(),
    encryptedKey: v.string(),
    encryptedDataKey: v.string(),
    keyVersion: v.number(),
    nonce: v.string(),
    tag: v.string(),
    dataKeyNonce: v.string(),
    dataKeyTag: v.string(),
    masterKeyId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("providerKeys")
      .withIndex("by_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider)
      )
      .unique();

    if (!existing) {
      return { success: false, error: "Provider key not found" };
    }

    await ctx.db.patch(existing._id, {
      encryptedKey: args.encryptedKey,
      encryptedDataKey: args.encryptedDataKey,
      keyVersion: args.keyVersion,
      nonce: args.nonce,
      tag: args.tag,
      dataKeyNonce: args.dataKeyNonce,
      dataKeyTag: args.dataKeyTag,
      masterKeyId: args.masterKeyId,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const addRotationAuditLog = mutation({
  args: {
    userId: v.id("users"),
    provider: v.string(),
    oldVersion: v.number(),
    newVersion: v.number(),
    timestamp: v.number(),
    success: v.optional(v.boolean()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("keyRotationAudit", {
      userId: args.userId,
      provider: args.provider,
      oldVersion: args.oldVersion,
      newVersion: args.newVersion,
      timestamp: args.timestamp,
      success: args.success ?? true,
      error: args.error,
    });
  },
});

export const getRotationAuditLogs = query({
  args: {
    userId: v.id("users"),
    provider: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || DEFAULT_AUDIT_LOG_LIMIT;

    if (args.provider !== undefined) {
      const provider = args.provider;
      return await ctx.db
        .query("keyRotationAudit")
        .withIndex("by_provider", (q) =>
          q.eq("userId", args.userId).eq("provider", provider)
        )
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("keyRotationAudit")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

export const addScheduledRotation = mutation({
  args: {
    userId: v.id("users"),
    provider: v.string(),
    scheduledFor: v.number(),
    newKeyVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("scheduledRotations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) =>
        q.and(
          q.eq(q.field("provider"), args.provider),
          q.eq(q.field("status"), "pending")
        )
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        scheduledFor: args.scheduledFor,
        newKeyVersion: args.newKeyVersion,
      });
      return { updated: true, id: existing._id };
    }

    const id = await ctx.db.insert("scheduledRotations", {
      userId: args.userId,
      provider: args.provider,
      scheduledFor: args.scheduledFor,
      newKeyVersion: args.newKeyVersion,
      status: "pending",
      createdAt: Date.now(),
    });

    return { created: true, id };
  },
});

export const getPendingRotations = query({
  args: {
    userId: v.optional(v.id("users")),
    before: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = args.before || Date.now();

    let rotationQuery = ctx.db
      .query("scheduledRotations")
      .withIndex("by_schedule", (q) => q.lte("scheduledFor", cutoff))
      .filter((q) => q.eq(q.field("status"), "pending"));

    if (args.userId) {
      rotationQuery = rotationQuery.filter((q) =>
        q.eq(q.field("userId"), args.userId)
      );
    }

    return await rotationQuery.take(MAX_SCHEDULED_ROTATIONS);
  },
});
