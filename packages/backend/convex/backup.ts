import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { authenticatedMutation, authenticatedQuery } from "./lib/auth";
import { getDefaultEnvelopeEncryption } from "./lib/envelope";
import { CryptoError } from "./lib/crypto";

const BACKUP_RETENTION_DAYS = 30;
const MAX_BACKUP_SIZE_MB = 100;
const BACKUP_VERSION = "1.0.0";

export type BackupMetadata = {
  id: string;
  userId: Id<"users">;
  version: string;
  createdAt: number;
  expiresAt: number;
  size: number;
  keyCount: number;
  checksum: string;
  encrypted: boolean;
};

export type BackupData = {
  version: string;
  userId: Id<"users">;
  timestamp: number;
  keys: Array<{
    provider: string;
    encryptedKey: string;
    keyVersion: number;
    metadata: any;
  }>;
  checksum: string;
};

export type RestoreResult = {
  success: boolean;
  keysRestored: number;
  keysFailed: number;
  errors: string[];
};

// Create a backup of user's provider keys
export const createBackup = authenticatedMutation({
  args: {
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("providerKeys")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    if (keys.length === 0) {
      throw new Error("No keys to backup");
    }

    const backupData: BackupData = {
      version: BACKUP_VERSION,
      userId: ctx.userId,
      timestamp: Date.now(),
      keys: keys.map((key) => ({
        provider: key.provider,
        encryptedKey: key.encryptedKey,
        keyVersion: key.keyVersion,
        metadata: {
          encryptedDataKey: key.encryptedDataKey,
          nonce: key.nonce,
          tag: key.tag,
          dataKeyNonce: key.dataKeyNonce,
          dataKeyTag: key.dataKeyTag,
          masterKeyId: key.masterKeyId,
          createdAt: key.createdAt,
          lastUsedAt: key.lastUsedAt,
        },
      })),
      checksum: "",
    };

    // Calculate checksum
    const dataString = JSON.stringify(backupData.keys);
    backupData.checksum = await calculateChecksum(dataString);

    // Encrypt the backup
    const envelope = getDefaultEnvelopeEncryption();
    const encryptedBackup = await envelope.encryptProviderKey(
      JSON.stringify(backupData)
    );

    // Store backup metadata
    const backupId = await ctx.db.insert("backups", {
      userId: ctx.userId,
      version: BACKUP_VERSION,
      createdAt: Date.now(),
      expiresAt: Date.now() + BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      size: JSON.stringify(encryptedBackup).length,
      keyCount: keys.length,
      checksum: backupData.checksum,
      description: args.description,
      encryptedData: JSON.stringify(encryptedBackup),
    });

    // Log backup creation
    await ctx.db.insert("auditLog", {
      operation: "backup_created",
      userId: ctx.userId,
      timestamp: Date.now(),
      success: true,
      metadata: {
        backupId,
        keyCount: keys.length,
      },
    });

    return {
      backupId,
      keyCount: keys.length,
      size: JSON.stringify(encryptedBackup).length,
      expiresAt: Date.now() + BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    };
  },
});

// List user's backups
export const listBackups = authenticatedQuery({
  args: {
    includeExpired: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("backups")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .order("desc");

    if (!args.includeExpired) {
      query = query.filter((q) => q.gt(q.field("expiresAt"), Date.now()));
    }

    const backups = await query.collect();

    return backups.map((backup) => ({
      id: backup._id,
      version: backup.version,
      createdAt: backup.createdAt,
      expiresAt: backup.expiresAt,
      size: backup.size,
      keyCount: backup.keyCount,
      description: backup.description,
      expired: backup.expiresAt < Date.now(),
    }));
  },
});

// Restore from backup
export const restoreFromBackup = authenticatedMutation({
  args: {
    backupId: v.id("backups"),
    overwrite: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<RestoreResult> => {
    const backup = await ctx.db.get(args.backupId);

    if (!backup) {
      throw new Error("Backup not found");
    }

    if (backup.userId !== ctx.userId) {
      throw new Error("Unauthorized: Cannot restore another user's backup");
    }

    if (backup.expiresAt < Date.now()) {
      throw new Error("Backup has expired");
    }

    try {
      // Decrypt the backup
      const envelope = getDefaultEnvelopeEncryption();
      const encryptedData = JSON.parse(backup.encryptedData);
      const decryptedData = await envelope.decryptProviderKey(encryptedData);
      const backupData: BackupData = JSON.parse(decryptedData);

      // Verify checksum
      const dataString = JSON.stringify(backupData.keys);
      const currentChecksum = await calculateChecksum(dataString);

      if (currentChecksum !== backupData.checksum) {
        throw new Error("Backup integrity check failed");
      }

      // Verify user ID matches
      if (backupData.userId !== ctx.userId) {
        throw new Error("Backup user ID mismatch");
      }

      const result: RestoreResult = {
        success: true,
        keysRestored: 0,
        keysFailed: 0,
        errors: [],
      };

      // Restore each key
      for (const keyData of backupData.keys) {
        try {
          const existing = await ctx.db
            .query("providerKeys")
            .withIndex("by_provider", (q) =>
              q.eq("userId", ctx.userId).eq("provider", keyData.provider)
            )
            .unique();

          if (existing && !args.overwrite) {
            result.errors.push(
              `Key for provider ${keyData.provider} already exists`
            );
            result.keysFailed++;
            continue;
          }

          if (existing) {
            await ctx.db.patch(existing._id, {
              encryptedKey: keyData.encryptedKey,
              encryptedDataKey: keyData.metadata.encryptedDataKey,
              keyVersion: keyData.keyVersion,
              nonce: keyData.metadata.nonce,
              tag: keyData.metadata.tag,
              dataKeyNonce: keyData.metadata.dataKeyNonce,
              dataKeyTag: keyData.metadata.dataKeyTag,
              masterKeyId: keyData.metadata.masterKeyId,
              createdAt: Date.now(),
            });
          } else {
            await ctx.db.insert("providerKeys", {
              userId: ctx.userId,
              provider: keyData.provider,
              encryptedKey: keyData.encryptedKey,
              encryptedDataKey: keyData.metadata.encryptedDataKey,
              keyVersion: keyData.keyVersion,
              nonce: keyData.metadata.nonce,
              tag: keyData.metadata.tag,
              dataKeyNonce: keyData.metadata.dataKeyNonce,
              dataKeyTag: keyData.metadata.dataKeyTag,
              masterKeyId: keyData.metadata.masterKeyId,
              createdAt: Date.now(),
            });
          }

          result.keysRestored++;
        } catch (error) {
          result.errors.push(
            `Failed to restore ${keyData.provider}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
          result.keysFailed++;
        }
      }

      // Log restore operation
      await ctx.db.insert("auditLog", {
        operation: "backup_restored",
        userId: ctx.userId,
        timestamp: Date.now(),
        success: result.keysFailed === 0,
        metadata: {
          backupId: args.backupId,
          keysRestored: result.keysRestored,
          keysFailed: result.keysFailed,
        },
      });

      return result;
    } catch (error) {
      // Log failed restore
      await ctx.db.insert("auditLog", {
        operation: "backup_restore_failed",
        userId: ctx.userId,
        timestamp: Date.now(),
        success: false,
        metadata: {
          backupId: args.backupId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

      throw error;
    }
  },
});

// Delete a backup
export const deleteBackup = authenticatedMutation({
  args: {
    backupId: v.id("backups"),
  },
  handler: async (ctx, args) => {
    const backup = await ctx.db.get(args.backupId);

    if (!backup) {
      throw new Error("Backup not found");
    }

    if (backup.userId !== ctx.userId) {
      throw new Error("Unauthorized: Cannot delete another user's backup");
    }

    await ctx.db.delete(args.backupId);

    // Log deletion
    await ctx.db.insert("auditLog", {
      operation: "backup_deleted",
      userId: ctx.userId,
      timestamp: Date.now(),
      success: true,
      metadata: {
        backupId: args.backupId,
      },
    });

    return { deleted: true };
  },
});

// Export backup (for download)
export const exportBackup = authenticatedQuery({
  args: {
    backupId: v.id("backups"),
  },
  handler: async (ctx, args) => {
    const backup = await ctx.db.get(args.backupId);

    if (!backup) {
      throw new Error("Backup not found");
    }

    if (backup.userId !== ctx.userId) {
      throw new Error("Unauthorized: Cannot export another user's backup");
    }

    // Return encrypted backup data for client-side download
    return {
      id: backup._id,
      version: backup.version,
      createdAt: backup.createdAt,
      encryptedData: backup.encryptedData,
      checksum: backup.checksum,
    };
  },
});

// Import backup (from upload)
export const importBackup = authenticatedMutation({
  args: {
    encryptedData: v.string(),
    checksum: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      // Parse and validate the encrypted data
      const encryptedBackup = JSON.parse(args.encryptedData);

      // Decrypt to validate
      const envelope = getDefaultEnvelopeEncryption();
      const decryptedData = await envelope.decryptProviderKey(encryptedBackup);
      const backupData: BackupData = JSON.parse(decryptedData);

      // Verify checksum
      if (backupData.checksum !== args.checksum) {
        throw new Error("Backup checksum mismatch");
      }

      // Verify user ID
      if (backupData.userId !== ctx.userId) {
        throw new Error("Backup belongs to a different user");
      }

      // Store the imported backup
      const backupId = await ctx.db.insert("backups", {
        userId: ctx.userId,
        version: backupData.version,
        createdAt: Date.now(),
        expiresAt: Date.now() + BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000,
        size: args.encryptedData.length,
        keyCount: backupData.keys.length,
        checksum: args.checksum,
        description: args.description || "Imported backup",
        encryptedData: args.encryptedData,
      });

      return {
        backupId,
        keyCount: backupData.keys.length,
      };
    } catch (error) {
      throw new Error(
        `Failed to import backup: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});

// Clean up expired backups
export const cleanupExpiredBackups = mutation({
  args: {},
  handler: async (ctx) => {
    const expiredBackups = await ctx.db
      .query("backups")
      .filter((q) => q.lt(q.field("expiresAt"), Date.now()))
      .collect();

    let deletedCount = 0;
    for (const backup of expiredBackups) {
      await ctx.db.delete(backup._id);
      deletedCount++;
    }

    if (deletedCount > 0) {
      await ctx.db.insert("auditLog", {
        operation: "expired_backups_cleaned",
        userId: "system" as Id<"users">,
        timestamp: Date.now(),
        success: true,
        metadata: {
          deletedCount,
        },
      });
    }

    return { deletedCount };
  },
});

// Helper function to calculate checksum
async function calculateChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Verify backup integrity
export const verifyBackup = authenticatedQuery({
  args: {
    backupId: v.id("backups"),
  },
  handler: async (ctx, args) => {
    const backup = await ctx.db.get(args.backupId);

    if (!backup) {
      throw new Error("Backup not found");
    }

    if (backup.userId !== ctx.userId) {
      throw new Error("Unauthorized");
    }

    try {
      const envelope = getDefaultEnvelopeEncryption();
      const encryptedData = JSON.parse(backup.encryptedData);
      const decryptedData = await envelope.decryptProviderKey(encryptedData);
      const backupData: BackupData = JSON.parse(decryptedData);

      const dataString = JSON.stringify(backupData.keys);
      const currentChecksum = await calculateChecksum(dataString);

      return {
        valid: currentChecksum === backupData.checksum,
        checksum: backup.checksum,
        keyCount: backup.keyCount,
        createdAt: backup.createdAt,
        expiresAt: backup.expiresAt,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
