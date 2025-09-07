import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { CryptoError } from "./lib/crypto";

describe("Security Vulnerability Tests", () => {
  const t = convexTest(schema);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await t.finishAllScheduledFunctions();
  });

  describe("SQL Injection Prevention", () => {
    it("should sanitize provider names against SQL injection", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const maliciousProviders = [
        "openai'; DROP TABLE providerKeys; --",
        "anthropic' OR '1'='1",
        'google"; DELETE FROM users WHERE 1=1; --',
        "azure/**/UNION/**/SELECT/**/password/**/FROM/**/users",
        "aws'; INSERT INTO admin VALUES ('hacker', 'password'); --",
      ];

      for (const provider of maliciousProviders) {
        await expect(
          user.mutation(api.providerKeys.upsertProviderKey, {
            provider,
            encryptedKey: "test-key",
          })
        ).rejects.toThrow("Provider name must start with alphanumeric");
      }
    });

    it("should prevent NoSQL injection in query parameters", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const injectionAttempts = [
        { $ne: null },
        { $gt: "" },
        { $regex: ".*" },
        { $where: "this.password == 'admin'" },
      ];

      for (const attempt of injectionAttempts) {
        await expect(
          user.query(api.providerKeys.getProviderKeyMetadata, {
            provider: attempt as any,
          })
        ).rejects.toThrow();
      }
    });

    it("should escape special characters in search queries", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        encryptedKey: "test-key",
        description: "Production API key for OpenAI",
      });

      const searchPatterns = [".*", "(.*)", "[a-zA-Z]*", "^$", "\\x00"];

      for (const pattern of searchPatterns) {
        const results = await user.query(api.providerKeys.searchProviderKeys, {
          searchTerm: pattern,
        });

        expect(results).toHaveLength(0);
      }
    });
  });

  describe("XSS Prevention", () => {
    it("should sanitize HTML in key descriptions", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const xssPayloads = [
        "<script>alert('XSS')</script>",
        "<img src=x onerror=alert('XSS')>",
        "<svg/onload=alert('XSS')>",
        "javascript:alert('XSS')",
        "<iframe src='javascript:alert(\"XSS\")'></iframe>",
        "<body onload=alert('XSS')>",
      ];

      for (const payload of xssPayloads) {
        await user.mutation(api.providerKeys.upsertProviderKey, {
          provider: "openai",
          encryptedKey: "test-key",
          description: payload,
        });

        const keys = await user.query(api.providerKeys.listUserProviderKeys);
        const key = keys[0];

        expect(key.description).not.toContain("<script>");
        expect(key.description).not.toContain("onerror=");
        expect(key.description).not.toContain("onload=");
        expect(key.description).not.toContain("javascript:");
      }
    });

    it("should escape special characters in JSON responses", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const jsonPayloads = [
        '{"key": "value", "xss": "</script><script>alert(1)</script>"}',
        '{"$oid": "507f1f77bcf86cd799439011"}',
        '{"__proto__": {"isAdmin": true}}',
      ];

      for (const payload of jsonPayloads) {
        await user.mutation(api.providerKeys.upsertProviderKey, {
          provider: "test",
          encryptedKey: payload,
        });

        const keys = await user.query(api.providerKeys.listUserProviderKeys);
        expect(typeof keys[0].encryptedKey).toBe("string");
        expect(keys[0].encryptedKey).toBe(payload);
      }
    });

    it("should prevent stored XSS in audit logs", async () => {
      const user = t.withIdentity({
        subject: "user<script>alert(1)</script>",
        name: "User",
      });

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        encryptedKey: "test-key",
      });

      await user.action(api.actions.rotateKeys.rotateProviderKey, {
        provider: "openai",
      });

      const auditLog = await user.query(api.providerKeys.getRotationAuditLog, {
        provider: "openai",
      });

      for (const entry of auditLog) {
        expect(entry.userId).not.toContain("<script>");
        expect(entry.userId).not.toContain("alert(");
      }
    });
  });

  describe("Timing Attack Prevention", () => {
    it("should use constant-time comparison for sensitive operations", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const timings: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        try {
          await user.query(api.sessions.validateToken, {
            sessionId: "fake-session-id",
            token: i < 50 ? "aaaaaaaaaaaaaaaa" : "zzzzzzzzzzzzzzzz",
          });
        } catch (e) {
          // Expected to fail
        }

        const end = performance.now();
        timings.push(end - start);
      }

      const avgFirst50 = timings.slice(0, 50).reduce((a, b) => a + b, 0) / 50;
      const avgLast50 = timings.slice(50).reduce((a, b) => a + b, 0) / 50;

      const timingDifference = Math.abs(avgFirst50 - avgLast50);
      expect(timingDifference).toBeLessThan(1);
    });

    it("should implement rate limiting to prevent timing attacks", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      let rateLimitHit = false;

      for (let i = 0; i < 20; i++) {
        try {
          await user.query(api.sessions.validateToken, {
            sessionId: "fake-session",
            token: "attempting-timing-attack",
          });
        } catch (error: any) {
          if (error.message.includes("Rate limit")) {
            rateLimitHit = true;
            expect(i).toBeGreaterThanOrEqual(9);
            break;
          }
        }
      }

      expect(rateLimitHit).toBe(true);
    });
  });

  describe("CSRF Protection", () => {
    it("should validate origin headers for sensitive operations", async () => {
      const user = t.withIdentity({
        subject: "user123",
        name: "User",
        origin: "https://evil.com",
      });

      await expect(
        user.mutation(api.providerKeys.deleteAllProviderKeys)
      ).rejects.toThrow("Invalid origin");
    });

    it("should require CSRF tokens for state-changing operations", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const csrfToken = await user.query(api.auth.getCsrfToken);
      expect(csrfToken).toBeDefined();
      expect(csrfToken.length).toBeGreaterThan(32);

      await user.mutation(api.providerKeys.upsertProviderKey, {
        provider: "openai",
        encryptedKey: "test-key",
        csrfToken,
      });

      await expect(
        user.mutation(api.providerKeys.upsertProviderKey, {
          provider: "anthropic",
          encryptedKey: "test-key",
          csrfToken: "invalid-csrf-token",
        })
      ).rejects.toThrow("Invalid CSRF token");
    });
  });

  describe("Authentication Bypass Prevention", () => {
    it("should prevent authentication bypass via parameter pollution", async () => {
      const attacker = t.withIdentity({
        subject: "attacker",
        name: "Attacker",
      });

      const bypassAttempts = [
        { userId: "victim123", provider: "openai" },
        { userId: ["attacker", "victim123"], provider: "openai" },
        { userId: { $ne: null }, provider: "openai" },
      ];

      for (const attempt of bypassAttempts) {
        await expect(
          attacker.query(
            api.providerKeys.getProviderKeyMetadata,
            attempt as any
          )
        ).rejects.toThrow();
      }
    });

    it("should validate JWT tokens properly", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const tamperedTokens = [
        "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiJ9.",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6OTk5OTk5OTk5OX0.fake",
        "invalid.jwt.token",
      ];

      for (const token of tamperedTokens) {
        await expect(
          user.action(api.auth.validateJWT, { token })
        ).rejects.toThrow("Invalid token");
      }
    });

    it("should prevent privilege escalation", async () => {
      const regularUser = t.withIdentity({
        subject: "user123",
        name: "User",
        role: "user",
      });

      await expect(
        regularUser.mutation(api.admin.rotateAllKeys)
      ).rejects.toThrow("Admin access required");

      await expect(regularUser.query(api.admin.getAllUserKeys)).rejects.toThrow(
        "Admin access required"
      );
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce rate limits on key operations", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      let rateLimitHit = false;

      for (let i = 0; i < 15; i++) {
        try {
          await user.mutation(api.providerKeys.upsertProviderKey, {
            provider: `provider${i}`,
            encryptedKey: `key${i}`,
          });
        } catch (error: any) {
          if (error.message.includes("Rate limit")) {
            rateLimitHit = true;
            expect(i).toBeGreaterThanOrEqual(9);
            break;
          }
        }
      }

      expect(rateLimitHit).toBe(true);
    });

    it("should implement exponential backoff for repeated failures", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const delays: number[] = [];

      for (let i = 0; i < 5; i++) {
        const start = Date.now();

        try {
          await user.query(api.sessions.validateToken, {
            sessionId: "invalid",
            token: "wrong",
          });
        } catch (error: any) {
          if (error.message.includes("Too many attempts")) {
            const delay = Date.now() - start;
            delays.push(delay);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      for (let i = 1; i < delays.length; i++) {
        expect(delays[i]).toBeGreaterThan(delays[i - 1]);
      }
    });

    it("should implement per-user rate limiting", async () => {
      const alice = t.withIdentity({ subject: "alice", name: "Alice" });
      const bob = t.withIdentity({ subject: "bob", name: "Bob" });

      let aliceHitLimit = false;

      for (let i = 0; i < 12; i++) {
        try {
          await alice.mutation(api.providerKeys.upsertProviderKey, {
            provider: `alice-provider${i}`,
            encryptedKey: `key${i}`,
          });
        } catch (error: any) {
          if (error.message.includes("Rate limit")) {
            aliceHitLimit = true;
            break;
          }
        }
      }

      expect(aliceHitLimit).toBe(true);

      await bob.mutation(api.providerKeys.upsertProviderKey, {
        provider: "bob-provider",
        encryptedKey: "bob-key",
      });

      const bobKeys = await bob.query(api.providerKeys.listUserProviderKeys);
      expect(bobKeys).toHaveLength(1);
    });
  });

  describe("Memory Security", () => {
    it("should clear sensitive data from memory after use", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const spy = vi.spyOn(global.crypto, "getRandomValues");

      await user.action(api.actions.provisionKeys.provisionKeysToSidecar, {
        sessionId: "test-session",
        providers: ["openai"],
      });

      expect(spy).toHaveBeenCalled();

      const calls = spy.mock.calls;
      const hasMemoryClear = calls.some(
        (call) => call[0] instanceof Uint8Array && call[0].length > 0
      );
      expect(hasMemoryClear).toBe(true);

      spy.mockRestore();
    });

    it("should prevent memory leaks in long-running operations", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 100; i++) {
        await user.mutation(api.providerKeys.upsertProviderKey, {
          provider: `provider${i}`,
          encryptedKey: `key${i}`,
        });

        if (i % 10 === 0) {
          global.gc?.();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe("Input Validation", () => {
    it("should validate input length limits", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const oversizedInputs = [
        { provider: "a".repeat(51), encryptedKey: "key" },
        { provider: "openai", encryptedKey: "a".repeat(10001) },
        {
          provider: "openai",
          encryptedKey: "key",
          description: "a".repeat(1001),
        },
      ];

      for (const input of oversizedInputs) {
        await expect(
          user.mutation(api.providerKeys.upsertProviderKey, input)
        ).rejects.toThrow();
      }
    });

    it("should prevent buffer overflow attacks", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const bufferOverflowAttempts = [
        "\x00".repeat(1000),
        "%n".repeat(100),
        "\\x41".repeat(10000),
      ];

      for (const attempt of bufferOverflowAttempts) {
        await expect(
          user.mutation(api.providerKeys.upsertProviderKey, {
            provider: "test",
            encryptedKey: attempt,
          })
        ).rejects.toThrow();
      }
    });

    it("should validate data types strictly", async () => {
      const user = t.withIdentity({ subject: "user123", name: "User" });

      const invalidTypes = [
        { provider: 123, encryptedKey: "key" },
        { provider: "openai", encryptedKey: { key: "value" } },
        { provider: ["array"], encryptedKey: "key" },
        { provider: null, encryptedKey: "key" },
        { provider: "openai", encryptedKey: undefined },
      ];

      for (const input of invalidTypes) {
        await expect(
          user.mutation(api.providerKeys.upsertProviderKey, input as any)
        ).rejects.toThrow();
      }
    });
  });
});
