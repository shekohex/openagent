import { type EncryptionResult } from "./crypto";
import { type MasterKeyManager } from "./keyManager";
export type EnvelopeEncryptionResult = {
    encryptedData: EncryptionResult;
    encryptedDataKey: EncryptionResult;
    keyVersion: number;
    masterKeyId: string;
};
export type StoredProviderKey = {
    encryptedKey: string;
    encryptedDataKey: string;
    keyVersion: number;
    nonce: string;
    tag: string;
    dataKeyNonce: string;
    dataKeyTag: string;
    masterKeyId: string;
};
export declare class EnvelopeEncryption {
    private readonly keyManager;
    private readonly currentKeyVersion;
    constructor(keyManager?: MasterKeyManager);
    encryptProviderKey(providerKey: string): Promise<StoredProviderKey>;
    decryptProviderKey(storedKey: StoredProviderKey): Promise<string>;
    rotateKey(oldStoredKey: StoredProviderKey, newKeyVersion?: number): Promise<StoredProviderKey>;
    validateStoredKey(storedKey: Partial<StoredProviderKey>): storedKey is StoredProviderKey;
    private validateKeyStrength;
    private createSecureOperation;
    getCurrentKeyVersion(): number;
    getMasterKeyId(): string;
}
export declare function getDefaultEnvelopeEncryption(): EnvelopeEncryption;
