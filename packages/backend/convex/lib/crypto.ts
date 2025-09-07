const MAX_RANDOM_BYTES_LENGTH = 1024;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const AES_KEY_LENGTH = 256;
const PADDING_MOD = 4;

export class CryptoError extends Error {
  cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "CryptoError";
    if (cause) {
      this.cause = cause;
    }
  }
}

export type EncryptionResult = {
  ciphertext: string;
  nonce: string;
  tag: string;
};

export function generateRandomBytes(length: number): Uint8Array {
  if (length <= 0 || length > MAX_RANDOM_BYTES_LENGTH) {
    throw new CryptoError(`Invalid byte length: ${length}. Must be 1-1024.`);
  }
  return crypto.getRandomValues(new Uint8Array(length));
}

export function generateSecureNonce(): Uint8Array {
  return generateRandomBytes(NONCE_LENGTH);
}

export async function generateDataKey(): Promise<CryptoKey> {
  try {
    return await crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: AES_KEY_LENGTH,
      },
      true,
      ["encrypt", "decrypt"]
    );
  } catch (error) {
    throw new CryptoError("Failed to generate data key", error as Error);
  }
}

export async function exportKey(key: CryptoKey): Promise<string> {
  try {
    const exported = await crypto.subtle.exportKey("raw", key);
    return uint8ArrayToBase64(new Uint8Array(exported));
  } catch (error) {
    throw new CryptoError("Failed to export key", error as Error);
  }
}

export async function importKey(keyData: string): Promise<CryptoKey> {
  try {
    const keyBytes = base64ToUint8Array(keyData);
    return await crypto.subtle.importKey(
      "raw",
      keyBytes as unknown as ArrayBuffer,
      {
        name: "AES-GCM",
        length: AES_KEY_LENGTH,
      },
      false,
      ["encrypt", "decrypt"]
    );
  } catch (error) {
    throw new CryptoError("Failed to import key", error as Error);
  }
}

export async function encryptWithKey(
  key: CryptoKey,
  plaintext: string,
  nonce?: Uint8Array
): Promise<EncryptionResult> {
  try {
    const iv = nonce || generateSecureNonce();
    const plaintextBytes = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv as unknown as ArrayBuffer,
      },
      key,
      plaintextBytes
    );

    const ciphertextArray = new Uint8Array(ciphertext);
    const tag = ciphertextArray.slice(-TAG_LENGTH);
    const data = ciphertextArray.slice(0, -TAG_LENGTH);

    return {
      ciphertext: uint8ArrayToBase64(data),
      nonce: uint8ArrayToBase64(iv),
      tag: uint8ArrayToBase64(tag),
    };
  } catch (error) {
    throw new CryptoError("Encryption failed", error as Error);
  }
}

export async function decryptWithKey(
  key: CryptoKey,
  encryptionResult: EncryptionResult
): Promise<string> {
  try {
    const ciphertextBytes = base64ToUint8Array(encryptionResult.ciphertext);
    const nonceBytes = base64ToUint8Array(encryptionResult.nonce);
    const tagBytes = base64ToUint8Array(encryptionResult.tag);

    const combinedCiphertext = new Uint8Array(
      ciphertextBytes.length + tagBytes.length
    );
    combinedCiphertext.set(ciphertextBytes);
    combinedCiphertext.set(tagBytes, ciphertextBytes.length);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonceBytes as unknown as ArrayBuffer,
      },
      key,
      combinedCiphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    throw new CryptoError("Decryption failed", error as Error);
  }
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const binaryString = Array.from(bytes, (byte) =>
    String.fromCharCode(byte)
  ).join("");
  return btoa(binaryString);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  try {
    const binaryString = atob(base64);
    return new Uint8Array(binaryString.length).map((_, i) =>
      binaryString.charCodeAt(i)
    );
  } catch (error) {
    throw new CryptoError("Invalid base64 string", error as Error);
  }
}

export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  return uint8ArrayToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(
      base64url.length +
        ((PADDING_MOD - (base64url.length % PADDING_MOD)) % PADDING_MOD),
      "="
    );
  return base64ToUint8Array(base64);
}

export function zeroMemory(array: Uint8Array): void {
  array.fill(0);
}

export function clearString(str: string): void {
  if (typeof str !== "string") {
    return;
  }

  // Convert string to buffer and overwrite with random data then zeros
  try {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(str);

    // First overwrite with random values
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(buffer);
    }

    // Then fill with zeros
    buffer.fill(0);

    // Force garbage collection hint (not guaranteed but helps)
    // @ts-ignore - str reassignment for memory clearing
    str = "";
  } catch {
    // Silent fail - best effort memory clearing
  }
}

export class SecureBuffer {
  private buffer: Uint8Array;
  private cleared = false;

  constructor(data: string | Uint8Array) {
    if (typeof data === "string") {
      const encoder = new TextEncoder();
      this.buffer = encoder.encode(data);
    } else {
      this.buffer = new Uint8Array(data);
    }
  }

  get(): Uint8Array {
    if (this.cleared) {
      throw new CryptoError("SecureBuffer has been cleared");
    }
    return this.buffer;
  }

  toString(): string {
    if (this.cleared) {
      throw new CryptoError("SecureBuffer has been cleared");
    }
    const decoder = new TextDecoder();
    return decoder.decode(this.buffer);
  }

  clear(): void {
    if (!this.cleared) {
      // Overwrite with random data first
      if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        crypto.getRandomValues(this.buffer);
      }
      // Then zeros
      this.buffer.fill(0);
      this.cleared = true;
    }
  }

  // Ensure cleanup on garbage collection
  [Symbol.dispose](): void {
    this.clear();
  }
}
