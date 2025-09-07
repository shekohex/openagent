import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { CryptoError } from "./lib/crypto";

describe("Provider Keys - Access Control", () => {
  const t = convexTest(schema);

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await t.finishAllScheduledFunctions(() => {});
  });

  describe("User Isolation", () => {
    it("should prevent users from accessing other users' keys", async () => {
      const alice = t.withIdentity({ subject: "alice123", name: "Alice" });
      const bob = t.withIdentity({ subject: "bob456", name: "Bob" });

      await alice.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "alice-encrypted-key-data",
      });

      const aliceKeys = await alice.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(aliceKeys).toHaveLength(1);
      expect(aliceKeys[0].provider).toBe("openai");

      const bobKeys = await bob.query(api.providerKeys.listUserProviderKeys);
      expect(bobKeys).toHaveLength(0);
    });

    it("should isolate keys across multiple users", async () => {
      const alice = t.withIdentity({ subject: "alice123", name: "Alice" });
      const bob = t.withIdentity({ subject: "bob456", name: "Bob" });
      const charlie = t.withIdentity({
        subject: "charlie789",
        name: "Charlie",
      });

      await alice.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "alice-openai-key",
      });

      await bob.mutation(api.providerKeys.upsertProviderKey, {
        provider: "anthropic",
        key: "bob-anthropic-key",
      });

      await charlie.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "charlie-openai-key",
      });

      const aliceKeys = await alice.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(aliceKeys).toHaveLength(1);
      expect(aliceKeys[0].provider).toBe("openai");

      const bobKeys = await bob.query(api.providerKeys.listUserProviderKeys);
      expect(bobKeys).toHaveLength(1);
      expect(bobKeys[0].provider).toBe("anthropic");

      const charlieKeys = await charlie.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(charlieKeys).toHaveLength(1);
      expect(charlieKeys[0].provider).toBe("openai");
    });

    it("should require authentication for all key operations", async () => {
      const unauthenticated = t;

      await expect(
        unauthenticated.query(api.providerKeys.listUserProviderKeys)
      ).rejects.toThrow("Unauthenticated");

      await expect(
        unauthenticated.mutation(api.providerKeys.upsertProviderKey, {
          provider: "openai",
          key: "test-key",
        })
      ).rejects.toThrow("Unauthenticated");

      await expect(
        unauthenticated.mutation(api.providerKeys.deleteProviderKey, {
          provider: "openai",
        })
      ).rejects.toThrow("Unauthenticated");
    });

    it("should prevent cross-user key updates", async () => {
      const alice = t.withIdentity({ subject: "alice123", name: "Alice" });
      const bob = t.withIdentity({ subject: "bob456", name: "Bob" });

      await alice.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "alice-original-key",
      });

      await bob.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "bob-malicious-key",
      });

      const aliceKeys = await alice.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(aliceKeys[0].encryptedKey).toBe("alice-original-key");

      const bobKeys = await bob.query(api.providerKeys.listUserProviderKeys);
      expect(bobKeys[0].encryptedKey).toBe("bob-malicious-key");
    });

    it("should prevent cross-user key deletion", async () => {
      const alice = t.withIdentity({ subject: "alice123", name: "Alice" });
      const bob = t.withIdentity({ subject: "bob456", name: "Bob" });

      await alice.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "alice-key",
      });

      await bob.mutation(api.providerKeys.deleteProviderKey, {
        provider: "openai",
      });

      const aliceKeys = await alice.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(aliceKeys).toHaveLength(1);

      const bobKeys = await bob.query(api.providerKeys.listUserProviderKeys);
      expect(bobKeys).toHaveLength(0);
    });

    it("should maintain key privacy in batch operations", async () => {
      const alice = t.withIdentity({ subject: "alice123", name: "Alice" });
      const bob = t.withIdentity({ subject: "bob456", name: "Bob" });

      await alice.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "alice-openai",
      });
      await alice.mutation(api.providerKeys.upsertProviderKey, {
        provider: "anthropic",
        key: "alice-anthropic",
      });

      await bob.mutation(api.providerKeys.upsertProviderKey, {
        provider: "google",
        key: "bob-google",
      });

      const aliceProviders = await alice.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(aliceProviders.map((k: any) => k.provider).sort()).toEqual([
        "anthropic",
        "openai",
      ]);

      const bobProviders = await bob.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(bobProviders.map((k: any) => k.provider)).toEqual(["google"]);
    });

    it("should enforce tenant isolation in multi-tenant scenarios", async () => {
      const tenant1User1 = t.withIdentity({
        subject: "user1@tenant1",
        name: "User1",
        tenantId: "tenant1",
      });
      const tenant1User2 = t.withIdentity({
        subject: "user2@tenant1",
        name: "User2",
        tenantId: "tenant1",
      });
      const tenant2User1 = t.withIdentity({
        subject: "user1@tenant2",
        name: "User1",
        tenantId: "tenant2",
      });

      await tenant1User1.mutation(api.providerKeys.upsertProviderKey, {
        provider: "shared-api",
        key: "tenant1-user1-key",
      });

      await tenant1User2.mutation(api.providerKeys.upsertProviderKey, {
        provider: "shared-api",
        key: "tenant1-user2-key",
      });

      await tenant2User1.mutation(api.providerKeys.upsertProviderKey, {
        provider: "shared-api",
        key: "tenant2-user1-key",
      });

      const t1u1Keys = await tenant1User1.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(t1u1Keys).toHaveLength(1);
      expect(t1u1Keys[0].encryptedKey).toBe("tenant1-user1-key");

      const t1u2Keys = await tenant1User2.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(t1u2Keys).toHaveLength(1);
      expect(t1u2Keys[0].encryptedKey).toBe("tenant1-user2-key");

      const t2u1Keys = await tenant2User1.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(t2u1Keys).toHaveLength(1);
      expect(t2u1Keys[0].encryptedKey).toBe("tenant2-user1-key");
    });

    it("should prevent privilege escalation attempts", async () => {
      const regularUser = t.withIdentity({
        subject: "user123",
        name: "Regular User",
        role: "user",
      });
      const adminUser = t.withIdentity({
        subject: "admin456",
        name: "Admin",
        role: "admin",
      });

      await regularUser.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "user-key",
      });

      await adminUser.mutation(api.providerKeys.upsertProviderKey, {
        provider: "admin-service",
        key: "admin-key",
      });

      const userKeys = await regularUser.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(userKeys.map((k: any) => k.provider)).toEqual(["openai"]);

      const adminKeys = await adminUser.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(adminKeys.map((k: any) => k.provider).sort()).toEqual([
        "admin-service",
      ]);
    });
  });

  describe("Provider Name Validation", () => {
    it("should reject invalid provider names", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      await expect(
        user.mutation(api.providerKeys.upsertProviderKey, {
          provider: "",
          key: "test-key",
        })
      ).rejects.toThrow("Provider name cannot be empty");

      await expect(
        user.mutation(api.providerKeys.upsertProviderKey, {
          provider: "provider with spaces",
          key: "test-key",
        })
      ).rejects.toThrow("Provider name must start with alphanumeric");

      await expect(
        user.mutation(api.providerKeys.upsertProviderKey, {
          provider: "!invalid",
          key: "test-key",
        })
      ).rejects.toThrow("Provider name must start with alphanumeric");

      await expect(
        user.mutation(api.providerKeys.upsertProviderKey, {
          provider: "a".repeat(51),
          key: "test-key",
        })
      ).rejects.toThrow("Provider name too long");
    });

    it("should accept valid provider names", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const validProviders = [
        "openai",
        "anthropic-claude",
        "google.ai",
        "azure_openai",
        "1password",
        "aws-bedrock",
        "cohere.ai",
        "hugging-face",
      ];

      for (const provider of validProviders) {
        await user.mutation(api.providerKeys.upsertProviderKey, {
          provider,
          key: `key-for-${provider}`,
        });
      }

      const keys = await user.query(api.providerKeys.listUserProviderKeys);
      expect(keys).toHaveLength(validProviders.length);
      expect(keys.map((k: any) => k.provider).sort()).toEqual(validProviders.sort());
    });
  });

  describe("Key Metadata and Timestamps", () => {
    it("should track creation and update timestamps", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const beforeCreate = Date.now();
      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "initial-key",
      });
      const afterCreate = Date.now();

      const keys = await user.query(api.providerKeys.listUserProviderKeys);
      const key = keys[0];

      expect(key.createdAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(key.createdAt).toBeLessThanOrEqual(afterCreate);
      expect(key.updatedAt).toBe(key.createdAt);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const beforeUpdate = Date.now();
      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "updated-key",
      });
      const afterUpdate = Date.now();

      const updatedKeys = await user.query(
        api.providerKeys.listUserProviderKeys
      );
      const updatedKey = updatedKeys[0];

      expect(updatedKey.createdAt).toBe(key.createdAt);
      expect(updatedKey.updatedAt).toBeGreaterThan(key.createdAt);
      expect(updatedKey.updatedAt).toBeGreaterThanOrEqual(beforeUpdate);
      expect(updatedKey.updatedAt).toBeLessThanOrEqual(afterUpdate);
    });

    it("should track last used timestamp", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "test-key",
      });

      const initialKeys = await user.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(initialKeys[0].lastUsedAt).toBeNull();

      const beforeUse = Date.now();
      await user.mutation(api.providerKeys.updateLastUsed, {
        provider: "openai",
      });
      const afterUse = Date.now();

      const usedKeys = await user.query(api.providerKeys.listUserProviderKeys);
      expect(usedKeys[0].lastUsedAt).toBeGreaterThanOrEqual(beforeUse);
      expect(usedKeys[0].lastUsedAt).toBeLessThanOrEqual(afterUse);
    });

    it("should maintain metadata during key rotation", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "original-key",
        description: "Production API Key",
      });

      const originalKeys = await user.query(
        api.providerKeys.listUserProviderKeys
      );
      const originalKey = originalKeys[0];

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "rotated-key",
        description: originalKey.description,
      });

      const rotatedKeys = await user.query(
        api.providerKeys.listUserProviderKeys
      );
      const rotatedKey = rotatedKeys[0];

      expect(rotatedKey.description).toBe("Production API Key");
      expect(rotatedKey.createdAt).toBe(originalKey.createdAt);
      expect(rotatedKey.updatedAt).toBeGreaterThan(originalKey.updatedAt);
    });
  });
});

describe("Provider Keys - Key Rotation", () => {
  const t = convexTest(schema);

  describe("Individual Key Rotation", () => {
    it("should rotate a single provider key", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "original-encrypted-key",
      });

      const originalKeys = await user.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(originalKeys[0].version).toBe(1);

      await user.action(api.actions.rotateKeys.rotateProviderKey, {
        provider: "openai",
      });

      const rotatedKeys = await user.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(rotatedKeys[0].version).toBe(2);
      expect(rotatedKeys[0].encryptedKey).not.toBe("original-encrypted-key");
    });

    it("should maintain version history during rotation", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "anthropic",
        key: "v1-key",
      });

      for (let i = 2; i <= 5; i++) {
        await user.action(api.actions.rotateKeys.rotateProviderKey, {
          provider: "anthropic",
        });

        const keys = await user.query(api.providerKeys.listUserProviderKeys);
        expect(keys[0].version).toBe(i);
      }

      const auditLogs = await user.query(api.providerKeys.getRotationAuditLog, {
        provider: "anthropic",
      });
      expect(auditLogs).toHaveLength(4);
    });

    it("should handle rotation failures gracefully", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "original-key",
      });

      vi.spyOn(global.crypto.subtle, "generateKey").mockRejectedValueOnce(
        new Error("Crypto operation failed")
      );

      await expect(
        user.action(api.actions.rotateKeys.rotateProviderKey, {
          provider: "openai",
        })
      ).rejects.toThrow("Crypto operation failed");

      const keys = await user.query(api.providerKeys.listUserProviderKeys);
      expect(keys[0].encryptedKey).toBe("original-key");
      expect(keys[0].version).toBe(1);
    });
  });

  describe("Batch Key Rotation", () => {
    it("should rotate all user keys", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const providers = ["openai", "anthropic", "google"];
      for (const provider of providers) {
        await user.mutation(api.providerKeys.upsertProviderKey, {
          provider,
          key: `${provider}-original`,
        });
      }

      await user.action(api.actions.rotateKeys.rotateAllUserKeys);

      const rotatedKeys = await user.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(rotatedKeys).toHaveLength(3);

      for (const key of rotatedKeys) {
        expect(key.version).toBe(2);
        expect(key.encryptedKey).not.toBe(`${key.provider}-original`);
      }
    });

    it("should handle partial failures in batch rotation", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "openai-key",
      });
      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "anthropic",
        key: "anthropic-key",
      });
      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "google",
        key: "google-key",
      });

      let callCount = 0;
      vi.spyOn(global.crypto.subtle, "generateKey").mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error("Rotation failed for second key"));
        }
        return Promise.resolve({} as CryptoKey);
      });

      await expect(
        user.action(api.actions.rotateKeys.rotateAllUserKeys)
      ).rejects.toThrow("Batch rotation partially failed");

      const keys = await user.query(api.providerKeys.listUserProviderKeys);
      const openaiKey = keys.find((k: any) => k.provider === "openai");
      const anthropicKey = keys.find((k: any) => k.provider === "anthropic");
      const googleKey = keys.find((k: any) => k.provider === "google");

      expect(openaiKey?.version).toBe(2);
      expect(anthropicKey?.version).toBe(1);
      expect(googleKey?.version).toBe(2);
    });

    it("should support rollback on batch rotation failure", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const providers = ["openai", "anthropic", "google"];
      for (const provider of providers) {
        await user.mutation(api.providerKeys.upsertProviderKey, {
          provider,
          key: `${provider}-original`,
        });
      }

      vi.spyOn(global.crypto.subtle, "generateKey").mockRejectedValue(
        new Error("Critical rotation failure")
      );

      await expect(
        user.action(api.actions.rotateKeys.rotateAllUserKeys, {
          rollbackOnFailure: true,
        })
      ).rejects.toThrow("Critical rotation failure");

      const keys = await user.query(api.providerKeys.listUserProviderKeys);
      for (const key of keys) {
        expect(key.version).toBe(1);
        expect(key.encryptedKey).toBe(`${key.provider}-original`);
      }
    });
  });

  describe("Scheduled Key Rotation", () => {
    it("should schedule automatic key rotation", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "initial-key",
      });

      await user.mutation(api.providerKeys.scheduleKeyRotation, {
        provider: "openai",
        rotationIntervalDays: 30,
      });

      const scheduledRotations = await user.query(
        api.providerKeys.getPendingRotations
      );
      expect(scheduledRotations).toHaveLength(1);
      expect(scheduledRotations[0].provider).toBe("openai");
      expect(scheduledRotations[0].nextRotation).toBeGreaterThan(Date.now());
    });

    it("should execute scheduled rotations", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "anthropic",
        key: "scheduled-key",
      });

      await user.mutation(api.providerKeys.scheduleKeyRotation, {
        provider: "anthropic",
        rotationIntervalDays: 0,
      });

      await t.finishAllScheduledFunctions(() => {});

      const keys = await user.query(api.providerKeys.listUserProviderKeys);
      expect(keys[0].version).toBe(2);
      expect(keys[0].encryptedKey).not.toBe("scheduled-key");
    });

    it("should handle rotation audit logging", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "google",
        key: "audit-test-key",
      });

      await user.action(api.actions.rotateKeys.rotateProviderKey, {
        provider: "google",
      });

      const auditLog = await user.query(api.providerKeys.getRotationAuditLog, {
        provider: "google",
      });

      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].action).toBe("key_rotation");
      expect(auditLog[0].provider).toBe("google");
      expect(auditLog[0].success).toBe(true);
      expect(auditLog[0].oldVersion).toBe(1);
      expect(auditLog[0].newVersion).toBe(2);
    });
  });
});
