import { describe, expect, it } from "vitest";
import { createConvexTest } from "../test-utils/utils";
import { api } from "./_generated/api";
import schema, { type Email } from "./schema";

describe("Provider Keys", async () => {
  const t = await createConvexTest(schema);

   // Helper function to create a test user and return authenticated context
  async function createTestUser(_subject: string, name: string) {
    const userId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        email: `${name}@example.com` as Email,
        name,
      });
    });
    const identityContext = t.withIdentity({ 
      subject: userId,
      name,
    });

    return {
      userId: userId,
      user: identityContext,
    };
  }

  describe("Basic CRUD Operations", () => {
    it("should create and retrieve provider keys", async () => {
      const { user } = await createTestUser("test123", "Test User");

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "sk-1234567890abcdef1234567890abcdef1234567890abcdef",
      });

      const keys = await user.query(api.providerKeys.listUserProviderKeys);
      expect(keys).toHaveLength(1);
      expect(keys[0].provider).toBe("openai");
    });

    it("should update existing provider keys", async () => {
      const { user } = await createTestUser("test123", "Test User");

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "sk-original1234567890abcdef1234567890abcdef1234567890",
      });

      const result = await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "sk-updated1234567890abcdef1234567890abcdef1234567890",
      });

      expect(result.updated).toBe(true);
    });

    it("should delete provider keys", async () => {
      const { user } = await createTestUser("test123", "Test User");

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "sk-testkey1234567890abcdef1234567890abcdef1234567890",
      });

      const result = await user.mutation(api.providerKeys.deleteProviderKey, {
        provider: "openai",
      });

      expect(result.deleted).toBe(true);

      const keys = await user.query(api.providerKeys.listUserProviderKeys);
      expect(keys).toHaveLength(0);
    });
  });

  describe("Authentication & Authorization", () => {
    it("should prevent unauthenticated access", async () => {
      await expect(
        t.query(api.providerKeys.listUserProviderKeys)
      ).rejects.toThrow("Not authenticated");
    });

    it("should isolate user data", async () => {
      const { user: alice } = await createTestUser("alice123", "Alice");
      const { user: bob } = await createTestUser("bob456", "Bob");

      await alice.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "sk-alicekey1234567890abcdef1234567890abcdef1234567890",
      });

      const aliceKeys = await alice.query(
        api.providerKeys.listUserProviderKeys
      );
      const bobKeys = await bob.query(api.providerKeys.listUserProviderKeys);

      expect(aliceKeys).toHaveLength(1);
      expect(bobKeys).toHaveLength(0);
    });
  });

  describe("Input Validation", () => {
    it("should reject empty provider names", async () => {
      const { user } = await createTestUser("test123", "Test User");

      await expect(
        user.mutation(api.providerKeys.upsertProviderKey, {
          provider: "",
          key: "sk-testkey1234567890abcdef1234567890abcdef1234567890",
        })
      ).rejects.toThrow("Provider name is required");
    });

    it("should reject invalid provider names", async () => {
      const { user } = await createTestUser("test123", "Test User");

      await expect(
        user.mutation(api.providerKeys.upsertProviderKey, {
          provider: "invalid@name",
          key: "sk-testkey1234567890abcdef1234567890abcdef1234567890",
        })
      ).rejects.toThrow("Provider name must start with alphanumeric");
    });

    it("should reject empty keys", async () => {
      const { user } = await createTestUser("test123", "Test User");

      await expect(
        user.mutation(api.providerKeys.upsertProviderKey, {
          provider: "openai",
          key: "",
        })
      ).rejects.toThrow("Provider key cannot be empty");
    });

    it("should reject keys that are too short", async () => {
      const { user } = await createTestUser("test123", "Test User");

      await expect(
        user.mutation(api.providerKeys.upsertProviderKey, {
          provider: "openai",
          key: "short",
        })
      ).rejects.toThrow("Provider key too short");
    });
  });

  describe("Key Existence Checks", () => {
    it("should return true for existing providers", async () => {
      const { user } = await createTestUser("test123", "Test User");

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "sk-testkey1234567890abcdef1234567890abcdef1234567890",
      });

      const exists = await user.query(api.providerKeys.hasProviderKey, {
        provider: "openai",
      });

      expect(exists).toBe(true);
    });

    it("should return false for non-existing providers", async () => {
      const { user } = await createTestUser("test123", "Test User");

      const exists = await user.query(api.providerKeys.hasProviderKey, {
        provider: "nonexistent",
      });

      expect(exists).toBe(false);
    });
  });
});
