import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Email } from "../../convex/schema";
import schema from "../../convex/schema";
import { createConvexTest } from "../../test-utils/utils";

test("internal.events.publish - stores session event with timestamp", async () => {
  const t = await createConvexTest(schema);

  // Arrange: create user and session
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      email: "events@example.com" as Email,
      name: "Events Tester",
      createdAt: Date.now(),
    });
  });

  const sessionId = await t.run(async (ctx) => {
    return await ctx.db.insert("sessions", {
      userId,
      title: "Event Session",
      status: "creating",
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  const payload = { status: "active" } as const;

  // Act: call not-yet-implemented mutation
  const result = await t.mutation(
    // @ts-expect-error temporary until convex codegen exposes internal.events.publish
    (api as unknown as { internal: { events: { publish: unknown } } }).internal
      .events.publish as unknown,
    {
      sessionId: sessionId as Id<"sessions">,
      type: "session.updated",
      source: "sidecar",
      payload,
    }
  );

  // Assert: response shape
  expect(result).toEqual({ success: true });

  // Assert: event persisted in sessionEvents with sane timestamp
  const events = await t.run(async (ctx) => {
    return await ctx.db
       // @ts-expect-error table will be added with implementation
      .query("sessionEvents")
      // @ts-expect-error table will be added with implementation
      .withIndex?.("by_session", (q: any) => q.eq("sessionId", sessionId))
      .collect?.();
  });

  expect(Array.isArray(events)).toBe(true);
  const event = (events as any[])[0];
  expect(event.sessionId).toBe(sessionId);
  expect(event.type).toBe("session.updated");
  expect(event.source).toBe("sidecar");
  expect(typeof event.timestamp).toBe("number");
  expect(Math.abs(event.timestamp - Date.now())).toBeLessThan(5_000);
});

test("internal.events.publish - validates input and rejects invalid event", async () => {
  const t = await createConvexTest(schema);

  // Arrange: no session exists
  const missingSessionId = "nonexistent" as unknown as Id<"sessions">;

  // Missing session
  await expect(
    t.mutation(
      // @ts-expect-error temporary until convex codegen exposes internal.events.publish
      (api as unknown as { internal: { events: { publish: unknown } } })
        .internal.events.publish as unknown,
      {
        sessionId: missingSessionId,
        type: "session.updated",
        source: "sidecar",
        payload: {},
      }
    )
  ).rejects.toThrow();

  // Unsupported event type
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      email: "events2@example.com" as Email,
      name: "Events Tester 2",
      createdAt: Date.now(),
    });
  });
  const sessionId = await t.run(async (ctx) => {
    return await ctx.db.insert("sessions", {
      userId,
      title: "Event Session 2",
      status: "creating",
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  await expect(
    t.mutation(
      // @ts-expect-error temporary until convex codegen exposes internal.events.publish
      (api as unknown as { internal: { events: { publish: unknown } } })
        .internal.events.publish as unknown,
      {
        sessionId: sessionId as Id<"sessions">,
        type: "unsupported.type",
        source: "sidecar",
        payload: {},
      }
    )
  ).rejects.toThrow();
});
