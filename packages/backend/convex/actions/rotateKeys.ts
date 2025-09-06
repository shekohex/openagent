import { v } from "convex/values";
import { api } from "../_generated/api";
import { action } from "../_generated/server";
import { CryptoError } from "../lib/crypto";
import { getDefaultEnvelopeEncryption } from "../lib/envelope";

export type RotationResult = {
  provider: string;
  success: boolean;
  oldVersion: number;
  newVersion: number;
  error?: string;
};

export type BatchRotationResult = {
  totalKeys: number;
  successCount: number;
  failureCount: number;
  results: RotationResult[];
};

export const rotateProviderKey = action({
  args: {
    userId: v.id("users"),
    provider: v.string(),
    newKeyVersion: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<RotationResult> => {
    try {
      const encryptedKey = await ctx.runQuery(
        api.providerKeys.getEncryptedProviderKey,
        {
          userId: args.userId,
          provider: args.provider,
        }
      );

      if (!encryptedKey) {
        return {
          provider: args.provider,
          success: false,
          oldVersion: 0,
          newVersion: 0,
          error: `No key found for provider: ${args.provider}`,
        };
      }

      const envelope = getDefaultEnvelopeEncryption();
      const currentVersion = encryptedKey.keyVersion;
      const targetVersion =
        args.newKeyVersion || envelope.getCurrentKeyVersion();

      if (currentVersion >= targetVersion) {
        return {
          provider: args.provider,
          success: false,
          oldVersion: currentVersion,
          newVersion: targetVersion,
          error: `Key is already at version ${currentVersion}, target version ${targetVersion} not newer`,
        };
      }

      const rotatedKey = await envelope.rotateKey(encryptedKey, targetVersion);

      const result = await ctx.runMutation(
        api.providerKeys.updateProviderKeyData,
        {
          userId: args.userId,
          provider: args.provider,
          encryptedKey: rotatedKey.encryptedKey,
          encryptedDataKey: rotatedKey.encryptedDataKey,
          keyVersion: rotatedKey.keyVersion,
          nonce: rotatedKey.nonce,
          tag: rotatedKey.tag,
          dataKeyNonce: rotatedKey.dataKeyNonce,
          dataKeyTag: rotatedKey.dataKeyTag,
          masterKeyId: rotatedKey.masterKeyId,
        }
      );

      if (!result.success) {
        return {
          provider: args.provider,
          success: false,
          oldVersion: currentVersion,
          newVersion: targetVersion,
          error: "Failed to update key in database",
        };
      }

      await ctx.runMutation(api.providerKeys.addRotationAuditLog, {
        userId: args.userId,
        provider: args.provider,
        oldVersion: currentVersion,
        newVersion: targetVersion,
        timestamp: Date.now(),
      });

      return {
        provider: args.provider,
        success: true,
        oldVersion: currentVersion,
        newVersion: targetVersion,
      };
    } catch (error) {
      const errorMessage =
        error instanceof CryptoError ? error.message : "Unknown rotation error";

      return {
        provider: args.provider,
        success: false,
        oldVersion: 0,
        newVersion: 0,
        error: errorMessage,
      };
    }
  },
});

export const rotateAllUserKeys = action({
  args: {
    userId: v.id("users"),
    newKeyVersion: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<BatchRotationResult> => {
    const userKeys = await ctx.runQuery(
      api.providerKeys.listUserProviderKeys,
      {}
    );

    const results: RotationResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const key of userKeys) {
      const result = await ctx.runAction(
        api.actions.rotateKeys.rotateProviderKey,
        {
          userId: args.userId,
          provider: key.provider,
          newKeyVersion: args.newKeyVersion,
        }
      );

      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    return {
      totalKeys: userKeys.length,
      successCount,
      failureCount,
      results,
    };
  },
});

export const rotateSpecificProviders = action({
  args: {
    userId: v.id("users"),
    providers: v.array(v.string()),
    newKeyVersion: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<BatchRotationResult> => {
    const results: RotationResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const provider of args.providers) {
      const result = await ctx.runAction(
        api.actions.rotateKeys.rotateProviderKey,
        {
          userId: args.userId,
          provider,
          newKeyVersion: args.newKeyVersion,
        }
      );

      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    return {
      totalKeys: args.providers.length,
      successCount,
      failureCount,
      results,
    };
  },
});

const DEFAULT_ROTATION_HISTORY_LIMIT = 50;

export type RotationAuditLog = {
  userId: string;
  provider: string;
  oldVersion: number;
  newVersion: number;
  timestamp: number;
  success: boolean;
  error?: string;
};

export type ScheduledRotationResult = {
  created?: boolean;
  updated?: boolean;
  id: string;
};

export const getRotationHistory = action({
  args: {
    userId: v.id("users"),
    provider: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<RotationAuditLog[]> => {
    return await ctx.runQuery(api.providerKeys.getRotationAuditLogs, {
      userId: args.userId,
      provider: args.provider,
      limit: args.limit || DEFAULT_ROTATION_HISTORY_LIMIT,
    });
  },
});

export const scheduleKeyRotation = action({
  args: {
    userId: v.id("users"),
    provider: v.string(),
    scheduledFor: v.number(),
    newKeyVersion: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ScheduledRotationResult> => {
    const now = Date.now();
    if (args.scheduledFor <= now) {
      throw new Error("Scheduled time must be in the future");
    }

    const existingKey = await ctx.runQuery(api.providerKeys.hasProviderKey, {
      provider: args.provider,
    });

    if (!existingKey) {
      throw new Error(`No key found for provider: ${args.provider}`);
    }

    return await ctx.runMutation(api.providerKeys.addScheduledRotation, {
      userId: args.userId,
      provider: args.provider,
      scheduledFor: args.scheduledFor,
      newKeyVersion: args.newKeyVersion,
    });
  },
});
