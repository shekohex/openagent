import { KeyExchange } from "@openagent/crypto-lib";

export async function generateEphemeralKeys() {
  return await KeyExchange.generateEphemeralKeyPair();
}
