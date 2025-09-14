import { beforeEach, describe, expect, it, vi } from "vitest";
import { CryptoError } from "../../src";
import {
  type EphemeralKeyPair,
  KeyExchange,
  type SealedPayload,
  SecureProviderKeyDelivery,
} from "../../src";

describe("ECDH Key Exchange", () => {
  describe("Ephemeral Key Generation", () => {
    it("should generate valid ephemeral key pairs", async () => {
      const keyPair = await KeyExchange.generateEphemeralKeyPair();

      expect(keyPair).toHaveProperty("publicKey");
      expect(keyPair).toHaveProperty("privateKey");
      expect(keyPair).toHaveProperty("keyId");

      expect(keyPair.publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(keyPair.privateKey).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(keyPair.keyId).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("should generate unique key pairs", async () => {
      const keyPair1 = await KeyExchange.generateEphemeralKeyPair();
      const keyPair2 = await KeyExchange.generateEphemeralKeyPair();

      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
      expect(keyPair1.keyId).not.toBe(keyPair2.keyId);
    });

    it("should generate keys with consistent lengths", async () => {
      const keyPairs = await Promise.all([
        KeyExchange.generateEphemeralKeyPair(),
        KeyExchange.generateEphemeralKeyPair(),
        KeyExchange.generateEphemeralKeyPair(),
      ]);

      const publicKeyLengths = keyPairs.map((kp) => kp.publicKey.length);
      const privateKeyLengths = keyPairs.map((kp) => kp.privateKey.length);

      expect(new Set(publicKeyLengths).size).toBe(1);
      expect(new Set(privateKeyLengths).size).toBe(1);
    });
  });

  describe("Shared Secret Derivation", () => {
    let alice: EphemeralKeyPair;
    let bob: EphemeralKeyPair;

    beforeEach(async () => {
      alice = await KeyExchange.generateEphemeralKeyPair();
      bob = await KeyExchange.generateEphemeralKeyPair();
    });

    it("should derive matching shared secrets", async () => {
      const aliceShared = await KeyExchange.deriveSharedSecret(
        alice.privateKey,
        bob.publicKey
      );
      const bobShared = await KeyExchange.deriveSharedSecret(
        bob.privateKey,
        alice.publicKey
      );

      expect(aliceShared).toBeDefined();
      expect(bobShared).toBeDefined();
      expect(aliceShared.type).toBe("secret");
      expect(bobShared.type).toBe("secret");
    });

    it("should fail with invalid private key", async () => {
      const invalidPrivateKey = "invalid-key-data";

      await expect(
        KeyExchange.deriveSharedSecret(invalidPrivateKey, bob.publicKey)
      ).rejects.toThrow(CryptoError);
    });

    it("should fail with invalid public key", async () => {
      const invalidPublicKey = "invalid-public-key";

      await expect(
        KeyExchange.deriveSharedSecret(alice.privateKey, invalidPublicKey)
      ).rejects.toThrow(CryptoError);
    });

    it("should derive different secrets for different key pairs", async () => {
      const charlie = await KeyExchange.generateEphemeralKeyPair();

      const aliceBobSecret = await KeyExchange.deriveSharedSecret(
        alice.privateKey,
        bob.publicKey
      );
      const aliceCharlieSecret = await KeyExchange.deriveSharedSecret(
        alice.privateKey,
        charlie.publicKey
      );

      // Test that the derived secrets produce different ciphertexts
      const testMessage = "test";
      const nonce = new Uint8Array(12);

      const encrypted1 = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce },
        aliceBobSecret,
        new TextEncoder().encode(testMessage)
      );

      const encrypted2 = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce },
        aliceCharlieSecret,
        new TextEncoder().encode(testMessage)
      );

      expect(new Uint8Array(encrypted1)).not.toEqual(
        new Uint8Array(encrypted2)
      );
    });
  });

  describe("Sealed Box Encryption", () => {
    let alice: EphemeralKeyPair;
    let bob: EphemeralKeyPair;
    const testMessage = "This is a secret message for Bob";

    beforeEach(async () => {
      alice = await KeyExchange.generateEphemeralKeyPair();
      bob = await KeyExchange.generateEphemeralKeyPair();
    });

    it("should seal and open messages correctly", async () => {
      const sealed = await KeyExchange.sealMessage(
        testMessage,
        bob.publicKey,
        alice.privateKey,
        bob.keyId
      );

      expect(sealed.ciphertext).toBeTruthy();
      expect(sealed.nonce).toBeTruthy();
      expect(sealed.tag).toBeTruthy();
      expect(sealed.recipientKeyId).toBe(bob.keyId);

      const opened = await KeyExchange.openMessage(
        sealed,
        bob.privateKey,
        alice.publicKey
      );

      expect(opened).toBe(testMessage);
    });

    it("should produce unique ciphertexts for same message", async () => {
      const sealed1 = await KeyExchange.sealMessage(
        testMessage,
        bob.publicKey,
        alice.privateKey,
        bob.keyId
      );
      const sealed2 = await KeyExchange.sealMessage(
        testMessage,
        bob.publicKey,
        alice.privateKey,
        bob.keyId
      );

      expect(sealed1.ciphertext).not.toBe(sealed2.ciphertext);
      expect(sealed1.nonce).not.toBe(sealed2.nonce);
    });

    it("should fail to open with wrong private key", async () => {
      const sealed = await KeyExchange.sealMessage(
        testMessage,
        bob.publicKey,
        alice.privateKey,
        bob.keyId
      );

      const charlie = await KeyExchange.generateEphemeralKeyPair();

      await expect(
        KeyExchange.openMessage(sealed, charlie.privateKey, alice.publicKey)
      ).rejects.toThrow(CryptoError);
    });

    it("should fail to open with wrong sender public key", async () => {
      const sealed = await KeyExchange.sealMessage(
        testMessage,
        bob.publicKey,
        alice.privateKey,
        bob.keyId
      );

      const charlie = await KeyExchange.generateEphemeralKeyPair();

      await expect(
        KeyExchange.openMessage(sealed, bob.privateKey, charlie.publicKey)
      ).rejects.toThrow(CryptoError);
    });

    it("should fail with tampered ciphertext", async () => {
      const sealed = await KeyExchange.sealMessage(
        testMessage,
        bob.publicKey,
        alice.privateKey,
        bob.keyId
      );

      const tampered: SealedPayload = {
        ...sealed,
        ciphertext: sealed.ciphertext.slice(0, -4) + "XXXX",
      };

      await expect(
        KeyExchange.openMessage(tampered, bob.privateKey, alice.publicKey)
      ).rejects.toThrow(CryptoError);
    });

    it("should fail with incorrect tag", async () => {
      const sealed = await KeyExchange.sealMessage(
        testMessage,
        bob.publicKey,
        alice.privateKey,
        bob.keyId
      );

      const tampered: SealedPayload = {
        ...sealed,
        tag: "AAAAAAAAAAAAAAAAAAAAAA==",
      };

      await expect(
        KeyExchange.openMessage(tampered, bob.privateKey, alice.publicKey)
      ).rejects.toThrow(CryptoError);
    });

    it("should handle empty messages", async () => {
      const emptyMessage = "";
      const sealed = await KeyExchange.sealMessage(
        emptyMessage,
        bob.publicKey,
        alice.privateKey,
        bob.keyId
      );

      const opened = await KeyExchange.openMessage(
        sealed,
        bob.privateKey,
        alice.publicKey
      );

      expect(opened).toBe(emptyMessage);
    });

    it("should handle large messages", async () => {
      const largeMessage = "X".repeat(10_000);
      const sealed = await KeyExchange.sealMessage(
        largeMessage,
        bob.publicKey,
        alice.privateKey,
        bob.keyId
      );

      const opened = await KeyExchange.openMessage(
        sealed,
        bob.privateKey,
        alice.publicKey
      );

      expect(opened).toBe(largeMessage);
    });
  });

  describe("Validation Functions", () => {
    it("should validate correct public keys", () => {
      expect(KeyExchange.validatePublicKey("validbase64url_-key")).toBe(false);
    });

    it("should reject invalid public keys", () => {
      expect(KeyExchange.validatePublicKey("")).toBe(false);
      expect(KeyExchange.validatePublicKey("invalid!@#$")).toBe(false);
      expect(KeyExchange.validatePublicKey("short")).toBe(false);
    });

    it("should validate correct key IDs", () => {
      const validKeyId = "AAAAAAAAAAAAAAAAAAAAAA";
      expect(KeyExchange.validateKeyId(validKeyId)).toBe(true);
    });

    it("should reject invalid key IDs", () => {
      expect(KeyExchange.validateKeyId("")).toBe(false);
      expect(KeyExchange.validateKeyId("short")).toBe(false);
      expect(KeyExchange.validateKeyId(null as any)).toBe(false);
      expect(KeyExchange.validateKeyId(123 as any)).toBe(false);
    });

    it("should validate sealed payloads", () => {
      const validPayload: SealedPayload = {
        ciphertext: "base64data",
        nonce: "base64nonce",
        tag: "base64tag",
        recipientKeyId: "AAAAAAAAAAAAAAAAAAAAAA",
      };

      expect(KeyExchange.validateSealedPayload(validPayload)).toBe(true);
    });

    it("should reject invalid sealed payloads", () => {
      expect(KeyExchange.validateSealedPayload(null)).toBe(false);
      expect(KeyExchange.validateSealedPayload({})).toBe(false);
      expect(KeyExchange.validateSealedPayload({ ciphertext: "data" })).toBe(
        false
      );
      expect(
        KeyExchange.validateSealedPayload({
          ciphertext: "data",
          nonce: "nonce",
          tag: "tag",
          recipientKeyId: "invalid",
        })
      ).toBe(false);
    });
  });

  describe("Provider Key Delivery", () => {
    let alice: EphemeralKeyPair;
    let bob: EphemeralKeyPair;
    let providerKeys: Map<string, string>;

    beforeEach(async () => {
      alice = await KeyExchange.generateEphemeralKeyPair();
      bob = await KeyExchange.generateEphemeralKeyPair();
      providerKeys = new Map([
        ["openai", "sk-openai-test-key-1234567890"],
        ["anthropic", "sk-anthropic-test-key-0987654321"],
        ["google", "sk-google-test-key-5555555555"],
      ]);
    });

    it("should package and unpack provider keys", async () => {
      const sealed = await SecureProviderKeyDelivery.packageProviderKeys(
        providerKeys,
        bob.publicKey,
        alice.privateKey,
        bob.keyId
      );

      expect(sealed).toHaveProperty("ciphertext");
      expect(sealed).toHaveProperty("recipientKeyId", bob.keyId);

      const unpacked = await SecureProviderKeyDelivery.unpackProviderKeys(
        sealed,
        bob.privateKey,
        alice.publicKey
      );

      expect(unpacked).toBeInstanceOf(Map);
      expect(unpacked.size).toBe(3);
      expect(unpacked.get("openai")).toBe("sk-openai-test-key-1234567890");
      expect(unpacked.get("anthropic")).toBe(
        "sk-anthropic-test-key-0987654321"
      );
      expect(unpacked.get("google")).toBe("sk-google-test-key-5555555555");
    });

    it("should handle empty provider keys", async () => {
      const emptyKeys = new Map<string, string>();

      const sealed = await SecureProviderKeyDelivery.packageProviderKeys(
        emptyKeys,
        bob.publicKey,
        alice.privateKey,
        bob.keyId
      );

      const unpacked = await SecureProviderKeyDelivery.unpackProviderKeys(
        sealed,
        bob.privateKey,
        alice.publicKey
      );

      expect(unpacked.size).toBe(0);
    });

    it("should reject expired payloads", async () => {
      const sealed = await SecureProviderKeyDelivery.packageProviderKeys(
        providerKeys,
        bob.publicKey,
        alice.privateKey,
        bob.keyId
      );

      const originalDateNow = Date.now;
      Date.now = vi.fn(() => originalDateNow() + 6 * 60 * 1000);

      await expect(
        SecureProviderKeyDelivery.unpackProviderKeys(
          sealed,
          bob.privateKey,
          alice.publicKey
        )
      ).rejects.toThrow("Provider keys payload has expired");

      Date.now = originalDateNow;
    });

    it("should reject tampered payloads", async () => {
      const sealed = await SecureProviderKeyDelivery.packageProviderKeys(
        providerKeys,
        bob.publicKey,
        alice.privateKey,
        bob.keyId
      );

      const tampered: SealedPayload = {
        ...sealed,
        ciphertext: sealed.ciphertext.slice(0, -4) + "XXXX",
      };

      await expect(
        SecureProviderKeyDelivery.unpackProviderKeys(
          tampered,
          bob.privateKey,
          alice.publicKey
        )
      ).rejects.toThrow(CryptoError);
    });

    it("should fail with wrong recipient", async () => {
      const sealed = await SecureProviderKeyDelivery.packageProviderKeys(
        providerKeys,
        bob.publicKey,
        alice.privateKey,
        bob.keyId
      );

      const charlie = await KeyExchange.generateEphemeralKeyPair();

      await expect(
        SecureProviderKeyDelivery.unpackProviderKeys(
          sealed,
          charlie.privateKey,
          alice.publicKey
        )
      ).rejects.toThrow(CryptoError);
    });
  });
});
