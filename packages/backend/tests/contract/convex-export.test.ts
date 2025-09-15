import { expect, test } from "vitest";
import { createConvexTest } from "../../test-utils/utils";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import type { FunctionReference } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import type { Email } from "../../convex/schema";

test("export.zip - returns download URL with expiration", async () => {
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

  // Act: Call export.zip action
  // @ts-expect-error temporary until convex codegen exposes export.zip in generated api
  const result = await t.action(
    ((api as unknown as { export: { zip: unknown } }).export.zip as unknown),
    {
      id: sessionId as Id<"sessions">,
    }
  );

  // Assert: Verify response shape
  expect(result).toEqual({
    downloadUrl: expect.any(String),
    size: expect.any(Number),
    expiresAt: expect.any(Number),
  });

  // Assert: Verify expiresAt is in the future
  expect(result.expiresAt).toBeGreaterThan(Date.now());

  // Assert: Verify session artifact was created
  const artifact = await t.run(async (ctx) => {
    return await ctx.db
      .query("sessionArtifacts")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("type"), "zip"))
      .first();
  });

  expect(artifact).toBeDefined();
  expect(artifact?.sessionId).toBe(sessionId);
  expect(artifact?.type).toBe("zip");
  expect(artifact?.urlOrPath).toBe(result.downloadUrl);
});

test("export.zip - works for empty session (size 0)", async () => {
  const t = await createConvexTest(schema);

  // Arrange: Create a user and empty session
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
      title: "Empty Session",
      status: "idle",
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  // Act: Call export.zip action
  // @ts-expect-error temporary until convex codegen exposes export.zip in generated api
  const result = await t.action(
    ((api as unknown as { export: { zip: unknown } }).export.zip as unknown),
    {
      id: sessionId as Id<"sessions">,
    }
  );

  // Assert: Verify response shape
  expect(result).toEqual({
    downloadUrl: expect.any(String),
    size: expect.any(Number),
    expiresAt: expect.any(Number),
  });

  // Assert: Size can be 0 for empty sessions
  expect(result.size).toBeGreaterThanOrEqual(0);

  // Assert: Verify expiresAt is in the future
  expect(result.expiresAt).toBeGreaterThan(Date.now());

  // Assert: Verify session artifact was created
  const artifact = await t.run(async (ctx) => {
    return await ctx.db
      .query("sessionArtifacts")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("type"), "zip"))
      .first();
  });

  expect(artifact).toBeDefined();
  expect(artifact?.sessionId).toBe(sessionId);
  expect(artifact?.type).toBe("zip");
});

test("export.zip - throws error for missing session", async () => {
  const t = await createConvexTest(schema);

  // Act & Assert: Missing session should throw
  // @ts-expect-error temporary until convex codegen exposes export.zip in generated api
  await expect(
    t.action(
      ((api as unknown as { export: { zip: unknown } }).export
        .zip as unknown),
      {
        id: "missing_session_id" as Id<"sessions">,
      }
    )
  ).rejects.toThrow();
});

test("export.zip - creates unique artifacts for multiple exports", async () => {
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

  // Act: Call export.zip action twice
  // @ts-expect-error temporary until convex codegen exposes export.zip in generated api
  const result1 = await t.action(
    ((api as unknown as { export: { zip: unknown } }).export.zip as unknown),
    {
      id: sessionId as Id<"sessions">,
    }
  );

  // @ts-expect-error temporary until convex codegen exposes export.zip in generated api
  const result2 = await t.action(
    ((api as unknown as { export: { zip: unknown } }).export.zip as unknown),
    {
      id: sessionId as Id<"sessions">,
    }
  );

  // Assert: Verify each export has unique URL and expiration
  expect(result1.downloadUrl).not.toBe(result2.downloadUrl);
  expect(result1.expiresAt).not.toBe(result2.expiresAt);

  // Assert: Verify both artifacts were created
  const artifacts = await t.run(async (ctx) => {
    return await ctx.db
      .query("sessionArtifacts")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("type"), "zip"))
      .collect();
  });

  expect(artifacts).toHaveLength(2);
  expect(artifacts[0]?.urlOrPath).toBe(result1.downloadUrl);
  expect(artifacts[1]?.urlOrPath).toBe(result2.downloadUrl);
});

test("export.zip - expiration time is reasonable", async () => {
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

  // Act: Call export.zip action
  // @ts-expect-error temporary until convex codegen exposes export.zip in generated api
  const result = await t.action(
    ((api as unknown as { export: { zip: unknown } }).export.zip as unknown),
    {
      id: sessionId as Id<"sessions">,
    }
  );

  // Assert: Verify expiration is reasonable (e.g., within 1 hour to 1 week)
  const oneHourFromNow = Date.now() + 60 * 60 * 1000;
  const oneWeekFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;

  expect(result.expiresAt).toBeGreaterThan(oneHourFromNow);
  expect(result.expiresAt).toBeLessThan(oneWeekFromNow);
});
