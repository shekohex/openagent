import { CryptoError, importKey } from "./crypto";
const MIN_MASTER_KEY_LENGTH = 32; // 256 bits
export class EnvironmentMasterKeyProvider {
    envVarName;
    // biome-ignore lint/style/useReadonlyClassProperties: this cache is mutated in getMasterKey()
    #cachedKey;
    constructor(envVarName = "OPENAGENT_MASTER_KEY") {
        this.envVarName = envVarName;
    }
    async getMasterKey() {
        if (this.#cachedKey !== undefined) {
            return this.#cachedKey;
        }
        const keyString = process.env[this.envVarName];
        if (!keyString) {
            throw new CryptoError(`Master key not found in environment variable: ${this.envVarName}`);
        }
        if (keyString.length < MIN_MASTER_KEY_LENGTH) {
            throw new CryptoError(`Master key must be at least ${MIN_MASTER_KEY_LENGTH} characters (256 bits). Current length: ${keyString.length}`);
        }
        try {
            this.#cachedKey = await importKey(keyString);
            return this.#cachedKey;
        }
        catch (error) {
            throw new CryptoError(`Failed to import master key from ${this.envVarName}`, error);
        }
    }
    getKeyId() {
        return `env:${this.envVarName}`;
    }
}
export class KMSMasterKeyProvider {
    keyId;
    constructor(keyId) {
        this.keyId = keyId;
    }
    getMasterKey() {
        throw new CryptoError("KMS provider not implemented yet. Use EnvironmentMasterKeyProvider for now.");
    }
    getKeyId() {
        return `kms:${this.keyId}`;
    }
}
export class MasterKeyManager {
    provider;
    constructor(provider) {
        this.provider = provider ?? new EnvironmentMasterKeyProvider();
    }
    async getMasterKey() {
        return await this.provider.getMasterKey();
    }
    getKeyId() {
        return this.provider.getKeyId();
    }
    setProvider(provider) {
        this.provider = provider;
    }
}
let defaultManager;
export function getDefaultKeyManager() {
    if (!defaultManager) {
        defaultManager = new MasterKeyManager();
    }
    return defaultManager;
}
