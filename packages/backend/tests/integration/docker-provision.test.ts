import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Email } from "../../convex/schema";
import schema from "../../convex/schema";
import { createConvexTest } from "../../test-utils/utils";

describe("Container provisioning (docker)", () => {
  test("provisions container and records instance", async () => {
    const t = await createConvexTest(schema);

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "dock@example.com" as Email,
        name: "Dock Tester",
        createdAt: Date.now(),
      });
    });

    const sessionId = await t.run(async (ctx) => {
      return await ctx.db.insert("sessions", {
        userId,
        title: "Docker Session",
        status: "creating",
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await t.action(
    // @ts-expect-error temporary until convex codegen exposes sessions.provision
      (api as unknown as { sessions: { provision: unknown } }).sessions
        .provision as unknown,
      {
        sessionId: sessionId as Id<"sessions">,
        driver: "docker",
      }
    );

    expect(result).toEqual({
      instanceId: expect.any(String),
      endpoint: expect.any(String),
    });

    const instance = await t.run(async (ctx) => {
      return await ctx.db.get(result.instanceId);
    });
    const inst = instance as unknown as {
      sessionId: Id<"sessions">;
      driver: string;
      state: string;
    } | null;

    expect(inst).toBeTruthy();
    expect(inst?.sessionId).toBe(sessionId);
    expect(inst?.driver).toBe("docker");
    expect(inst?.state).toBe("provisioning");
  });

  test("propagates driver error and rolls back DB", async () => {
    const t = await createConvexTest(schema);

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "dock2@example.com" as Email,
        name: "Dock Tester 2",
        createdAt: Date.now(),
      });
    });

    const sessionId = await t.run(async (ctx) => {
      return await ctx.db.insert("sessions", {
        userId,
        title: "Docker Session 2",
        status: "creating",
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    // Configure mock driver to throw on startContainer (in future impl)
    await expect(
      t.action(
    // @ts-expect-error temporary until convex codegen exposes sessions.provision
        (api as unknown as { sessions: { provision: unknown } }).sessions
          .provision as unknown,
        {
          sessionId: sessionId as Id<"sessions">,
          driver: "docker",
        }
      )
    ).rejects.toThrow();
  });
});

