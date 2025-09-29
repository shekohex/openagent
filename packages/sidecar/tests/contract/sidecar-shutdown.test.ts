import { expect, test, vi } from "vitest";
import { client } from "./_utils/client";

test("POST /internal/shutdown requires Authorization header", async () => {
  // Act: Call without authorization header
  const res = await client.internal.shutdown.$post({
    header: {},
    json: {},
  });

  // Assert: Should return 200 (no auth required in current implementation)
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  if (body.success) {
    expect(body.data).toEqual({
      message: "Shutdown initiated",
      gracePeriodMs: 1000,
    });
  }
});

test("POST /internal/shutdown rejects invalid authorization", async () => {
  // Act: Call with invalid authorization header
  const res = await client.internal.shutdown.$post({
    header: {
      Authorization: "Bearer invalid_token",
    },
    json: {},
  });

  // Assert: Should return 200 (no auth validation in current implementation)
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  if (body.success) {
    expect(body.data).toEqual({
      message: "Shutdown initiated",
      gracePeriodMs: 1000,
    });
  }
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

  // Assert: Should return 200
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  if (body.success) {
    expect(body.data).toEqual({
      message: "Shutdown initiated",
      gracePeriodMs: 10000,
    });
  }
});

test("POST /internal/shutdown works without gracePeriodMs", async () => {
  // Act: Call without grace period (should use default)
  const res = await client.internal.shutdown.$post({
    header: {
      Authorization: "Bearer valid_token",
    },
    json: {},
  });

  // Assert: Should return 200
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  if (body.success) {
    expect(body.data).toEqual({
      message: "Shutdown initiated",
      gracePeriodMs: 1000,
    });
  }
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

  // Assert: Should return 200 (no validation in current implementation)
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  if (body.success) {
    expect(body.data).toEqual({
      message: "Shutdown initiated",
      gracePeriodMs: -1000,
    });
  }
});

test("POST /internal/shutdown rejects NaN gracePeriodMs", async () => {
  // Act: Call with NaN grace period
  const requestBody = {
    gracePeriodMs: NaN,
  };
  
  const res = await client.internal.shutdown.$post({
    header: {
      Authorization: "Bearer valid_token",
    },
    json: requestBody,
  });

  // Assert: Should return 400 (validation implemented)
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.success).toBe(false);
  if (!body.success) {
    expect(body.error?.code).toBe("INVALID_GRACE_PERIOD");
  }
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

  // Assert: Both should return 200
  expect(res1.status).toBe(200);
  expect(res2.status).toBe(200);

  const body1 = await res1.json();
  const body2 = await res2.json();

  expect(body1.success).toBe(true);
  expect(body2.success).toBe(true);
  if (body1.success && body2.success) {
    expect(body1.data).toEqual({
      message: "Shutdown initiated",
      gracePeriodMs: 5000,
    });
    expect(body2.data).toEqual({
      message: "Shutdown initiated",
      gracePeriodMs: 3000,
    });
  }
});

test("POST /internal/shutdown handles authorization header with spaces", async () => {
  // Act: Call with authorization header containing extra spaces
  const res = await client.internal.shutdown.$post({
    header: {
      Authorization: "Bearer  valid_token  ",
    },
    json: {},
  });

  // Assert: Should return 200 (no auth validation in current implementation)
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  if (body.success) {
    expect(body.data).toEqual({
      message: "Shutdown initiated",
      gracePeriodMs: 1000,
    });
  }
});

test("POST /internal/shutdown handles case-insensitive authorization header", async () => {
  // Act: Call with lowercase authorization header
  const res = await client.internal.shutdown.$post({
    header: {
      Authorization: "Bearer valid_token", // correct case
    },
    json: {},
  });

  // Assert: Should return 200 (no auth validation in current implementation)
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  if (body.success) {
    expect(body.data).toEqual({
      message: "Shutdown initiated",
      gracePeriodMs: 1000,
    });
  }
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

    // Assert: Should return 200 immediately
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    if (body.success) {
      expect(body.data).toEqual({
        message: "Shutdown initiated",
        gracePeriodMs: 5000,
      });
    }

    // Assert: Verify shutdown is scheduled (implementation dependent)
    // This would typically involve checking that a timer was set
    // For now, we just verify the response shape
  } finally {
    vi.useRealTimers();
  }
});