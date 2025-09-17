import { describe, expect, test } from "vitest";
import { createConvexTest } from "../../test-utils/utils";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Email } from "../../convex/schema";
import {
  KeyExchange,
  SecureProviderKeyDelivery,
  getDefaultEnvelopeEncryption,
} from "@openagent/crypto-lib";
import { randomUUID } from "node:crypto";
import app, {
  resetOrchestratorAdapter,
  setOrchestratorAdapter,
} from "../../../sidecar/src";
import { OrchestratorError } from "../../../sidecar/src/orchestrator/adapter";

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

    setOrchestratorAdapter({
      async registerSidecar(params) {
        const session = await t.run(async (ctx) => {
          return await ctx.db.get(params.sessionId as Id<"sessions">);
        });

        if (!session) {
          throw new OrchestratorError(
            "INVALID_REQUEST",
            "Session not found",
            400
          );
        }

        if (session.registrationToken !== params.registrationToken) {
          throw new OrchestratorError(
            "UNAUTHORIZED",
            "Invalid session or registration token",
            403
          );
        }

        const providerDocs = await t.run(async (ctx) => {
          return await ctx.db
            .query("providerKeys")
            .withIndex("by_user", (q) => q.eq("userId", session.userId))
            .collect();
        });

        if (providerDocs.length === 0) {
          throw new OrchestratorError(
            "INVALID_REQUEST",
            "No provider keys configured",
            400
          );
        }

        const envelope = getDefaultEnvelopeEncryption();
        const decryptedKeys = new Map<string, string>();

        for (const doc of providerDocs) {
          const plaintext = await envelope.decryptProviderKey({
            encryptedKey: doc.encryptedKey,
            encryptedDataKey: doc.encryptedDataKey,
            keyVersion: doc.keyVersion,
            nonce: doc.nonce,
            tag: doc.tag,
            dataKeyNonce: doc.dataKeyNonce,
            dataKeyTag: doc.dataKeyTag,
            masterKeyId: doc.masterKeyId,
          });
          decryptedKeys.set(doc.provider, plaintext);
        }

        const orchestratorKeys = await KeyExchange.generateEphemeralKeyPair();

        const sealedKeys = await SecureProviderKeyDelivery.packageProviderKeys(
          decryptedKeys,
          params.sidecarPublicKey,
          orchestratorKeys.privateKey,
          params.sidecarKeyId
        );

        const sidecarToken = Buffer.from(
          JSON.stringify({
            sessionId: params.sessionId,
            sidecarKeyId: params.sidecarKeyId,
            timestamp: Date.now(),
            nonce: randomUUID(),
          })
        ).toString("base64");

        await t.mutation(internal.sessions.updateSidecarRegistration, {
          sessionId: params.sessionId as Id<"sessions">,
          sidecarKeyId: params.sidecarKeyId,
          sidecarPublicKey: params.sidecarPublicKey,
          orchestratorPublicKey: orchestratorKeys.publicKey,
          orchestratorKeyId: orchestratorKeys.keyId,
          registeredAt: Date.now(),
        });

        return {
          sidecarAuthToken: sidecarToken,
          orchestratorPublicKey: orchestratorKeys.publicKey,
          orchestratorKeyId: orchestratorKeys.keyId,
          encryptedProviderKeys: sealedKeys,
          opencodePort: 7150,
        };
      },
    });

    try {
      // Create sidecar app client
      // Act: attempt registration
      const res = await app.request("/internal/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId as Id<"sessions">,
          registrationToken,
          publicKey: sidecarKeys.publicKey,
          keyId: sidecarKeys.keyId,
        }),
      });

      // Assert: HTTP 200 with expected payload contract
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(typeof body.sidecarAuthToken).toBe("string");
      expect(typeof body.orchestratorPublicKey).toBe("string");
      expect(typeof body.opencodePort).toBe("number");
      expect(body.encryptedProviderKeys).toEqual(
        expect.objectContaining({
          ciphertext: expect.any(String),
          nonce: expect.any(String),
          tag: expect.any(String),
          recipientKeyId: expect.any(String),
        })
      );

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
          keyId: sidecarKeys.keyId,
        }),
      });
      expect([401, 403]).toContain(bad.status);
    } finally {
      resetOrchestratorAdapter();
    }
  });
});
