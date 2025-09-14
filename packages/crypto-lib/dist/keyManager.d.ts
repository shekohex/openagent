export type MasterKeyProvider = {
    getMasterKey(): Promise<CryptoKey>;
    getKeyId(): string;
};
export declare class EnvironmentMasterKeyProvider implements MasterKeyProvider {
    #private;
    private readonly envVarName;
    constructor(envVarName?: string);
    getMasterKey(): Promise<CryptoKey>;
    getKeyId(): string;
}
export declare class KMSMasterKeyProvider implements MasterKeyProvider {
    private readonly keyId;
    constructor(keyId: string);
    getMasterKey(): Promise<CryptoKey>;
    getKeyId(): string;
}
export declare class MasterKeyManager {
    private provider;
    constructor(provider?: MasterKeyProvider);
    getMasterKey(): Promise<CryptoKey>;
    getKeyId(): string;
    setProvider(provider: MasterKeyProvider): void;
}
export declare function getDefaultKeyManager(): MasterKeyManager;
