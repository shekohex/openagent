import { describe, expect, it, beforeEach, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Integration Tests - End-to-End Workflows", () => {
  const t = convexTest(schema);

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe("Complete Key Provisioning Flow", () => {
    it("should handle the full lifecycle of key provisioning", async () => {
      const user = t.withIdentity({ subject: "user123", name: "Test User" });

      // Step 1: User stores provider keys
      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "sk-test-openai-key-123",
      });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "anthropic",
        key: "sk-test-anthropic-key-456",
      });

      // Step 2: Verify keys are stored
      const keys = await user.query(api.providerKeys.listUserProviderKeys);
      expect(keys).toHaveLength(2);
      expect(keys.map((k) => k.provider).sort()).toEqual([
        "anthropic",
        "openai",
      ]);

      // Step 3: Check key existence
      const hasOpenAI = await user.query(api.providerKeys.hasProviderKey, {
        provider: "openai",
      });
      expect(hasOpenAI).toBe(true);

      // Step 4: Update a key
      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "sk-test-openai-key-updated",
      });

      // Step 5: Delete a key
      await user.mutation(api.providerKeys.deleteProviderKey, {
        provider: "anthropic",
      });

      // Step 6: Verify final state
      const finalKeys = await user.query(api.providerKeys.listUserProviderKeys);
      expect(finalKeys).toHaveLength(1);
      expect(finalKeys[0].provider).toBe("openai");
    });
  });

  describe("Multi-User Isolation", () => {
    it("should ensure complete isolation between users", async () => {
      const alice = t.withIdentity({ subject: "alice123", name: "Alice" });
      const bob = t.withIdentity({ subject: "bob456", name: "Bob" });

      // Both users store keys for the same provider
      await alice.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "alice-openai-key",
      });

      await bob.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "bob-openai-key",
      });

      // Each user can only see their own keys
      const aliceKeys = await alice.query(
        api.providerKeys.listUserProviderKeys
      );
      const bobKeys = await bob.query(api.providerKeys.listUserProviderKeys);

      expect(aliceKeys).toHaveLength(1);
      expect(bobKeys).toHaveLength(1);

      // Verify complete isolation
      expect(aliceKeys[0].provider).toBe("openai");
      expect(bobKeys[0].provider).toBe("openai");

      // Bob tries to delete Alice's key (should fail or have no effect)
      try {
        await bob.mutation(api.providerKeys.deleteProviderKey, {
          provider: "openai",
        });
      } catch (error) {
        // Expected to fail or delete only Bob's key
      }

      // Alice's key should still exist
      const aliceKeysAfter = await alice.query(
        api.providerKeys.listUserProviderKeys
      );
      expect(aliceKeysAfter).toHaveLength(1);
    });
  });

  describe("Provider Key Caching", () => {
    it("should cache and retrieve known providers", async () => {
      const user = t.withIdentity({ subject: "user123", name: "Test User" });

      // First call - might fetch from remote or use defaults
      const providers1 = await user.action(api.providerKeys.getKnownProviders);
      expect(providers1).toBeInstanceOf(Array);
      expect(providers1.length).toBeGreaterThan(0);

      // Second call - should use cache
      const providers2 = await user.action(api.providerKeys.getKnownProviders);
      expect(providers2).toEqual(providers1);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid provider names gracefully", async () => {
      const user = t.withIdentity({ subject: "user123", name: "Test User" });

      const invalidProviders = [
        "",
        " ",
        "provider with spaces",
        "provider!@#$%",
        "a".repeat(100), // Too long
      ];

      for (const provider of invalidProviders) {
        await expect(
          user.mutation(api.providerKeys.upsertProviderKey, {
            provider,
            key: "test-key",
          })
        ).rejects.toThrow();
      }
    });

    it("should handle invalid key values", async () => {
      const user = t.withIdentity({ subject: "user123", name: "Test User" });

      const invalidKeys = [
        "",
        " ",
        "short", // Too short
        "a".repeat(1001), // Too long
      ];

      for (const key of invalidKeys) {
        await expect(
          user.mutation(api.providerKeys.upsertProviderKey, {
            provider: "openai",
            key,
          })
        ).rejects.toThrow();
      }
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle concurrent key updates safely", async () => {
      const user = t.withIdentity({ subject: "user123", name: "Test User" });

      // Create initial keys
      const providers = ["openai", "anthropic", "google", "mistral"];
      await Promise.all(
        providers.map((provider) =>
          user.mutation(api.providerKeys.upsertProviderKey, {
            provider,
            key: `${provider}-initial-key`,
          })
        )
      );

      // Concurrent updates
      const updatePromises = providers.map((provider, index) =>
        user.mutation(api.providerKeys.upsertProviderKey, {
          provider,
          key: `${provider}-updated-key-${index}`,
        })
      );

      const results = await Promise.all(updatePromises);
      expect(results).toHaveLength(providers.length);

      // Verify all updates succeeded
      const finalKeys = await user.query(api.providerKeys.listUserProviderKeys);
      expect(finalKeys).toHaveLength(providers.length);
    });

    it("should handle concurrent deletes safely", async () => {
      const user = t.withIdentity({ subject: "user123", name: "Test User" });

      // Create keys to delete
      const providers = ["provider1", "provider2", "provider3"];
      await Promise.all(
        providers.map((provider) =>
          user.mutation(api.providerKeys.upsertProviderKey, {
            provider,
            key: `${provider}-key`,
          })
        )
      );

      // Concurrent deletes
      const deletePromises = providers.map((provider) =>
        user.mutation(api.providerKeys.deleteProviderKey, { provider })
      );

      await Promise.all(deletePromises);

      // Verify all were deleted
      const finalKeys = await user.query(api.providerKeys.listUserProviderKeys);
      expect(finalKeys).toHaveLength(0);
    });
  });

  describe("Authentication and Authorization", () => {
    it("should reject unauthenticated requests", async () => {
      await expect(
        t.query(api.providerKeys.listUserProviderKeys)
      ).rejects.toThrow();

      await expect(
        t.mutation(api.providerKeys.upsertProviderKey, {
          provider: "openai",
          key: "test-key",
        })
      ).rejects.toThrow();
    });

    it("should properly authenticate users", async () => {
      const user = t.withIdentity({ subject: "user123", name: "Test User" });

      // Authenticated operations should succeed
      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "test-key",
      });

      const keys = await user.query(api.providerKeys.listUserProviderKeys);
      expect(keys).toHaveLength(1);
    });
  });
});
