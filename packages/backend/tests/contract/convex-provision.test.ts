import { expect, test } from "vitest";
import { createConvexTest } from "../../test-utils/utils";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import type { FunctionReference } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import type { Email } from "../../convex/schema";

test("sessions.provision - creates instance and returns endpoint", async () => {
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
      status: "creating",
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  // Act: Call the provision action
  // @ts-expect-error temporary until convex codegen exposes sessions.provision in generated api
  const result = await t.action(
    (api as unknown as { sessions: { provision: unknown } }).sessions
      .provision as unknown,
    {
      sessionId: sessionId as Id<"sessions">,
      driver: "docker",
    }
  );

  // Assert: Verify the response shape
  expect(result).toEqual({
    instanceId: expect.any(String),
    endpoint: expect.any(String),
  });

  // Assert: Verify instance was created in database
  const instance = await t.run(async (ctx) => {
    return await ctx.db.get(result.instanceId);
  });

  const inst = instance as unknown as {
    sessionId: Id<"sessions">;
    driver: string;
    state: string;
  } | null;

  expect(inst).toBeDefined();
  expect(inst?.sessionId).toBe(sessionId);
  expect(inst?.driver).toBe("docker");
  expect(inst?.state).toBe("provisioning");
});

test("sessions.provision - throws error for invalid driver", async () => {
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
      status: "creating",
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  // Act & Assert: Invalid driver should throw
  // @ts-expect-error temporary until convex codegen exposes sessions.provision in generated api
  await expect(
    t.action(
      (api as unknown as { sessions: { provision: unknown } }).sessions
        .provision as unknown,
      {
        sessionId: sessionId as Id<"sessions">,
        driver: "invalid" as any,
      }
    )
  ).rejects.toThrow();
});

test("sessions.provision - throws error for missing session", async () => {
  const t = await createConvexTest(schema);

  // Act & Assert: Missing session should throw
  // @ts-expect-error temporary until convex codegen exposes sessions.provision in generated api
  await expect(
    t.action(
      (api as unknown as { sessions: { provision: unknown } }).sessions
        .provision as unknown,
      {
        sessionId: "missing_session_id" as Id<"sessions">,
        driver: "docker",
      }
    )
  ).rejects.toThrow();
});

test("sessions.provision - works with local driver", async () => {
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
      status: "creating",
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  // Act: Call the provision action with local driver
  // @ts-expect-error temporary until convex codegen exposes sessions.provision in generated api
  const result = await t.action(
    (api as unknown as { sessions: { provision: unknown } }).sessions
      .provision as unknown,
    {
      sessionId: sessionId as Id<"sessions">,
      driver: "local",
    }
  );

  // Assert: Verify the response shape
  expect(result).toEqual({
    instanceId: expect.any(String),
    endpoint: expect.any(String),
  });

  // Assert: Verify instance was created with correct driver
  const instance = await t.run(async (ctx) => {
    return await ctx.db.get(result.instanceId);
  });

  const inst2 = instance as unknown as {
    sessionId: Id<"sessions">;
    driver: string;
  } | null;

  expect(inst2).toBeDefined();
  expect(inst2?.sessionId).toBe(sessionId);
  expect(inst2?.driver).toBe("local");
});
