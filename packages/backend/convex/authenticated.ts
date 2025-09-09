import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import type { Auth } from "convex/server";
import type { GenericId } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";

export const TOKEN_SUB_CLAIM_DIVIDER = "|";
/**
 * Return the currently signed-in user's ID.
 *
 * @param ctx query, mutation or action `ctx`
 * @returns the user ID or `null` if the client isn't authenticated
 */
export async function getAuthUserId(ctx: { auth: Auth }) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    return null;
  }
  const [userId] = identity.subject.split(TOKEN_SUB_CLAIM_DIVIDER);
  return userId as GenericId<"users">;
}

export const authenticatedQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    return { user, userId };
  })
);

export const authenticatedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    return { user, userId };
  })
);

export const authenticatedInternalAction = customAction(
  action,
  customCtx(async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    return { userId };
  })
);

export const authenticatedInternalMutation = customMutation(
  internalMutation,
  customCtx(async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    return { userId };
  })
);
