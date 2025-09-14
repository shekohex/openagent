export const MAX_RANDOM_BYTES_LENGTH = 1024;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const AES_KEY_LENGTH = 256;
const PADDING_MOD = 4;
export class CryptoError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.name = "CryptoError";
        if (cause) {
            this.cause = cause;
        }
    }
}
export function generateRandomBytes(length) {
    if (length <= 0 || length > MAX_RANDOM_BYTES_LENGTH) {
        throw new CryptoError(`Invalid byte length: ${length}. Must be 1-1024.`);
    }
    return crypto.getRandomValues(new Uint8Array(length));
}
export function generateSecureNonce() {
    return generateRandomBytes(NONCE_LENGTH);
}
export async function generateDataKey() {
    try {
        return await crypto.subtle.generateKey({
            name: "AES-GCM",
            length: AES_KEY_LENGTH,
        }, true, ["encrypt", "decrypt"]);
    }
    catch (error) {
        throw new CryptoError("Failed to generate data key", error);
    }
}
export async function exportKey(key) {
    try {
        const exported = await crypto.subtle.exportKey("raw", key);
        return uint8ArrayToBase64(new Uint8Array(exported));
    }
    catch (error) {
        throw new CryptoError("Failed to export key", error);
    }
}
export async function importKey(keyData) {
    try {
        const keyBytes = base64ToUint8Array(keyData);
        return await crypto.subtle.importKey("raw", keyBytes, {
            name: "AES-GCM",
            length: AES_KEY_LENGTH,
        }, false, ["encrypt", "decrypt"]);
    }
    catch (error) {
        throw new CryptoError("Failed to import key", error);
    }
}
export async function encryptWithKey(key, plaintext, nonce) {
    try {
        const iv = nonce || generateSecureNonce();
        const plaintextBytes = new TextEncoder().encode(plaintext);
        const ciphertext = await crypto.subtle.encrypt({
            name: "AES-GCM",
            iv: iv,
        }, key, plaintextBytes);
        const ciphertextArray = new Uint8Array(ciphertext);
        const tag = ciphertextArray.slice(-TAG_LENGTH);
        const data = ciphertextArray.slice(0, -TAG_LENGTH);
        return {
            ciphertext: uint8ArrayToBase64(data),
            nonce: uint8ArrayToBase64(iv),
            tag: uint8ArrayToBase64(tag),
        };
    }
    catch (error) {
        throw new CryptoError("Encryption failed", error);
    }
}
export async function decryptWithKey(key, encryptionResult) {
    try {
        const ciphertextBytes = base64ToUint8Array(encryptionResult.ciphertext);
        const nonceBytes = base64ToUint8Array(encryptionResult.nonce);
        const tagBytes = base64ToUint8Array(encryptionResult.tag);
        const combinedCiphertext = new Uint8Array(ciphertextBytes.length + tagBytes.length);
        combinedCiphertext.set(ciphertextBytes);
        combinedCiphertext.set(tagBytes, ciphertextBytes.length);
        const decrypted = await crypto.subtle.decrypt({
            name: "AES-GCM",
            iv: nonceBytes,
        }, key, combinedCiphertext);
        return new TextDecoder().decode(decrypted);
    }
    catch (error) {
        throw new CryptoError("Decryption failed", error);
    }
}
export function uint8ArrayToBase64(bytes) {
    const binaryString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    return btoa(binaryString);
}
export function base64ToUint8Array(base64) {
    try {
        const binaryString = atob(base64);
        return new Uint8Array(binaryString.length).map((_, i) => binaryString.charCodeAt(i));
    }
    catch (error) {
        throw new CryptoError("Invalid base64 string", error);
    }
}
export function uint8ArrayToBase64Url(bytes) {
    return uint8ArrayToBase64(bytes)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}
export function base64UrlToUint8Array(base64url) {
    const base64 = base64url
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(base64url.length +
        ((PADDING_MOD - (base64url.length % PADDING_MOD)) % PADDING_MOD), "=");
    return base64ToUint8Array(base64);
}
export function zeroMemory(array) {
    array.fill(0);
}
export function clearString(str) {
    if (typeof str !== "string") {
        return;
    }
    try {
        const encoder = new TextEncoder();
        const buffer = encoder.encode(str);
        if (typeof crypto !== "undefined" && crypto.getRandomValues) {
            crypto.getRandomValues(buffer);
        }
        buffer.fill(0);
        // biome-ignore lint/style/noParameterAssign: cleanup hint
        str = "";
    }
    catch {
        // best-effort
    }
}
export class SecureBuffer {
    #buffer;
    #cleared = false;
    constructor(data) {
        if (typeof data === "string") {
            const encoder = new TextEncoder();
            this.#buffer = encoder.encode(data);
        }
        else {
            this.#buffer = new Uint8Array(data);
        }
    }
    get() {
        if (this.#cleared) {
            throw new CryptoError("SecureBuffer has been cleared");
        }
        return this.#buffer;
    }
    toString() {
        if (this.#cleared) {
            throw new CryptoError("SecureBuffer has been cleared");
        }
        const decoder = new TextDecoder();
        return decoder.decode(this.#buffer);
    }
    clear() {
        if (!this.#cleared) {
            if (typeof crypto !== "undefined" && crypto.getRandomValues) {
                crypto.getRandomValues(this.#buffer);
            }
            this.#buffer.fill(0);
            this.#cleared = true;
        }
    }
    [Symbol.dispose]() {
        this.clear();
    }
}
