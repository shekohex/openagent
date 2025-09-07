import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { KeyExchange } from "./lib/keyExchange";

describe("Session Security", () => {
  const t = convexTest(schema);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await t.finishAllScheduledFunctions(() => {});
  });

  describe("Sidecar Registration", () => {
    it("should validate sidecar tokens during registration", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const { publicKey, privateKey, keyId } =
        await KeyExchange.generateEphemeralKeyPair();

      const sessionId = await user.mutation(api.sessions.registerSidecar, {
        sidecarPublicKey: publicKey,
        orchestratorPublicKey: publicKey,
      });

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe("string");

      const session = await user.query(api.sessions.getById, { id: sessionId });
      expect(session).toBeDefined();
      expect(session.userId).toBe("user123");
      expect(session.sidecarPublicKey).toBe(publicKey);
      expect(session.status).toBe("pending");
    });

    it("should reject registration with invalid public keys", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      await expect(
        user.mutation(api.sessions.registerSidecar, {
          sidecarPublicKey: "invalid-key",
          orchestratorPublicKey: "also-invalid",
        })
      ).rejects.toThrow("Invalid public key format");

      await expect(
        user.mutation(api.sessions.registerSidecar, {
          sidecarPublicKey: "",
          orchestratorPublicKey: "",
        })
      ).rejects.toThrow("Public keys are required");
    });

    it("should enforce session expiration", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const { publicKey } = await KeyExchange.generateEphemeralKeyPair();

      const sessionId = await user.mutation(api.sessions.registerSidecar, {
        sidecarPublicKey: publicKey,
        orchestratorPublicKey: publicKey,
        expiresInMinutes: 1,
      });

      const session = await user.query(api.sessions.getById, { id: sessionId });
      expect(session.expiresAt).toBeDefined();
      expect(session.expiresAt).toBeGreaterThan(Date.now());
      expect(session.expiresAt).toBeLessThanOrEqual(Date.now() + 60 * 1000);

      vi.setSystemTime(new Date(Date.now() + 2 * 60 * 1000));

      await expect(
        user.query(api.sessions.validateSession, { sessionId })
      ).rejects.toThrow("Session expired");

      vi.useRealTimers();
    });

    it("should prevent session hijacking", async () => {
      const alice = t.withIdentity({ subject: "alice123", name: "Alice" });
      const bob = t.withIdentity({ subject: "bob456", name: "Bob" });

      const { publicKey } = await KeyExchange.generateEphemeralKeyPair();

      const aliceSessionId = await alice.mutation(
        api.sessions.registerSidecar,
        {
          sidecarPublicKey: publicKey,
          orchestratorPublicKey: publicKey,
        }
      );

      await expect(
        bob.query(api.sessions.getById, { id: aliceSessionId })
      ).rejects.toThrow("Unauthorized");

      await expect(
        bob.mutation(api.sessions.updateSidecarRegistration, {
          sessionId: aliceSessionId,
          status: "active",
        })
      ).rejects.toThrow("Unauthorized");
    });
  });

  describe("Secure Key Exchange", () => {
    it("should perform secure key provisioning", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        encryptedKey: "test-openai-key",
      });

      const sidecarKeys = await KeyExchange.generateEphemeralKeyPair();
      const orchestratorKeys = await KeyExchange.generateEphemeralKeyPair();

      const sessionId = await user.mutation(api.sessions.registerSidecar, {
        sidecarPublicKey: sidecarKeys.publicKey,
        orchestratorPublicKey: orchestratorKeys.publicKey,
      });

      await user.mutation(api.sessions.updateSidecarRegistration, {
        sessionId,
        status: "active",
      });

      const provisionResult = await user.action(
        api.actions.provisionKeys.provisionKeysToSidecar,
        {
          sessionId,
          providers: ["openai"],
        }
      );

      expect(provisionResult.success).toBe(true);
      expect(provisionResult.encryptedPayload).toBeDefined();
      expect(provisionResult.encryptedPayload.ciphertext).toBeDefined();
      expect(provisionResult.encryptedPayload.nonce).toBeDefined();
      expect(provisionResult.encryptedPayload.tag).toBeDefined();
    });

    it("should validate ECDH key exchange parameters", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const invalidKey = "not-a-valid-ecdh-key";

      await expect(
        user.mutation(api.sessions.registerSidecar, {
          sidecarPublicKey: invalidKey,
          orchestratorPublicKey: invalidKey,
        })
      ).rejects.toThrow();
    });

    it("should use ephemeral keys for each session", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const sessions = [];
      for (let i = 0; i < 3; i++) {
        const keys = await KeyExchange.generateEphemeralKeyPair();
        const sessionId = await user.mutation(api.sessions.registerSidecar, {
          sidecarPublicKey: keys.publicKey,
          orchestratorPublicKey: keys.publicKey,
        });
        sessions.push(sessionId);
      }

      const sessionData = await Promise.all(
        sessions.map((id) => user.query(api.sessions.getById, { id }))
      );

      const publicKeys = sessionData.map((s: any) => s.sidecarPublicKey);
      expect(new Set(publicKeys).size).toBe(3);
    });

    it("should implement forward secrecy", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const sidecarKeys1 = await KeyExchange.generateEphemeralKeyPair();
      const orchestratorKeys1 = await KeyExchange.generateEphemeralKeyPair();

      const session1 = await user.mutation(api.sessions.registerSidecar, {
        sidecarPublicKey: sidecarKeys1.publicKey,
        orchestratorPublicKey: orchestratorKeys1.publicKey,
      });

      await user.mutation(api.sessions.updateSidecarRegistration, {
        sessionId: session1,
        status: "active",
      });

      const sidecarKeys2 = await KeyExchange.generateEphemeralKeyPair();
      const orchestratorKeys2 = await KeyExchange.generateEphemeralKeyPair();

      const session2 = await user.mutation(api.sessions.registerSidecar, {
        sidecarPublicKey: sidecarKeys2.publicKey,
        orchestratorPublicKey: orchestratorKeys2.publicKey,
      });

      const sessionData1 = await user.query(api.sessions.getById, {
        id: session1,
      });
      const sessionData2 = await user.query(api.sessions.getById, {
        id: session2,
      });

      expect(sessionData1.sidecarPublicKey).not.toBe(
        sessionData2.sidecarPublicKey
      );
      expect(sessionData1.orchestratorPublicKey).not.toBe(
        sessionData2.orchestratorPublicKey
      );
    });
  });

  describe("Token Validation", () => {
    it("should validate session tokens correctly", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const { publicKey } = await KeyExchange.generateEphemeralKeyPair();

      const sessionId = await user.mutation(api.sessions.registerSidecar, {
        sidecarPublicKey: publicKey,
        orchestratorPublicKey: publicKey,
      });

      const token = await user.action(api.sessions.generateSessionToken, {
        sessionId,
      });

      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(32);

      const isValid = await user.query(api.sessions.validateToken, {
        sessionId,
        token,
      });

      expect(isValid).toBe(true);
    });

    it("should reject invalid or expired tokens", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const { publicKey } = await KeyExchange.generateEphemeralKeyPair();

      const sessionId = await user.mutation(api.sessions.registerSidecar, {
        sidecarPublicKey: publicKey,
        orchestratorPublicKey: publicKey,
      });

      const invalidToken = "invalid-token-12345";

      const isValid = await user.query(api.sessions.validateToken, {
        sessionId,
        token: invalidToken,
      });

      expect(isValid).toBe(false);
    });

    it("should prevent token replay attacks", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const { publicKey } = await KeyExchange.generateEphemeralKeyPair();

      const sessionId = await user.mutation(api.sessions.registerSidecar, {
        sidecarPublicKey: publicKey,
        orchestratorPublicKey: publicKey,
      });

      const token = await user.action(api.sessions.generateSessionToken, {
        sessionId,
        singleUse: true,
      });

      const firstUse = await user.mutation(api.sessions.consumeToken, {
        sessionId,
        token,
      });
      expect(firstUse).toBe(true);

      await expect(
        user.mutation(api.sessions.consumeToken, {
          sessionId,
          token,
        })
      ).rejects.toThrow("Token already used");
    });

    it("should enforce rate limiting on token generation", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const { publicKey } = await KeyExchange.generateEphemeralKeyPair();

      const sessionId = await user.mutation(api.sessions.registerSidecar, {
        sidecarPublicKey: publicKey,
        orchestratorPublicKey: publicKey,
      });

      const tokenPromises = [];
      for (let i = 0; i < 15; i++) {
        tokenPromises.push(
          user.action(api.sessions.generateSessionToken, { sessionId })
        );
      }

      await expect(Promise.all(tokenPromises)).rejects.toThrow(
        "Rate limit exceeded"
      );
    });
  });

  describe("Session Lifecycle", () => {
    it("should clean up expired sessions", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const { publicKey } = await KeyExchange.generateEphemeralKeyPair();

      const sessionIds = [];
      for (let i = 0; i < 3; i++) {
        const sessionId = await user.mutation(api.sessions.registerSidecar, {
          sidecarPublicKey: publicKey,
          orchestratorPublicKey: publicKey,
          expiresInMinutes: 1,
        });
        sessionIds.push(sessionId);
      }

      vi.setSystemTime(new Date(Date.now() + 2 * 60 * 1000));

      await t.run(api.sessions.cleanupExpiredSessions);

      for (const sessionId of sessionIds) {
        await expect(
          user.query(api.sessions.getById, { id: sessionId })
        ).rejects.toThrow("Session not found");
      }

      vi.useRealTimers();
    });

    it("should maintain session state transitions", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const { publicKey } = await KeyExchange.generateEphemeralKeyPair();

      const sessionId = await user.mutation(api.sessions.registerSidecar, {
        sidecarPublicKey: publicKey,
        orchestratorPublicKey: publicKey,
      });

      let session = await user.query(api.sessions.getById, { id: sessionId });
      expect(session.status).toBe("pending");

      await user.mutation(api.sessions.updateSidecarRegistration, {
        sessionId,
        status: "active",
      });

      session = await user.query(api.sessions.getById, { id: sessionId });
      expect(session.status).toBe("active");

      await user.mutation(api.sessions.updateSidecarRegistration, {
        sessionId,
        status: "terminated",
      });

      session = await user.query(api.sessions.getById, { id: sessionId });
      expect(session.status).toBe("terminated");

      await expect(
        user.mutation(api.sessions.updateSidecarRegistration, {
          sessionId,
          status: "active",
        })
      ).rejects.toThrow("Cannot reactivate terminated session");
    });

    it("should limit concurrent sessions per user", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const maxSessions = 5;
      const sessions = [];

      for (let i = 0; i < maxSessions; i++) {
        const { publicKey } = await KeyExchange.generateEphemeralKeyPair();
        const sessionId = await user.mutation(api.sessions.registerSidecar, {
          sidecarPublicKey: publicKey,
          orchestratorPublicKey: publicKey,
        });
        sessions.push(sessionId);
      }

      const { publicKey } = await KeyExchange.generateEphemeralKeyPair();
      await expect(
        user.mutation(api.sessions.registerSidecar, {
          sidecarPublicKey: publicKey,
          orchestratorPublicKey: publicKey,
        })
      ).rejects.toThrow("Maximum concurrent sessions reached");
    });

    it("should audit session activities", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const { publicKey } = await KeyExchange.generateEphemeralKeyPair();

      const sessionId = await user.mutation(api.sessions.registerSidecar, {
        sidecarPublicKey: publicKey,
        orchestratorPublicKey: publicKey,
      });

      await user.mutation(api.sessions.updateSidecarRegistration, {
        sessionId,
        status: "active",
      });

      const auditLog = await user.query(api.sessions.getSessionAuditLog, {
        sessionId,
      });

      expect(auditLog).toHaveLength(2);
      expect(auditLog[0].action).toBe("session_created");
      expect(auditLog[1].action).toBe("session_activated");
      expect(auditLog[0].userId).toBe("user123");
      expect(auditLog[1].userId).toBe("user123");
    });
  });
});
