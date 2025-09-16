import { describe, expect, test, vi } from "vitest";
import { createConvexTest } from "../../test-utils/utils";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Email } from "../../convex/schema";
import { KeyExchange, SecureProviderKeyDelivery, CryptoError } from "@openagent/crypto-lib";

describe("Key encryption/decryption flow", () => {
  test("packages and unpacks provider keys between orchestrator and sidecar", async () => {
    const t = await createConvexTest(schema);

    // Seed user and provider keys
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "crypto@example.com" as Email,
        name: "Crypto Tester",
        createdAt: Date.now(),
      });
    });
    const user = t.withIdentity({ subject: userId, name: "Crypto Tester" });

    await user.mutation(api.providerKeys.upsertProviderKey, {
      provider: "openai",
      key: "sk-crypto-openai-1234567890abcdef1234567890abcdef",
    });
    await user.mutation(api.providerKeys.upsertProviderKey, {
      provider: "anthropic",
      key: "sk-crypto-anthropic-1234567890abcdef1234567890ab",
    });

    const { sessionId, registrationToken } = await user.mutation(
      api.sessions.createSession,
      { title: "Crypto Session" }
    );

    const sidecar = await KeyExchange.generateEphemeralKeyPair();

    const reg = await user.mutation(
      internal.provisionKeys.registerSidecar,
      {
        sessionId,
        registrationToken,
        sidecarPublicKey: sidecar.publicKey,
        sidecarKeyId: sidecar.keyId,
      }
    );

    expect(reg.success).toBe(true);
    expect(reg.sealedKeys).toBeDefined();

    const unpacked = await SecureProviderKeyDelivery.unpackProviderKeys(
      reg.sealedKeys!,
      sidecar.privateKey,
      // Orchestrator public key stored on session by mutation
      (await t.run(async (ctx) => (await ctx.db.get(sessionId))?.orchestratorPublicKey)) as string
    );

    expect(unpacked.get("openai")).toMatch(/^sk-crypto-openai/);
    expect(unpacked.get("anthropic")).toMatch(/^sk-crypto-anthropic/);

    // Tamper with nonce
    const bad = { ...reg.sealedKeys!, nonce: reg.sealedKeys!.nonce.slice(0, -1) + "A" };
    await expect(
      SecureProviderKeyDelivery.unpackProviderKeys(
        bad,
        sidecar.privateKey,
        (await t.run(async (ctx) => (await ctx.db.get(sessionId))?.orchestratorPublicKey)) as string
      )
    ).rejects.toThrow(CryptoError);

    // Expired payload
    const realNow = Date.now();
    vi.setSystemTime(realNow + 6 * 60 * 1000); // +6 minutes
    await expect(
      SecureProviderKeyDelivery.unpackProviderKeys(
        reg.sealedKeys!,
        sidecar.privateKey,
        (await t.run(async (ctx) => (await ctx.db.get(sessionId))?.orchestratorPublicKey)) as string
      )
    ).rejects.toThrow(CryptoError);
    vi.setSystemTime(realNow);

    // Refresh flow returns sealed keys again
    const refresh = await user.mutation(
      internal.provisionKeys.refreshProviderKeys,
      {
        sessionId,
        sidecarToken: reg.sidecarToken!,
      }
    );
    expect(refresh.success).toBe(true);
    expect(refresh.sealedKeys).toBeDefined();
  });
});

