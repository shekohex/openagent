import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Provider Keys", () => {
  const t = convexTest(schema);

  describe("Basic CRUD Operations", () => {
    it("should create and retrieve provider keys", async () => {
      const user = t.withIdentity({ subject: "test123", name: "Test User" });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "test-api-key",
      });

      const keys = await user.query(api.providerKeys.listUserProviderKeys);
      expect(keys).toHaveLength(1);
      expect(keys[0].provider).toBe("openai");
    });

    it("should update existing provider keys", async () => {
      const user = t.withIdentity({ subject: "test123", name: "Test User" });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "original-key",
      });

      const result = await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "updated-key",
      });

      expect(result.updated).toBe(true);
    });

    it("should delete provider keys", async () => {
      const user = t.withIdentity({ subject: "test123", name: "Test User" });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "test-key",
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
      const alice = t.withIdentity({ subject: "alice123", name: "Alice" });
      const bob = t.withIdentity({ subject: "bob456", name: "Bob" });

      await alice.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "alice-key",
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
      const user = t.withIdentity({ subject: "test123", name: "Test User" });

      await expect(
        user.mutation(api.providerKeys.upsertProviderKey, {
          provider: "",
          key: "test-key",
        })
      ).rejects.toThrow("Provider name cannot be empty");
    });

    it("should reject invalid provider names", async () => {
      const user = t.withIdentity({ subject: "test123", name: "Test User" });

      await expect(
        user.mutation(api.providerKeys.upsertProviderKey, {
          provider: "invalid@name",
          key: "test-key",
        })
      ).rejects.toThrow("Provider name must start with alphanumeric");
    });

    it("should reject empty keys", async () => {
      const user = t.withIdentity({ subject: "test123", name: "Test User" });

      await expect(
        user.mutation(api.providerKeys.upsertProviderKey, {
          provider: "openai",
          key: "",
        })
      ).rejects.toThrow("Provider key cannot be empty");
    });

    it("should reject keys that are too short", async () => {
      const user = t.withIdentity({ subject: "test123", name: "Test User" });

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
      const user = t.withIdentity({ subject: "test123", name: "Test User" });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "test-key",
      });

      const exists = await user.query(api.providerKeys.hasProviderKey, {
        provider: "openai",
      });

      expect(exists).toBe(true);
    });

    it("should return false for non-existing providers", async () => {
      const user = t.withIdentity({ subject: "test123", name: "Test User" });

      const exists = await user.query(api.providerKeys.hasProviderKey, {
        provider: "nonexistent",
      });

      expect(exists).toBe(false);
    });
  });
});
