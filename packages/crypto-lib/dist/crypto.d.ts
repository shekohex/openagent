export declare const MAX_RANDOM_BYTES_LENGTH = 1024;
export declare class CryptoError extends Error {
    cause?: Error;
    constructor(message: string, cause?: Error);
}
export type EncryptionResult = {
    ciphertext: string;
    nonce: string;
    tag: string;
};
export declare function generateRandomBytes(length: number): Uint8Array;
export declare function generateSecureNonce(): Uint8Array;
export declare function generateDataKey(): Promise<CryptoKey>;
export declare function exportKey(key: CryptoKey): Promise<string>;
export declare function importKey(keyData: string): Promise<CryptoKey>;
export declare function encryptWithKey(key: CryptoKey, plaintext: string, nonce?: Uint8Array): Promise<EncryptionResult>;
export declare function decryptWithKey(key: CryptoKey, encryptionResult: EncryptionResult): Promise<string>;
export declare function uint8ArrayToBase64(bytes: Uint8Array): string;
export declare function base64ToUint8Array(base64: string): Uint8Array;
export declare function uint8ArrayToBase64Url(bytes: Uint8Array): string;
export declare function base64UrlToUint8Array(base64url: string): Uint8Array;
export declare function zeroMemory(array: Uint8Array): void;
export declare function clearString(str: string): void;
export declare class SecureBuffer {
    #private;
    constructor(data: string | Uint8Array);
    get(): Uint8Array;
    toString(): string;
    clear(): void;
    [Symbol.dispose](): void;
}
