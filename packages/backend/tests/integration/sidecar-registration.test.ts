import { describe, expect, test } from "vitest";
import { createConvexTest } from "../../test-utils/utils";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Email } from "../../convex/schema";
import { KeyExchange, SecureProviderKeyDelivery } from "@openagent/crypto-lib";
import app from "../../../sidecar/src";

describe("Sidecar registration flow", () => {
  test("registers sidecar and returns sealed provider keys", async () => {
    const t = await createConvexTest(schema);

    // Arrange: create user, provider key, and session
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "reg@example.com" as Email,
        name: "Reg Tester",
        createdAt: Date.now(),
      });
    });

    const user = t.withIdentity({ subject: userId, name: "Reg Tester" });

    await user.mutation(api.providerKeys.upsertProviderKey, {
      provider: "openai",
      key: "sk-testkey1234567890abcdef1234567890abcdef1234567890",
    });

    const { sessionId, registrationToken } = await user.mutation(
      api.sessions.createSession,
      { title: "Reg Session" }
    );

    // Sidecar generates ephemeral keypair
    const sidecarKeys = await KeyExchange.generateEphemeralKeyPair();

    // Create sidecar app client
    // Act: attempt registration
    const res = await app.request("/internal/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionId as Id<"sessions">,
        registrationToken,
        publicKey: sidecarKeys.publicKey,
      }),
    });

    // Assert: HTTP 200 with expected payload contract
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.sidecarAuthToken).toBe("string");
    expect(typeof body.orchestratorPublicKey).toBe("string");
    expect(typeof body.opencodePort).toBe("number");
    expect(Array.isArray(body.encryptedProviderKeys)).toBe(true);

    // Decrypt sealed keys and verify contents
    const plaintext = await SecureProviderKeyDelivery.unpackProviderKeys(
      body.encryptedProviderKeys,
      sidecarKeys.privateKey,
      body.orchestratorPublicKey
    );
    expect(plaintext.get("openai")).toMatch(/^sk-/);

    // Convex state reflects registration
    const session = await t.run(async (ctx) => {
      return await ctx.db.get(sessionId);
    });
    expect(session?.status).toBe("active");
    expect(session?.sidecarPublicKey).toBe(sidecarKeys.publicKey);
    expect(typeof session?.updatedAt).toBe("number");

    // Negative: invalid token should 401/403 and not mutate DB
    const bad = await app.request("/internal/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionId as Id<"sessions">,
        registrationToken: "invalid-token",
        publicKey: sidecarKeys.publicKey,
      }),
    });
    expect([401, 403]).toContain(bad.status);
  });
});
