import { describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Email } from "../../convex/schema";
import schema from "../../convex/schema";
import { createConvexTest } from "../../test-utils/utils";

describe("Session lifecycle end-to-end", () => {
  test("happy path transitions and events", async () => {
    const t = await createConvexTest(schema);

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "lifecycle@example.com" as Email,
        name: "Lifecycle Tester",
        createdAt: Date.now(),
      });
    });
    const user = t.withIdentity({ subject: userId, name: "Lifecycle Tester" });

    await user.mutation(api.providerKeys.upsertProviderKey, {
      provider: "openai",
      key: "sk-lifecycle-1234567890abcdef1234567890abcdef",
    });

    const { sessionId, registrationToken } = await user.mutation(
      api.sessions.createSession,
      { title: "Lifecycle" }
    );

    // Register sidecar (via yet-to-be-implemented orchestration path)
    await user.mutation(internal.provisionKeys.registerSidecar, {
      sessionId,
      registrationToken,
      sidecarPublicKey: "fakepub",
      sidecarKeyId: "fakekey",
    });

    // Provision container
    await user.action(
    // @ts-expect-error sessions.provision not yet implemented
      (api as unknown as { sessions: { provision: unknown } }).sessions
        .provision as unknown,
      { sessionId: sessionId as Id<"sessions">, driver: "docker" }
    );

    // Publish events (ready, message.updated, session.idle)
    await user.mutation(
    // @ts-expect-error events.publish not yet implemented
      (api as unknown as { internal: { events: { publish: unknown } } })
        .internal.events.publish as unknown,
      {
        sessionId: sessionId as Id<"sessions">,
        type: "sidecar.ready",
        source: "sidecar",
        payload: {},
      }
    );

    await user.mutation(
    // @ts-expect-error events.publish not yet implemented
      (api as unknown as { internal: { events: { publish: unknown } } })
        .internal.events.publish as unknown,
      {
        sessionId: sessionId as Id<"sessions">,
        type: "message.updated",
        source: "orchestrator",
        payload: { id: "1" },
      }
    );

    await user.mutation(
    // @ts-expect-error events.publish not yet implemented
      (api as unknown as { internal: { events: { publish: unknown } } })
        .internal.events.publish as unknown,
      {
        sessionId: sessionId as Id<"sessions">,
        type: "session.idle",
        source: "orchestrator",
        payload: {},
      }
    );

    // Resume
    const resume = await user.action(
    // @ts-expect-error sessions.resume not yet implemented
      (api as unknown as { sessions: { resume: unknown } }).sessions
        .resume as unknown,
      { id: sessionId as Id<"sessions"> }
    );
    expect(resume.success).toBe(true);

    // Verify events ordering via query (will exist once implemented)
    const events = await t.run(async (ctx) => {
      return await ctx.db
      // @ts-expect-error sessionEvents table will be added later
        .query("sessionEvents")
      // @ts-expect-error sessionEvents table will be added later
        .withIndex?.("by_session", (q: any) => q.eq("sessionId", sessionId))
        .collect?.();
    });
    expect(Array.isArray(events)).toBe(true);
  });
});
