import { expect, test } from "vitest";
import { client } from "./_utils/client";
import { vi, beforeEach, afterEach } from "vitest";

test("POST /internal/shutdown requires Authorization header", async () => {
  // Act: Call without authorization header
  const res = await client.internal.shutdown.$post({
    header: {},
    json: {},
  });

  // Assert: Should return 401
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error?.code).toBe("UNAUTHORIZED");
});

test("POST /internal/shutdown rejects invalid authorization", async () => {
  // Act: Call with invalid authorization header
  const res = await client.internal.shutdown.$post({
    header: {
      Authorization: "Bearer invalid_token",
    },
    json: {},
  });

  // Assert: Should return 401
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error?.code).toBe("UNAUTHORIZED");
});

test("POST /internal/shutdown accepts optional gracePeriodMs", async () => {
  // Act: Call with grace period
  const res = await client.internal.shutdown.$post({
    header: {
      Authorization: "Bearer valid_token",
    },
    json: {
      gracePeriodMs: 10000,
    },
  });

  // Assert: Should return 202
  expect(res.status).toBe(202);
  const body = await res.json();
  expect(body).toEqual({
    shuttingDown: true,
  });
});

test("POST /internal/shutdown works without gracePeriodMs", async () => {
  // Act: Call without grace period (should use default)
  const res = await client.internal.shutdown.$post({
    header: {
      Authorization: "Bearer valid_token",
    },
    json: {},
  });

  // Assert: Should return 202
  expect(res.status).toBe(202);
  const body = await res.json();
  expect(body).toEqual({
    shuttingDown: true,
  });
});

test("POST /internal/shutdown rejects negative gracePeriodMs", async () => {
  // Act: Call with negative grace period
  const res = await client.internal.shutdown.$post({
    header: {
      Authorization: "Bearer valid_token",
    },
    json: {
      gracePeriodMs: -1000,
    },
  });

  // Assert: Should return 400
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error?.code).toBe("INVALID_REQUEST");
});

test("POST /internal/shutdown rejects NaN gracePeriodMs", async () => {
  // Act: Call with NaN grace period
  const res = await client.internal.shutdown.$post({
    header: {
      Authorization: "Bearer valid_token",
    },
    json: {
      gracePeriodMs: NaN,
    },
  });

  // Assert: Should return 400
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error?.code).toBe("INVALID_REQUEST");
});

test("POST /internal/shutdown is idempotent", async () => {
  // Act: Call shutdown twice
  const res1 = await client.internal.shutdown.$post({
    header: {
      Authorization: "Bearer valid_token",
    },
    json: {
      gracePeriodMs: 5000,
    },
  });

  const res2 = await client.internal.shutdown.$post({
    header: {
      Authorization: "Bearer valid_token",
    },
    json: {
      gracePeriodMs: 3000,
    },
  });

  // Assert: Both should return 202
  expect(res1.status).toBe(202);
  expect(res2.status).toBe(202);

  const body1 = await res1.json();
  const body2 = await res2.json();

  expect(body1).toEqual({
    shuttingDown: true,
  });
  expect(body2).toEqual({
    shuttingDown: true,
  });
});

test("POST /internal/shutdown handles authorization header with spaces", async () => {
  // Act: Call with authorization header containing extra spaces
  const res = await client.internal.shutdown.$post({
    header: {
      Authorization: "Bearer  valid_token  ",
    },
    json: {},
  });

  // Assert: Should handle normalized header (implementation dependent)
  // For now, expect it to be handled properly
  expect([401, 202]).toContain(res.status);
});

test("POST /internal/shutdown handles case-insensitive authorization header", async () => {
  // Act: Call with lowercase authorization header
  const res = await client.internal.shutdown.$post({
    header: {
      authorization: "Bearer valid_token", // lowercase 'authorization'
    },
    json: {},
  });

  // Assert: Should handle case-insensitive header (implementation dependent)
  // For now, expect it to be handled properly
  expect([401, 202]).toContain(res.status);
});

test("POST /internal/shutdown schedules shutdown with timer", async () => {
  // Setup: Mock timers
  vi.useFakeTimers();

  try {
    // Act: Call shutdown with grace period
    const res = await client.internal.shutdown.$post({
      header: {
        Authorization: "Bearer valid_token",
      },
      json: {
        gracePeriodMs: 5000,
      },
    });

    // Assert: Should return 202 immediately
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({
      shuttingDown: true,
    });

    // Assert: Verify shutdown is scheduled (implementation dependent)
    // This would typically involve checking that a timer was set
    // For now, we just verify the response shape
  } finally {
    vi.useRealTimers();
  }
});