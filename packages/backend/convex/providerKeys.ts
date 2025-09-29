import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import {
  CryptoError,
  getDefaultEnvelopeEncryption,
} from "@openagent/crypto-lib";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  authenticatedInternalMutation,
  authenticatedMutation,
  authenticatedQuery,
} from "./authenticated";

const MAX_PROVIDER_NAME_LENGTH = 50;
const MIN_PROVIDER_KEY_LENGTH = 8;
const MAX_PROVIDER_KEY_LENGTH = 1000;
const PROVIDER_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Key management operations - balanced for security and usability
  upsertProviderKey: {
    kind: "token bucket",
    rate: 30, // Allow setup of multiple keys
    period: HOUR,
    capacity: 5, // Allow small bursts for initial setup
  },
  deleteProviderKey: {
    kind: "token bucket",
    rate: 20, // Deletion is less common
    period: HOUR,
    capacity: 3,
  },
  getProviderKey: {
    kind: "token bucket",
    rate: 5000, // High limit - this is for actual API usage
    period: HOUR,
    capacity: 50, // Allow bursts for batch operations
  },
});

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
    await rateLimiter.limit(ctx, "upsertProviderKey", {
      key: ctx.userId,
      throws: true,
    });

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
    await rateLimiter.limit(ctx, "deleteProviderKey", {
      key: ctx.userId,
      throws: true,
    });

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

export const getProviderKey = authenticatedInternalMutation({
  args: {
    provider: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "getProviderKey", {
      key: ctx.userId,
      throws: true,
    });

    validateProviderName(args.provider);

    const normalizedProvider = args.provider.trim().toLowerCase();

    // Get the encrypted key directly from database
    const key = await ctx.db
      .query("providerKeys")
      .withIndex("by_provider", (q) =>
        q.eq("userId", ctx.userId).eq("provider", normalizedProvider)
      )
      .unique();

    if (!key) {
      return null;
    }

    try {
      // Decrypt the key using envelope encryption (Web Crypto API)
      const envelope = getDefaultEnvelopeEncryption();
      const storedKey = {
        encryptedKey: key.encryptedKey,
        encryptedDataKey: key.encryptedDataKey,
        keyVersion: key.keyVersion,
        nonce: key.nonce,
        tag: key.tag,
        dataKeyNonce: key.dataKeyNonce,
        dataKeyTag: key.dataKeyTag,
        masterKeyId: key.masterKeyId,
      };

      const decryptedKey = await envelope.decryptProviderKey(storedKey);

      // Update last used timestamp
      await ctx.db.patch(key._id, {
        lastUsedAt: Date.now(),
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

export const getEncryptedProviderKey = internalQuery({
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

export const updateLastUsed = internalMutation({
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

export const listUserProviderKeysInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("providerKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
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

export const getProviderKeyInternal = internalMutation({
  args: {
    userId: v.id("users"),
    provider: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    validateProviderName(args.provider);

    const normalizedProvider = args.provider.trim().toLowerCase();

    // Get the encrypted key directly from database
    const key = await ctx.db
      .query("providerKeys")
      .withIndex("by_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", normalizedProvider)
      )
      .unique();

    if (!key) {
      return null;
    }

    try {
      // Decrypt the key using envelope encryption (Web Crypto API)
      const envelope = getDefaultEnvelopeEncryption();
      const storedKey = {
        encryptedKey: key.encryptedKey,
        encryptedDataKey: key.encryptedDataKey,
        keyVersion: key.keyVersion,
        nonce: key.nonce,
        tag: key.tag,
        dataKeyNonce: key.dataKeyNonce,
        dataKeyTag: key.dataKeyTag,
        masterKeyId: key.masterKeyId,
      };

      const decryptedKey = await envelope.decryptProviderKey(storedKey);

      // Update last used timestamp
      await ctx.db.patch(key._id, {
        lastUsedAt: Date.now(),
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

export const updateProviderKeyData = internalMutation({
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
