import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { EnvelopeEncryption, type StoredProviderKey } from "./envelope";
import { CryptoError } from "./crypto";
import type { MasterKeyManager } from "./keyManager";

describe("Envelope Encryption", () => {
  let envelope: EnvelopeEncryption;
  let masterKey: CryptoKey;
  let mockKeyManager: MasterKeyManager;

  beforeEach(async () => {
    // Reset rate limiters before each test
    const { cryptoOperationsRateLimit } = await import("./security");
    cryptoOperationsRateLimit.reset("encrypt_provider_key");
    cryptoOperationsRateLimit.reset("decrypt_provider_key");

    masterKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );

    mockKeyManager = {
      getMasterKey: vi.fn().mockResolvedValue(masterKey),
      getKeyId: vi.fn().mockReturnValue("test-master-key-id"),
      rotateKey: vi.fn(),
    };

    envelope = new EnvelopeEncryption(mockKeyManager);

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Provider Key Encryption", () => {
    it("should encrypt provider keys with envelope encryption", async () => {
      const providerKey = "sk-test-1234567890abcdefghijklmnopqrstuvwxyz";
      const result = await envelope.encryptProviderKey(providerKey);

      expect(result).toHaveProperty("encryptedKey");
      expect(result).toHaveProperty("encryptedDataKey");
      expect(result).toHaveProperty("keyVersion");
      expect(result).toHaveProperty("nonce");
      expect(result).toHaveProperty("tag");
      expect(result).toHaveProperty("dataKeyNonce");
      expect(result).toHaveProperty("dataKeyTag");
      expect(result).toHaveProperty("masterKeyId");

      expect(result.keyVersion).toBe(1);
      expect(result.masterKeyId).toBe("test-master-key-id");
      expect(result.encryptedKey).not.toBe(providerKey);
    });

    it("should decrypt provider keys correctly", async () => {
      const originalKey = "sk-test-1234567890abcdefghijklmnopqrstuvwxyz";
      const encrypted = await envelope.encryptProviderKey(originalKey);
      const decrypted = await envelope.decryptProviderKey(encrypted);

      expect(decrypted).toBe(originalKey);
    });

    it("should generate unique encryption for same key", async () => {
      const providerKey = "sk-test-same-key-1234567890abcdefghijklmnop";
      const result1 = await envelope.encryptProviderKey(providerKey);
      const result2 = await envelope.encryptProviderKey(providerKey);

      expect(result1.encryptedKey).not.toBe(result2.encryptedKey);
      expect(result1.nonce).not.toBe(result2.nonce);
      expect(result1.encryptedDataKey).not.toBe(result2.encryptedDataKey);
      expect(result1.dataKeyNonce).not.toBe(result2.dataKeyNonce);
    });

    it("should reject weak provider keys", async () => {
      const weakKey = "weak";
      await expect(envelope.encryptProviderKey(weakKey)).rejects.toThrow(
        "Provider key does not meet security requirements"
      );
    });

    it("should handle empty provider keys", async () => {
      await expect(envelope.encryptProviderKey("")).rejects.toThrow(
        CryptoError
      );
    });
  });

  describe("Provider Key Decryption", () => {
    it("should fail with tampered encrypted key", async () => {
      const originalKey = "sk-test-original-1234567890abcdefghijklmnop";
      const encrypted = await envelope.encryptProviderKey(originalKey);

      const tampered: StoredProviderKey = {
        ...encrypted,
        encryptedKey: encrypted.encryptedKey.slice(0, -4) + "XXXX",
      };

      await expect(envelope.decryptProviderKey(tampered)).rejects.toThrow(
        CryptoError
      );
    });

    it("should fail with tampered encrypted data key", async () => {
      const originalKey = "sk-test-original-1234567890abcdefghijklmnop";
      const encrypted = await envelope.encryptProviderKey(originalKey);

      const tampered: StoredProviderKey = {
        ...encrypted,
        encryptedDataKey: encrypted.encryptedDataKey.slice(0, -4) + "XXXX",
      };

      await expect(envelope.decryptProviderKey(tampered)).rejects.toThrow(
        CryptoError
      );
    });

    it("should fail with wrong tag", async () => {
      const originalKey = "sk-test-original-1234567890abcdefghijklmnop";
      const encrypted = await envelope.encryptProviderKey(originalKey);

      const tampered: StoredProviderKey = {
        ...encrypted,
        tag: "AAAAAAAAAAAAAAAAAAAAAA==",
      };

      await expect(envelope.decryptProviderKey(tampered)).rejects.toThrow(
        CryptoError
      );
    });

    it("should fail with unsupported key version", async () => {
      const originalKey = "sk-test-version-1234567890abcdefghijklmnop";
      const encrypted = await envelope.encryptProviderKey(originalKey);

      const wrongVersion: StoredProviderKey = {
        ...encrypted,
        keyVersion: 99,
      };

      await expect(envelope.decryptProviderKey(wrongVersion)).rejects.toThrow(
        CryptoError
      );
    });
  });

  describe("Key Rotation", () => {
    it("should rotate encrypted keys", async () => {
      const originalKey = "sk-test-rotation-1234567890abcdefghijklmnop";
      const encrypted = await envelope.encryptProviderKey(originalKey);
      const rotated = await envelope.rotateKey(encrypted);

      expect(rotated.encryptedKey).not.toBe(encrypted.encryptedKey);
      expect(rotated.encryptedDataKey).not.toBe(encrypted.encryptedDataKey);
      expect(rotated.masterKeyId).toBe(encrypted.masterKeyId);

      const decrypted = await envelope.decryptProviderKey(rotated);
      expect(decrypted).toBe(originalKey);
    });

    it("should support rotation with new key version", async () => {
      const originalKey = "sk-test-version-rotation-1234567890abcdefgh";
      const encrypted = await envelope.encryptProviderKey(originalKey);
      const rotated = await envelope.rotateKey(encrypted, 2);

      expect(rotated.keyVersion).toBe(2);

      const decrypted = await envelope.decryptProviderKey({
        ...rotated,
        keyVersion: 1,
      });
      expect(decrypted).toBe(originalKey);
    });

    it("should handle rotation failures gracefully", async () => {
      const originalKey = "sk-test-rotation-fail-1234567890abcdefghijk";
      const encrypted = await envelope.encryptProviderKey(originalKey);

      vi.mocked(mockKeyManager.getMasterKey).mockRejectedValueOnce(
        new Error("Master key unavailable")
      );

      await expect(envelope.rotateKey(encrypted)).rejects.toThrow(
        "Failed to rotate provider key"
      );
    });
  });

  describe("Key Validation", () => {
    it("should validate complete stored keys", () => {
      const validKey: StoredProviderKey = {
        encryptedKey: "encrypted",
        encryptedDataKey: "datakey",
        keyVersion: 1,
        nonce: "nonce",
        tag: "tag",
        dataKeyNonce: "dknonce",
        dataKeyTag: "dktag",
        masterKeyId: "master",
      };

      expect(envelope.validateStoredKey(validKey)).toBe(true);
    });

    it("should reject incomplete stored keys", () => {
      const incompleteKey = {
        encryptedKey: "encrypted",
        keyVersion: 1,
      };

      expect(envelope.validateStoredKey(incompleteKey)).toBe(false);
    });

    it("should reject keys with null values", () => {
      const keyWithNull = {
        encryptedKey: "encrypted",
        encryptedDataKey: null,
        keyVersion: 1,
        nonce: "nonce",
        tag: "tag",
        dataKeyNonce: "dknonce",
        dataKeyTag: "dktag",
        masterKeyId: "master",
      };

      expect(envelope.validateStoredKey(keyWithNull as any)).toBe(false);
    });

    it("should reject keys with undefined values", () => {
      const keyWithUndefined = {
        encryptedKey: "encrypted",
        encryptedDataKey: "datakey",
        keyVersion: undefined,
        nonce: "nonce",
        tag: "tag",
        dataKeyNonce: "dknonce",
        dataKeyTag: "dktag",
        masterKeyId: "master",
      };

      expect(envelope.validateStoredKey(keyWithUndefined as any)).toBe(false);
    });
  });

  describe("Metadata Methods", () => {
    it("should return current key version", () => {
      expect(envelope.getCurrentKeyVersion()).toBe(1);
    });

    it("should return master key ID", () => {
      expect(envelope.getMasterKeyId()).toBe("test-master-key-id");
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce rate limits on encryption", async () => {
      const providerKey = "sk-test-rate-limit-1234567890abcdefghijklmn";

      // The rate limit is set to 10 attempts per minute
      let hitRateLimit = false;

      for (let i = 0; i < 15; i++) {
        try {
          await envelope.encryptProviderKey(providerKey);
        } catch (error) {
          if (
            error instanceof CryptoError &&
            error.message.includes("Rate limit")
          ) {
            hitRateLimit = true;
            expect(i).toBeGreaterThanOrEqual(9);
            break;
          }
        }
      }

      expect(hitRateLimit).toBe(true);
    });

    it("should enforce rate limits on decryption", async () => {
      const providerKey = "sk-test-rate-limit-decrypt-1234567890abcdef";
      const encrypted = await envelope.encryptProviderKey(providerKey);

      // Reset the rate limiter for decryption
      const { cryptoOperationsRateLimit } = await import("./security");
      cryptoOperationsRateLimit.reset("decrypt_provider_key");

      let hitRateLimit = false;

      for (let i = 0; i < 15; i++) {
        try {
          await envelope.decryptProviderKey(encrypted);
        } catch (error) {
          if (
            error instanceof CryptoError &&
            error.message.includes("Rate limit")
          ) {
            hitRateLimit = true;
            expect(i).toBeGreaterThanOrEqual(9);
            break;
          }
        }
      }

      expect(hitRateLimit).toBe(true);
    });
  });
});
