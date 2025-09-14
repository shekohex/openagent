import { CryptoError, decryptWithKey, encryptWithKey, exportKey, generateDataKey, importKey, SecureBuffer, } from "./crypto";
import { getDefaultKeyManager } from "./keyManager";
const weakPatterns = [
    /^test-?key/i,
    /^dummy-?key/i,
    /^api-?key$/i,
    /^secret-?key$/i,
    /^password$/i,
    /^123456$/,
    /^qwerty$/i,
];
export class EnvelopeEncryption {
    keyManager;
    currentKeyVersion = 1;
    constructor(keyManager) {
        this.keyManager = keyManager ?? getDefaultKeyManager();
    }
    async encryptProviderKey(providerKey) {
        if (!this.validateKeyStrength(providerKey)) {
            throw new CryptoError("Provider key does not meet security requirements");
        }
        const operation = this.createSecureOperation();
        try {
            const keyBuffer = new SecureBuffer(providerKey);
            operation.addBuffer(keyBuffer);
            const dataKey = await generateDataKey();
            const masterKey = await this.keyManager.getMasterKey();
            const encryptedData = await encryptWithKey(dataKey, providerKey);
            const dataKeyRaw = await exportKey(dataKey);
            const dataKeyBuffer = new SecureBuffer(dataKeyRaw);
            operation.addBuffer(dataKeyBuffer);
            const encryptedDataKey = await encryptWithKey(masterKey, dataKeyRaw);
            const result = {
                encryptedKey: encryptedData.ciphertext,
                encryptedDataKey: encryptedDataKey.ciphertext,
                keyVersion: this.currentKeyVersion,
                nonce: encryptedData.nonce,
                tag: encryptedData.tag,
                dataKeyNonce: encryptedDataKey.nonce,
                dataKeyTag: encryptedDataKey.tag,
                masterKeyId: this.keyManager.getKeyId(),
            };
            return result;
        }
        catch (error) {
            throw new CryptoError("Failed to encrypt provider key", error);
        }
        finally {
            operation.cleanup();
        }
    }
    async decryptProviderKey(storedKey) {
        const operation = this.createSecureOperation();
        try {
            if (storedKey.keyVersion !== this.currentKeyVersion) {
                throw new CryptoError(`Unsupported key version: ${storedKey.keyVersion}. Current version: ${this.currentKeyVersion}`);
            }
            const masterKey = await this.keyManager.getMasterKey();
            const encryptedDataKeyResult = {
                ciphertext: storedKey.encryptedDataKey,
                nonce: storedKey.dataKeyNonce,
                tag: storedKey.dataKeyTag,
            };
            const dataKeyRaw = await decryptWithKey(masterKey, encryptedDataKeyResult);
            const dataKeyBuffer = new SecureBuffer(dataKeyRaw);
            operation.addBuffer(dataKeyBuffer);
            const dataKey = await importKey(dataKeyRaw);
            const encryptedProviderKeyResult = {
                ciphertext: storedKey.encryptedKey,
                nonce: storedKey.nonce,
                tag: storedKey.tag,
            };
            const decryptedKey = await decryptWithKey(dataKey, encryptedProviderKeyResult);
            const keyBuffer = new SecureBuffer(decryptedKey);
            operation.addBuffer(keyBuffer);
            return decryptedKey;
        }
        catch (error) {
            throw new CryptoError("Failed to decrypt provider key", error);
        }
        finally {
            operation.cleanup();
        }
    }
    async rotateKey(oldStoredKey, newKeyVersion) {
        try {
            const decryptedKey = await this.decryptProviderKey(oldStoredKey);
            const targetVersion = newKeyVersion || this.currentKeyVersion;
            const rotatedKey = await this.encryptProviderKey(decryptedKey);
            return {
                ...rotatedKey,
                keyVersion: targetVersion,
            };
        }
        catch (error) {
            throw new CryptoError("Failed to rotate provider key", error);
        }
    }
    validateStoredKey(storedKey) {
        const requiredFields = [
            "encryptedKey",
            "encryptedDataKey",
            "keyVersion",
            "nonce",
            "tag",
            "dataKeyNonce",
            "dataKeyTag",
            "masterKeyId",
        ];
        return requiredFields.every((field) => field in storedKey &&
            storedKey[field] !== undefined &&
            storedKey[field] !== null);
    }
    validateKeyStrength(providerKey) {
        const MIN_PROVIDER_KEY_LENGTH = 8;
        if (!providerKey || providerKey.length < MIN_PROVIDER_KEY_LENGTH) {
            return false;
        }
        return !weakPatterns.some((pattern) => pattern.test(providerKey));
    }
    createSecureOperation() {
        const buffers = [];
        return {
            addBuffer: (buffer) => buffers.push(buffer),
            cleanup: () => {
                for (const buffer of buffers) {
                    buffer.clear();
                }
            },
        };
    }
    getCurrentKeyVersion() {
        return this.currentKeyVersion;
    }
    getMasterKeyId() {
        return this.keyManager.getKeyId();
    }
}
let defaultEnvelope;
export function getDefaultEnvelopeEncryption() {
    if (!defaultEnvelope) {
        defaultEnvelope = new EnvelopeEncryption();
    }
    return defaultEnvelope;
}
