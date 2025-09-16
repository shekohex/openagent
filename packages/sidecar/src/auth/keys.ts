// Import from local workspace build output to avoid installing workspace links in sandbox
// eslint-disable-next-line import/no-relative-packages
import { KeyExchange } from "../../../crypto-lib/dist/keyExchange.js";

export type SidecarKeyPair = {
  publicKey: string;
  privateKey: string;
  keyId: string;
};

/**
 * Generate an ephemeral key pair for the sidecar registration flow.
 *
 * Implementation detail: delegates to crypto-lib ECDH P-256 helpers.
 * Returns URL-safe base64 public key and key id suitable for transport.
 */
export const generateSidecarKeyPair = async (): Promise<SidecarKeyPair> => {
  const kp = await KeyExchange.generateEphemeralKeyPair();
  return {
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    keyId: kp.keyId,
  };
};

/** Validate URL-safe base64 public key format and length. */
export const isValidPublicKey = (publicKey: string): boolean =>
  KeyExchange.validatePublicKey(publicKey);

/** Validate URL-safe base64 key id format and length. */
export const isValidKeyId = (keyId: string): boolean =>
  KeyExchange.validateKeyId(keyId);
