import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  test,
} from "vitest";
// eslint-disable-next-line import/no-relative-packages
import {
  KeyExchange,
  SecureProviderKeyDelivery,
} from "../../../crypto-lib/dist/index.js";
import { client } from "./_utils/client";
import {
  resetOrchestratorAdapter,
  setOrchestratorAdapter,
} from "../../src/orchestrator/adapter";

describe("POST /internal/register", () => {
  beforeEach(() => {
    setOrchestratorAdapter({
      async registerSidecar({
        sidecarPublicKey,
        sidecarKeyId,
      }) {
        const orchestratorKeys = await KeyExchange.generateEphemeralKeyPair();
        const sealed = await SecureProviderKeyDelivery.packageProviderKeys(
          new Map([["openai", "sk-test"]]),
          sidecarPublicKey,
          orchestratorKeys.privateKey,
          sidecarKeyId
        );

        return {
          sidecarAuthToken: "sidecar-token-123",
          orchestratorPublicKey: orchestratorKeys.publicKey,
          orchestratorKeyId: orchestratorKeys.keyId,
          encryptedProviderKeys: sealed,
          opencodePort: 7123,
        };
      },
    });
  });

  afterEach(() => {
    resetOrchestratorAdapter();
  });

  test("returns 200 with sealed provider keys", async () => {
    expectTypeOf(client.internal.register.$post).toBeFunction();
    const sidecarKeys = await KeyExchange.generateEphemeralKeyPair();

    const res = await client.internal.register.$post({
      json: {
        sessionId: "sess_123",
        registrationToken: "reg_token",
        publicKey: sidecarKeys.publicKey,
        keyId: sidecarKeys.keyId,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    if (!body.success) {
      throw new Error(`Expected success response, received ${JSON.stringify(body)}`);
    }
    expect(typeof body.sidecarAuthToken).toBe("string");
    expect(typeof body.orchestratorPublicKey).toBe("string");
    expect(typeof body.orchestratorKeyId).toBe("string");
    expect(body.opencodePort).toBe(7123);
    expect(body.encryptedProviderKeys).toEqual(
      expect.objectContaining({
        ciphertext: expect.any(String),
        nonce: expect.any(String),
        tag: expect.any(String),
        recipientKeyId: expect.any(String),
      })
    );

    const decrypted = await SecureProviderKeyDelivery.unpackProviderKeys(
      body.encryptedProviderKeys,
      sidecarKeys.privateKey,
      body.orchestratorPublicKey
    );

    expect(decrypted.get("openai")).toBe("sk-test");
  });

  test("rejects invalid public key input", async () => {
    const res = await client.internal.register.$post({
      json: {
        sessionId: "sess_456",
        registrationToken: "token",
        publicKey: "invalid",
        keyId: "not-valid",
      },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe("INVALID_PUBLIC_KEY");
  });
});
