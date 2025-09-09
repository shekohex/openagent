import { CryptoError, importKey } from "./crypto";

const MIN_MASTER_KEY_LENGTH = 32; // 256 bits

export type MasterKeyProvider = {
  getMasterKey(): Promise<CryptoKey>;
  getKeyId(): string;
};

export class EnvironmentMasterKeyProvider implements MasterKeyProvider {
  private readonly envVarName: string;
  // biome-ignore lint/style/useReadonlyClassProperties: false-positive see `getMasterKey` method.
  #cachedKey?: CryptoKey;

  constructor(envVarName = "OPENAGENT_MASTER_KEY") {
    this.envVarName = envVarName;
  }

  async getMasterKey(): Promise<CryptoKey> {
    if (this.#cachedKey !== undefined) {
      return this.#cachedKey;
    }

    const keyString = process.env[this.envVarName];
    if (!keyString) {
      throw new CryptoError(
        `Master key not found in environment variable: ${this.envVarName}`
      );
    }

    if (keyString.length < MIN_MASTER_KEY_LENGTH) {
      throw new CryptoError(
        `Master key must be at least ${MIN_MASTER_KEY_LENGTH} characters (256 bits). Current length: ${keyString.length}`
      );
    }

    try {
      this.#cachedKey = await importKey(keyString);
      return this.#cachedKey;
    } catch (error) {
      throw new CryptoError(
        `Failed to import master key from ${this.envVarName}`,
        error as Error
      );
    }
  }

  getKeyId(): string {
    return `env:${this.envVarName}`;
  }
}

export class KMSMasterKeyProvider implements MasterKeyProvider {
  private readonly keyId: string;

  constructor(keyId: string) {
    this.keyId = keyId;
  }

  getMasterKey(): Promise<CryptoKey> {
    throw new CryptoError(
      "KMS provider not implemented yet. Use EnvironmentMasterKeyProvider for now."
    );
  }

  getKeyId(): string {
    return `kms:${this.keyId}`;
  }
}

export class MasterKeyManager {
  private provider: MasterKeyProvider;

  constructor(provider?: MasterKeyProvider) {
    this.provider = provider ?? new EnvironmentMasterKeyProvider();
  }

  async getMasterKey(): Promise<CryptoKey> {
    return await this.provider.getMasterKey();
  }

  getKeyId(): string {
    return this.provider.getKeyId();
  }

  setProvider(provider: MasterKeyProvider): void {
    this.provider = provider;
  }
}

let defaultManager: MasterKeyManager | undefined;

export function getDefaultKeyManager(): MasterKeyManager {
  if (!defaultManager) {
    defaultManager = new MasterKeyManager();
  }
  return defaultManager;
}
