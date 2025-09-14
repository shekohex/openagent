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
export declare class KeyExchange {
    private static readonly KEY_LENGTH;
    private static readonly NONCE_LENGTH;
    static generateEphemeralKeyPair(): Promise<EphemeralKeyPair>;
    static deriveSharedSecret(privateKeyData: string, publicKeyData: string): Promise<CryptoKey>;
    static sealMessage(message: string, recipientPublicKey: string, senderPrivateKey: string, recipientKeyId: string): Promise<SealedPayload>;
    static openMessage(payload: SealedPayload, recipientPrivateKey: string, senderPublicKey: string): Promise<string>;
    static validatePublicKey(publicKey: string): boolean;
    static validateKeyId(keyId: string): boolean;
    static validateSealedPayload(payload: unknown): payload is SealedPayload;
}
export type ProviderKeyPayload = {
    provider: string;
    key: string;
    timestamp: number;
};
export declare class SecureProviderKeyDelivery {
    static packageProviderKeys(providerKeys: Map<string, string>, recipientPublicKey: string, senderPrivateKey: string, recipientKeyId: string): Promise<SealedPayload>;
    static unpackProviderKeys(sealedPayload: SealedPayload, recipientPrivateKey: string, senderPublicKey: string): Promise<Map<string, string>>;
}
