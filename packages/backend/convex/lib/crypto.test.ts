import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  base64ToUint8Array,
  base64UrlToUint8Array,
  CryptoError,
  clearString,
  decryptWithKey,
  encryptWithKey,
  exportKey,
  generateDataKey,
  generateRandomBytes,
  generateSecureNonce,
  importKey,
  SecureBuffer,
  uint8ArrayToBase64,
  uint8ArrayToBase64Url,
  zeroMemory,
} from "./crypto";

describe("Cryptographic Operations", () => {
  describe("Random Number Generation", () => {
    it("should generate random bytes of specified length", () => {
      const bytes = generateRandomBytes(32);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);

      const bytes2 = generateRandomBytes(32);
      expect(bytes).not.toEqual(bytes2);
    });

    it("should throw error for invalid byte lengths", () => {
      expect(() => generateRandomBytes(0)).toThrow(CryptoError);
      expect(() => generateRandomBytes(-1)).toThrow(CryptoError);
      expect(() => generateRandomBytes(1025)).toThrow(CryptoError);
      expect(() => generateRandomBytes(1025)).toThrow("Invalid byte length");
    });

    it("should generate secure nonces with correct length", () => {
      const nonce = generateSecureNonce();
      expect(nonce).toBeInstanceOf(Uint8Array);
      expect(nonce.length).toBe(12);

      const nonce2 = generateSecureNonce();
      expect(nonce).not.toEqual(nonce2);
    });
  });

  describe("AES-256-GCM Key Operations", () => {
    it("should generate AES-256-GCM data keys", async () => {
      const key = await generateDataKey();
      expect(key).toBeDefined();
      expect(key.type).toBe("secret");
      expect(key.algorithm.name).toBe("AES-GCM");
      expect(key.usages).toContain("encrypt");
      expect(key.usages).toContain("decrypt");
    });

    it("should export and import keys correctly", async () => {
      const originalKey = await generateDataKey();
      const exportedKey = await exportKey(originalKey);

      expect(typeof exportedKey).toBe("string");
      expect(exportedKey.length).toBeGreaterThan(0);

      const importedKey = await importKey(exportedKey);
      expect(importedKey.type).toBe("secret");
      expect(importedKey.algorithm.name).toBe("AES-GCM");
    });

    it("should handle key import errors gracefully", async () => {
      await expect(importKey("invalid-base64!@#")).rejects.toThrow(CryptoError);
      await expect(importKey("")).rejects.toThrow(CryptoError);
    });
  });

  describe("AES-256-GCM Encryption/Decryption", () => {
    let testKey: CryptoKey;

    beforeEach(async () => {
      testKey = await generateDataKey();
    });

    it("should encrypt and decrypt data correctly", async () => {
      const plaintext = "This is a secret message";
      const encrypted = await encryptWithKey(testKey, plaintext);

      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.nonce).toBeTruthy();
      expect(encrypted.tag).toBeTruthy();
      expect(encrypted.ciphertext).not.toBe(plaintext);

      const decrypted = await decryptWithKey(testKey, encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should use unique nonces for each encryption", async () => {
      const plaintext = "Same message";
      const encrypted1 = await encryptWithKey(testKey, plaintext);
      const encrypted2 = await encryptWithKey(testKey, plaintext);

      expect(encrypted1.nonce).not.toBe(encrypted2.nonce);
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });

    it("should support custom nonces", async () => {
      const plaintext = "Test message";
      const customNonce = generateSecureNonce();
      const encrypted = await encryptWithKey(testKey, plaintext, customNonce);

      expect(base64ToUint8Array(encrypted.nonce)).toEqual(customNonce);

      const decrypted = await decryptWithKey(testKey, encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should fail decryption with wrong key", async () => {
      const plaintext = "Secret data";
      const wrongKey = await generateDataKey();
      const encrypted = await encryptWithKey(testKey, plaintext);

      await expect(decryptWithKey(wrongKey, encrypted)).rejects.toThrow(
        CryptoError
      );
    });

    it("should fail decryption with tampered ciphertext", async () => {
      const plaintext = "Original message";
      const encrypted = await encryptWithKey(testKey, plaintext);

      const tamperedResult = {
        ...encrypted,
        ciphertext: encrypted.ciphertext.slice(0, -4) + "XXXX",
      };

      await expect(decryptWithKey(testKey, tamperedResult)).rejects.toThrow(
        CryptoError
      );
    });

    it("should fail decryption with incorrect tag", async () => {
      const plaintext = "Test data";
      const encrypted = await encryptWithKey(testKey, plaintext);

      const tamperedResult = {
        ...encrypted,
        tag: uint8ArrayToBase64(generateRandomBytes(16)),
      };

      await expect(decryptWithKey(testKey, tamperedResult)).rejects.toThrow(
        CryptoError
      );
    });

    it("should handle empty strings", async () => {
      const plaintext = "";
      const encrypted = await encryptWithKey(testKey, plaintext);
      const decrypted = await decryptWithKey(testKey, encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should handle large data", async () => {
      const largeText = "X".repeat(10_000);
      const encrypted = await encryptWithKey(testKey, largeText);
      const decrypted = await decryptWithKey(testKey, encrypted);
      expect(decrypted).toBe(largeText);
    });
  });

  describe("Base64 Encoding/Decoding", () => {
    it("should convert between Uint8Array and base64", () => {
      const original = new Uint8Array([1, 2, 3, 4, 5]);
      const base64 = uint8ArrayToBase64(original);
      const decoded = base64ToUint8Array(base64);

      expect(decoded).toEqual(original);
    });

    it("should convert between Uint8Array and base64url", () => {
      const original = new Uint8Array([255, 254, 253, 252, 251]);
      const base64url = uint8ArrayToBase64Url(original);

      expect(base64url).not.toContain("+");
      expect(base64url).not.toContain("/");
      expect(base64url).not.toContain("=");

      const decoded = base64UrlToUint8Array(base64url);
      expect(decoded).toEqual(original);
    });

    it("should handle invalid base64 strings", () => {
      expect(() => base64ToUint8Array("!@#$%^&*()")).toThrow(CryptoError);
      expect(() => base64ToUint8Array("invalid base64")).toThrow(CryptoError);
    });

    it("should handle empty inputs", () => {
      const emptyArray = new Uint8Array(0);
      const base64 = uint8ArrayToBase64(emptyArray);
      const decoded = base64ToUint8Array(base64);
      expect(decoded).toEqual(emptyArray);
    });
  });

  describe("Memory Security", () => {
    it("should zero memory for Uint8Array", () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      zeroMemory(data);
      expect(data.every((byte) => byte === 0)).toBe(true);
    });

    it("should attempt to clear string memory", () => {
      const spy = vi.spyOn(crypto, "getRandomValues");
      const testString = "sensitive data";
      clearString(testString);

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("should handle non-string inputs to clearString", () => {
      expect(() => clearString(null as any)).not.toThrow();
      expect(() => clearString(undefined as any)).not.toThrow();
      expect(() => clearString(123 as any)).not.toThrow();
    });
  });

  describe("SecureBuffer", () => {
    it("should create buffer from string", () => {
      const buffer = new SecureBuffer("test data");
      expect(buffer.toString()).toBe("test data");
    });

    it("should create buffer from Uint8Array", () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]);
      const buffer = new SecureBuffer(data);
      expect(buffer.get()).toEqual(data);
      expect(buffer.toString()).toBe("Hello");
    });

    it("should clear buffer on demand", () => {
      const buffer = new SecureBuffer("sensitive");
      const bytes = buffer.get();

      buffer.clear();

      expect(() => buffer.get()).toThrow(CryptoError);
      expect(() => buffer.toString()).toThrow(CryptoError);
      expect(bytes.every((byte) => byte === 0)).toBe(true);
    });

    it("should prevent access after clearing", () => {
      const buffer = new SecureBuffer("data");
      buffer.clear();

      expect(() => buffer.get()).toThrow("SecureBuffer has been cleared");
      expect(() => buffer.toString()).toThrow("SecureBuffer has been cleared");
    });

    it("should not throw when clearing multiple times", () => {
      const buffer = new SecureBuffer("data");
      buffer.clear();
      expect(() => buffer.clear()).not.toThrow();
    });

    it("should support Symbol.dispose for automatic cleanup", () => {
      const buffer = new SecureBuffer("test");
      const disposeFn = buffer[Symbol.dispose];

      expect(typeof disposeFn).toBe("function");
      disposeFn.call(buffer);

      expect(() => buffer.get()).toThrow(CryptoError);
    });
  });
});
