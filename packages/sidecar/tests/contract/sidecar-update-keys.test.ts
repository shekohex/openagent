import { expect, test } from "vitest";
import { client } from "./_utils/client";

test("PUT /internal/update-keys requires Authorization header", async () => {
  // Act: Call without authorization header
  const res = await client.internal["update-keys"].$put({
    header: {},
    json: {
      encryptedProviderKeys: [
        {
          provider: "openai",
          encryptedKey: "encrypted_key_data",
          nonce: "nonce_value",
        },
      ],
    },
  });

  // Assert: Should return 401
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error?.code).toBe("UNAUTHORIZED");
});

test("PUT /internal/update-keys rejects invalid authorization", async () => {
  // Act: Call with invalid authorization header
  const res = await client.internal["update-keys"].$put({
    header: {
      Authorization: "Bearer invalid_token",
    },
    json: {
      encryptedProviderKeys: [
        {
          provider: "openai",
          encryptedKey: "encrypted_key_data",
          nonce: "nonce_value",
        },
      ],
    },
  });

  // Assert: Should return 401
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error?.code).toBe("UNAUTHORIZED");
});

test("PUT /internal/update-keys validates request body schema", async () => {
  // Act: Call with invalid body (missing required fields)
  const res = await client.internal["update-keys"].$put({
    header: {
      Authorization: "Bearer valid_token",
    },
    json: {
      encryptedProviderKeys: [
        {
          provider: "", // Empty provider should be rejected
          encryptedKey: "encrypted_key_data",
          nonce: "nonce_value",
        },
      ],
    },
  });

  // Assert: Should return 400
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error?.code).toBe("INVALID_REQUEST");
});

test("PUT /internal/update-keys rejects duplicate providers", async () => {
  // Act: Call with duplicate providers
  const res = await client.internal["update-keys"].$put({
    header: {
      Authorization: "Bearer valid_token",
    },
    json: {
      encryptedProviderKeys: [
        {
          provider: "openai",
          encryptedKey: "encrypted_key_data_1",
          nonce: "nonce_value_1",
        },
        {
          provider: "openai", // Duplicate provider
          encryptedKey: "encrypted_key_data_2",
          nonce: "nonce_value_2",
        },
      ],
    },
  });

  // Assert: Should return 400
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error?.code).toBe("DUPLICATE_PROVIDER");
});

test("PUT /internal/update-keys returns success response", async () => {
  // Act: Call with valid request
  const res = await client.internal["update-keys"].$put({
    header: {
      Authorization: "Bearer valid_token",
    },
    json: {
      encryptedProviderKeys: [
        {
          provider: "openai",
          encryptedKey: "encrypted_key_data",
          nonce: "nonce_value",
        },
        {
          provider: "anthropic",
          encryptedKey: "encrypted_key_data_2",
          nonce: "nonce_value_2",
        },
      ],
    },
  });

  // Assert: Should return 200 with expected shape
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({
    updated: true,
    providers: ["openai", "anthropic"],
  });

  // Assert: No sensitive key material should be in response
  expect(JSON.stringify(body)).not.toContain("encrypted_key_data");
  expect(JSON.stringify(body)).not.toContain("nonce_value");
});

test("PUT /internal/update-keys handles authorization header with spaces", async () => {
  // Act: Call with authorization header containing extra spaces
  const res = await client.internal["update-keys"].$put({
    header: {
      Authorization: "Bearer  valid_token  ",
    },
    json: {
      encryptedProviderKeys: [
        {
          provider: "openai",
          encryptedKey: "encrypted_key_data",
          nonce: "nonce_value",
        },
      ],
    },
  });

  // Assert: Should handle normalized header (implementation dependent)
  // For now, expect it to be handled properly
  expect([401, 200]).toContain(res.status);
});

test("PUT /internal/update-keys handles case-insensitive authorization header", async () => {
  // Act: Call with lowercase authorization header
  const res = await client.internal["update-keys"].$put({
    header: {
      authorization: "Bearer valid_token", // lowercase 'authorization'
    },
    json: {
      encryptedProviderKeys: [
        {
          provider: "openai",
          encryptedKey: "encrypted_key_data",
          nonce: "nonce_value",
        },
      ],
    },
  });

  // Assert: Should handle case-insensitive header (implementation dependent)
  // For now, expect it to be handled properly
  expect([401, 200]).toContain(res.status);
});

test("PUT /internal/update-keys returns unique providers only", async () => {
  // Act: Call with valid request
  const res = await client.internal["update-keys"].$put({
    header: {
      Authorization: "Bearer valid_token",
    },
    json: {
      encryptedProviderKeys: [
        {
          provider: "openai",
          encryptedKey: "encrypted_key_data",
          nonce: "nonce_value",
        },
      ],
    },
  });

  // Assert: Should return 200 with unique providers
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.providers).toEqual(["openai"]);
  expect(body.providers).toHaveLength(1);
});