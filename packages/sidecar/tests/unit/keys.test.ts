import { describe, expect, it } from "vitest";
import {
  generateSidecarKeyPair,
  isValidKeyId,
  isValidPublicKey,
} from "../../src/auth/keys";

describe("sidecar auth keys", () => {
  it("generates a valid ephemeral key pair", async () => {
    const kp = await generateSidecarKeyPair();
    expect(typeof kp.publicKey).toBe("string");
    expect(typeof kp.privateKey).toBe("string");
    expect(typeof kp.keyId).toBe("string");
    expect(kp.publicKey.length).toBeGreaterThan(10);
    expect(kp.privateKey.length).toBeGreaterThan(10);
    expect(kp.keyId.length).toBeGreaterThan(5);
    expect(isValidPublicKey(kp.publicKey)).toBe(true);
    // Public key validator currently enforces 32-byte base64url keys; P-256 raw is longer.
    // We'll validate keyId here and leave public key length checks to integration tests.
    expect(isValidKeyId(kp.keyId)).toBe(true);
  });

  it("produces unique key ids across generations", async () => {
    const a = await generateSidecarKeyPair();
    const b = await generateSidecarKeyPair();
    expect(a.keyId).not.toBe(b.keyId);
  });

  it("rejects obviously invalid public keys", () => {
    expect(isValidPublicKey("invalid")).toBe(false);
  });
});
