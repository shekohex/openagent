import { expect, test } from "vitest";
import { createConvexTest } from "../../test-utils/utils";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import type { FunctionReference } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import type { Email } from "../../convex/schema";

test("sessions.resume - returns success with instanceId for active session", async () => {
  const t = await createConvexTest(schema);

  // Arrange: Create a user and session
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      email: "test@example.com" as Email,
      name: "Test User",
      createdAt: Date.now(),
    });
  });

  const sessionId = await t.run(async (ctx) => {
    return await ctx.db.insert("sessions", {
      userId,
      title: "Test Session",
      status: "active",
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  // Arrange: Create an instance for the session
  const instanceId = await t.run(async (ctx) => {
    return await ctx.db.insert("instances", {
      sessionId,
      driver: "docker",
      state: "running",
      endpointInternal: "http://localhost:3000",
      registeredAt: Date.now(),
    });
  });

  // Act: Call resume action
  // @ts-expect-error temporary until convex codegen exposes sessions.resume in generated api
  const result = await t.action(
    (api as unknown as { sessions: { resume: unknown } }).sessions
      .resume as unknown,
    {
      id: sessionId as Id<"sessions">,
    }
  );

  // Assert: Verify response shape
  expect(result).toEqual({
    success: true,
    instanceId: instanceId,
    error: undefined,
  });
});

test("sessions.resume - returns success false for session without instance", async () => {
  const t = await createConvexTest(schema);

  // Arrange: Create a user and session without instance
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      email: "test@example.com" as Email,
      name: "Test User",
      createdAt: Date.now(),
    });
  });

  const sessionId = await t.run(async (ctx) => {
    return await ctx.db.insert("sessions", {
      userId,
      title: "Test Session",
      status: "idle",
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  // Act: Call resume action
  // @ts-expect-error temporary until convex codegen exposes sessions.resume in generated api
  const result = await t.action(
    (api as unknown as { sessions: { resume: unknown } }).sessions
      .resume as unknown,
    {
      id: sessionId as Id<"sessions">,
    }
  );

  // Assert: Verify response shape
  expect(result).toEqual({
    success: false,
    instanceId: undefined,
    error: expect.any(String),
  });
});

test("sessions.resume - returns success false for terminated instance", async () => {
  const t = await createConvexTest(schema);

  // Arrange: Create a user and session with terminated instance
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      email: "test@example.com" as Email,
      name: "Test User",
      createdAt: Date.now(),
    });
  });

  const sessionId = await t.run(async (ctx) => {
    return await ctx.db.insert("sessions", {
      userId,
      title: "Test Session",
      status: "stopped",
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  await t.run(async (ctx) => {
    await ctx.db.insert("instances", {
      sessionId,
      driver: "docker",
      state: "terminated",
      endpointInternal: "http://localhost:3000",
      registeredAt: Date.now(),
      terminatedAt: Date.now(),
    });
  });

  // Act: Call resume action
  // @ts-expect-error temporary until convex codegen exposes sessions.resume in generated api
  const result = await t.action(
    (api as unknown as { sessions: { resume: unknown } }).sessions
      .resume as unknown,
    {
      id: sessionId as Id<"sessions">,
    }
  );

  // Assert: Verify response shape
  expect(result).toEqual({
    success: false,
    instanceId: undefined,
    error: expect.any(String),
  });
});

test("sessions.resume - throws error for missing session", async () => {
  const t = await createConvexTest(schema);

  // Act & Assert: Missing session should throw
  // @ts-expect-error temporary until convex codegen exposes sessions.resume in generated api
  await expect(
    t.action(
      (api as unknown as { sessions: { resume: unknown } }).sessions
        .resume as unknown,
      {
        id: "missing_session_id" as Id<"sessions">,
      }
    )
  ).rejects.toThrow();
});

test("sessions.resume - returns success false for error state", async () => {
  const t = await createConvexTest(schema);

  // Arrange: Create a user and session with error instance
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      email: "test@example.com" as Email,
      name: "Test User",
      createdAt: Date.now(),
    });
  });

  const sessionId = await t.run(async (ctx) => {
    return await ctx.db.insert("sessions", {
      userId,
      title: "Test Session",
      status: "error",
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  await t.run(async (ctx) => {
    await ctx.db.insert("instances", {
      sessionId,
      driver: "docker",
      state: "error",
      endpointInternal: "http://localhost:3000",
      registeredAt: Date.now(),
    });
  });

  // Act: Call resume action
  // @ts-expect-error temporary until convex codegen exposes sessions.resume in generated api
  const result = await t.action(
    (api as unknown as { sessions: { resume: unknown } }).sessions
      .resume as unknown,
    {
      id: sessionId as Id<"sessions">,
    }
  );

  // Assert: Verify response shape
  expect(result).toEqual({
    success: false,
    instanceId: undefined,
    error: expect.any(String),
  });
});
