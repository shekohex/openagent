import {
  base64ToUint8Array,
  base64UrlToUint8Array,
  CryptoError,
  generateRandomBytes,
  uint8ArrayToBase64,
  uint8ArrayToBase64Url,
} from "./crypto";

export type EphemeralKeyPair = {
  publicKey: string;
  privateKey: string;
  keyId: string;
};

export type SealedPayload = {
  ciphertext: string;
  nonce: string;
  tag: string;
  recipientKeyId: string;
};

const KEY_ID_LENGTH = 16;
const TAG_LENGTH = 16;
const MILLISECONDS_PER_SECOND = 1000;
const PAYLOAD_AGE_MINUTES = 5;
const MAX_PAYLOAD_AGE_MS = PAYLOAD_AGE_MINUTES * 60 * MILLISECONDS_PER_SECOND;

const LEGACY_X25519_PUBLIC_KEY_LENGTH = 32;
const P256_UNCOMPRESSED_PUBLIC_KEY_LENGTH = 65;
const UNCOMPRESSED_POINT_PREFIX = 0x04;

export class KeyExchange {
  private static readonly NONCE_LENGTH = 12;

  static async generateEphemeralKeyPair(): Promise<EphemeralKeyPair> {
    try {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: "ECDH",
          namedCurve: "P-256",
        },
        true,
        ["deriveKey"]
      );

      const publicKeyRaw = await crypto.subtle.exportKey(
        "raw",
        keyPair.publicKey
      );
      const privateKeyRaw = await crypto.subtle.exportKey(
        "pkcs8",
        keyPair.privateKey
      );

      const keyId = uint8ArrayToBase64Url(generateRandomBytes(KEY_ID_LENGTH));

      return {
        publicKey: uint8ArrayToBase64Url(new Uint8Array(publicKeyRaw)),
        privateKey: uint8ArrayToBase64(new Uint8Array(privateKeyRaw)),
        keyId,
      };
    } catch (error) {
      throw new CryptoError(
        "Failed to generate ephemeral key pair",
        error as Error
      );
    }
  }

  static async deriveSharedSecret(
    privateKeyData: string,
    publicKeyData: string
  ): Promise<CryptoKey> {
    try {
      const privateKeyBytes = base64ToUint8Array(privateKeyData);
      const publicKeyBytes = base64UrlToUint8Array(publicKeyData);

      const privateKey = await crypto.subtle.importKey(
        "pkcs8",
        privateKeyBytes as unknown as ArrayBuffer,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey"]
      );

      const publicKey = await crypto.subtle.importKey(
        "raw",
        publicKeyBytes as unknown as ArrayBuffer,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        []
      );

      return await crypto.subtle.deriveKey(
        { name: "ECDH", public: publicKey },
        privateKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    } catch (error) {
      throw new CryptoError("Failed to derive shared secret", error as Error);
    }
  }

  static async sealMessage(
    message: string,
    recipientPublicKey: string,
    senderPrivateKey: string,
    recipientKeyId: string
  ): Promise<SealedPayload> {
    try {
      const sharedSecret = await KeyExchange.deriveSharedSecret(
        senderPrivateKey,
        recipientPublicKey
      );

      const iv = generateRandomBytes(KeyExchange.NONCE_LENGTH);
      const plaintextBytes = new TextEncoder().encode(message);

      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
        sharedSecret,
        plaintextBytes
      );

      const ciphertextArray = new Uint8Array(ciphertext);
      const tag = ciphertextArray.slice(-TAG_LENGTH);
      const data = ciphertextArray.slice(0, -TAG_LENGTH);

      return {
        ciphertext: uint8ArrayToBase64Url(data),
        nonce: uint8ArrayToBase64Url(iv),
        tag: uint8ArrayToBase64Url(tag),
        recipientKeyId,
      };
    } catch (error) {
      throw new CryptoError("Failed to seal message", error as Error);
    }
  }

  static async openMessage(
    payload: SealedPayload,
    recipientPrivateKey: string,
    senderPublicKey: string
  ): Promise<string> {
    try {
      if (!KeyExchange.validateSealedPayload(payload)) {
        throw new CryptoError("Invalid sealed payload");
      }

      const sharedSecret = await KeyExchange.deriveSharedSecret(
        recipientPrivateKey,
        senderPublicKey
      );

      const ciphertextBytes = base64UrlToUint8Array(payload.ciphertext);
      const nonceBytes = base64UrlToUint8Array(payload.nonce);
      const tagBytes = base64UrlToUint8Array(payload.tag);

      const combinedCiphertext = new Uint8Array(
        ciphertextBytes.length + tagBytes.length
      );
      combinedCiphertext.set(ciphertextBytes);
      combinedCiphertext.set(tagBytes, ciphertextBytes.length);

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonceBytes as unknown as ArrayBuffer },
        sharedSecret,
        combinedCiphertext
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      throw new CryptoError("Failed to open sealed message", error as Error);
    }
  }

  static validatePublicKey(publicKey: string): boolean {
    try {
      const keyBytes = base64UrlToUint8Array(publicKey);

      if (keyBytes.length === LEGACY_X25519_PUBLIC_KEY_LENGTH) {
        return true;
      }

      if (keyBytes.length === P256_UNCOMPRESSED_PUBLIC_KEY_LENGTH) {
        // SEC1 uncompressed points must start with 0x04. Prevent accidental
        // acceptance of compressed encodings or malformed data.
        return keyBytes.at(0) === UNCOMPRESSED_POINT_PREFIX;
      }

      return false;
    } catch {
      return false;
    }
  }

  static validateKeyId(keyId: string): boolean {
    if (!keyId || typeof keyId !== "string") {
      return false;
    }
    try {
      const keyIdBytes = base64UrlToUint8Array(keyId);
      return keyIdBytes.length === KEY_ID_LENGTH;
    } catch {
      return false;
    }
  }

  static validateSealedPayload(payload: unknown): payload is SealedPayload {
    if (typeof payload !== "object" || payload === null) {
      return false;
    }
    const p = payload as Record<string, unknown>;
    return (
      typeof p.ciphertext === "string" &&
      typeof p.nonce === "string" &&
      typeof p.tag === "string" &&
      typeof p.recipientKeyId === "string" &&
      KeyExchange.validateKeyId(p.recipientKeyId)
    );
  }
}

export type ProviderKeyPayload = {
  provider: string;
  key: string;
  timestamp: number;
};

export class SecureProviderKeyDelivery {
  static async packageProviderKeys(
    providerKeys: Map<string, string>,
    recipientPublicKey: string,
    senderPrivateKey: string,
    recipientKeyId: string
  ): Promise<SealedPayload> {
    const payload: {
      keys: Array<{ provider: string; key: string }>;
      timestamp: number;
    } = {
      keys: Array.from(providerKeys.entries()).map(([provider, key]) => ({
        provider,
        key,
      })),
      timestamp: Date.now(),
    };
    const message = JSON.stringify(payload);
    return await KeyExchange.sealMessage(
      message,
      recipientPublicKey,
      senderPrivateKey,
      recipientKeyId
    );
  }

  static async unpackProviderKeys(
    sealedPayload: SealedPayload,
    recipientPrivateKey: string,
    senderPublicKey: string
  ): Promise<Map<string, string>> {
    const message = await KeyExchange.openMessage(
      sealedPayload,
      recipientPrivateKey,
      senderPublicKey
    );
    const payload = JSON.parse(message);
    if (!(payload.keys && Array.isArray(payload.keys))) {
      throw new CryptoError("Invalid provider keys payload format");
    }
    const now = Date.now();
    const payloadAge = now - (payload.timestamp || 0);
    if (payloadAge > MAX_PAYLOAD_AGE_MS) {
      throw new CryptoError("Provider keys payload has expired");
    }
    const keys = new Map<string, string>();
    for (const entry of payload.keys) {
      if (typeof entry.provider === "string" && typeof entry.key === "string") {
        keys.set(entry.provider, entry.key);
      }
    }
    return keys;
  }
}
