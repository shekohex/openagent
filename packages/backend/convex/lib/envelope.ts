import {
  CryptoError,
  generateDataKey,
  exportKey,
  importKey,
  encryptWithKey,
  decryptWithKey,
  type EncryptionResult,
} from "./crypto";
import { getDefaultKeyManager, type MasterKeyManager } from "./keyManager";
import { 
  SecureBuffer, 
  createSecureOperation, 
  SecurityAuditLogger, 
  validateKeyStrength,
  cryptoOperationsRateLimit 
} from "./security";

export interface EnvelopeEncryptionResult {
  encryptedData: EncryptionResult;
  encryptedDataKey: EncryptionResult;
  keyVersion: number;
  masterKeyId: string;
}

export interface StoredProviderKey {
  encryptedKey: string;
  encryptedDataKey: string;
  keyVersion: number;
  nonce: string;
  tag: string;
  dataKeyNonce: string;
  dataKeyTag: string;
  masterKeyId: string;
}

export class EnvelopeEncryption {
  private keyManager: MasterKeyManager;
  private readonly currentKeyVersion = 1;

  constructor(keyManager?: MasterKeyManager) {
    this.keyManager = keyManager || getDefaultKeyManager();
  }

  async encryptProviderKey(providerKey: string): Promise<StoredProviderKey> {
    if (!validateKeyStrength(providerKey)) {
      SecurityAuditLogger.log({
        operation: 'encrypt_provider_key',
        success: false,
        error: 'Weak provider key detected',
      });
      throw new CryptoError("Provider key does not meet security requirements");
    }

    const rateLimit = cryptoOperationsRateLimit.checkLimit('encrypt_provider_key');
    if (!rateLimit.allowed) {
      SecurityAuditLogger.log({
        operation: 'encrypt_provider_key',
        success: false,
        error: 'Rate limit exceeded',
      });
      throw new CryptoError("Rate limit exceeded for encryption operations");
    }

    const operation = createSecureOperation();
    
    try {
      const keyBuffer = SecureBuffer.fromString(providerKey);
      operation.addBuffer(keyBuffer);
      
      const dataKey = await generateDataKey();
      const masterKey = await this.keyManager.getMasterKey();
      
      const encryptedData = await encryptWithKey(dataKey, providerKey);
      
      const dataKeyRaw = await exportKey(dataKey);
      const dataKeyBuffer = SecureBuffer.fromString(dataKeyRaw);
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

      SecurityAuditLogger.log({
        operation: 'encrypt_provider_key',
        success: true,
        metadata: { keyVersion: this.currentKeyVersion },
      });

      return result;
    } catch (error) {
      SecurityAuditLogger.log({
        operation: 'encrypt_provider_key',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new CryptoError("Failed to encrypt provider key", error as Error);
    } finally {
      operation.cleanup();
    }
  }

  async decryptProviderKey(storedKey: StoredProviderKey): Promise<string> {
    const rateLimit = cryptoOperationsRateLimit.checkLimit('decrypt_provider_key');
    if (!rateLimit.allowed) {
      SecurityAuditLogger.log({
        operation: 'decrypt_provider_key',
        success: false,
        error: 'Rate limit exceeded',
      });
      throw new CryptoError("Rate limit exceeded for decryption operations");
    }

    const operation = createSecureOperation();
    
    try {
      if (storedKey.keyVersion !== this.currentKeyVersion) {
        SecurityAuditLogger.log({
          operation: 'decrypt_provider_key',
          success: false,
          error: `Unsupported key version: ${storedKey.keyVersion}`,
        });
        throw new CryptoError(
          `Unsupported key version: ${storedKey.keyVersion}. Current version: ${this.currentKeyVersion}`
        );
      }

      const masterKey = await this.keyManager.getMasterKey();
      
      const encryptedDataKeyResult: EncryptionResult = {
        ciphertext: storedKey.encryptedDataKey,
        nonce: storedKey.dataKeyNonce,
        tag: storedKey.dataKeyTag,
      };
      
      const dataKeyRaw = await decryptWithKey(masterKey, encryptedDataKeyResult);
      const dataKeyBuffer = SecureBuffer.fromString(dataKeyRaw);
      operation.addBuffer(dataKeyBuffer);
      
      const dataKey = await importKey(dataKeyRaw);

      const encryptedProviderKeyResult: EncryptionResult = {
        ciphertext: storedKey.encryptedKey,
        nonce: storedKey.nonce,
        tag: storedKey.tag,
      };

      const decryptedKey = await decryptWithKey(dataKey, encryptedProviderKeyResult);
      const keyBuffer = SecureBuffer.fromString(decryptedKey);
      operation.addBuffer(keyBuffer);

      SecurityAuditLogger.log({
        operation: 'decrypt_provider_key',
        success: true,
        metadata: { keyVersion: storedKey.keyVersion },
      });

      return decryptedKey;
    } catch (error) {
      SecurityAuditLogger.log({
        operation: 'decrypt_provider_key',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new CryptoError("Failed to decrypt provider key", error as Error);
    } finally {
      operation.cleanup();
    }
  }

  async rotateKey(
    oldStoredKey: StoredProviderKey,
    newKeyVersion?: number
  ): Promise<StoredProviderKey> {
    try {
      const decryptedKey = await this.decryptProviderKey(oldStoredKey);
      
      const targetVersion = newKeyVersion || this.currentKeyVersion;
      const rotatedKey = await this.encryptProviderKey(decryptedKey);
      
      return {
        ...rotatedKey,
        keyVersion: targetVersion,
      };
    } catch (error) {
      throw new CryptoError("Failed to rotate provider key", error as Error);
    }
  }

  validateStoredKey(storedKey: Partial<StoredProviderKey>): storedKey is StoredProviderKey {
    const requiredFields: (keyof StoredProviderKey)[] = [
      "encryptedKey",
      "encryptedDataKey", 
      "keyVersion",
      "nonce",
      "tag",
      "dataKeyNonce",
      "dataKeyTag",
      "masterKeyId",
    ];

    return requiredFields.every(field => 
      field in storedKey && storedKey[field] !== undefined && storedKey[field] !== null
    );
  }

  getCurrentKeyVersion(): number {
    return this.currentKeyVersion;
  }

  getMasterKeyId(): string {
    return this.keyManager.getKeyId();
  }
}

let defaultEnvelope: EnvelopeEncryption | undefined;

export function getDefaultEnvelopeEncryption(): EnvelopeEncryption {
  if (!defaultEnvelope) {
    defaultEnvelope = new EnvelopeEncryption();
  }
  return defaultEnvelope;
}