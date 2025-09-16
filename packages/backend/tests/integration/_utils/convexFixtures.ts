import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Email } from "../../../convex/schema";

export type CreatedUser = {
  userId: Id<"users">;
};

export type CreatedSession = {
  sessionId: Id<"sessions">;
  registrationToken: string;
};

export async function createUser<Schema extends GenericSchema>(
  t: TestConvex<SchemaDefinition<Schema, boolean>>,
  name: string,
  email?: Email
): Promise<CreatedUser> {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      email: email ?? ("test@example.com" as Email),
      name,
      createdAt: Date.now(),
    });
  });
  return { userId };
}

export async function createSessionForUser<Schema extends GenericSchema>(
  t: TestConvex<SchemaDefinition<Schema, boolean>>,
  userId: Id<"users">,
  title = "Test Session"
): Promise<CreatedSession> {
  const { sessionId, registrationToken } = await t
    .withIdentity({ subject: userId, name: "Test User" })
    .mutation(api.sessions.createSession, { title });
  return { sessionId, registrationToken } as CreatedSession;
}

export async function upsertProviderKeyForUser<Schema extends GenericSchema>(
  t: TestConvex<SchemaDefinition<Schema, boolean>>,
  userId: Id<"users">,
  provider: string,
  key: string
): Promise<void> {
  await t
    .withIdentity({ subject: userId, name: "Test User" })
    .mutation(api.providerKeys.upsertProviderKey, { provider, key });
}
