import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

describe("Authentication Security Tests", () => {
  test("unauthenticated user cannot access provider keys", async () => {
    const t = convexTest(schema);

    // Try to access provider keys without authentication
    await expect(
      t.action(api.providerKeys.getProviderKey, {
        provider: "openai",
      })
    ).rejects.toThrowError("Not authenticated");
  });

  test("internal functions are not exposed in public API", () => {
    // This test verifies that internal functions are not part of the public API
    // The absence of these properties from the api object indicates they're properly internal
    expect("getEncryptedProviderKey" in api.providerKeys).toBe(false);
    expect("getById" in api.sessions).toBe(false);
    expect("updateSidecarRegistration" in api.sessions).toBe(false);

    // Verify internal functions exist in internal namespace
    expect("getEncryptedProviderKey" in internal.providerKeys).toBe(true);
    expect("getById" in internal.sessions).toBe(true);
    expect("updateSidecarRegistration" in internal.sessions).toBe(true);
  });

  test("provider key functions require authentication", async () => {
    const t = convexTest(schema);

    // All these should fail without authentication
    await expect(
      t.action(api.providerKeys.getProviderKey, { provider: "openai" })
    ).rejects.toThrowError("Not authenticated");

    await expect(
      t.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        key: "test-key",
      })
    ).rejects.toThrowError("Not authenticated");

    await expect(
      t.mutation(api.providerKeys.deleteProviderKey, { provider: "openai" })
    ).rejects.toThrowError("Not authenticated");
  });
});
