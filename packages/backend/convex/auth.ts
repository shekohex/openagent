import {
  type AuthFunctions,
  BetterAuth,
  type PublicAuthFunctions,
} from "@convex-dev/better-auth";
import { api, components, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import type { Email } from "./schema";

// Initialize the component
export const betterAuthComponent: BetterAuth<Id<"users">> = new BetterAuth<
  Id<"users">
>(components.betterAuth, {
  // biome-ignore lint/suspicious/noExplicitAny: needs to be fixed upstream
  authFunctions: (internal as any).auth as AuthFunctions,
  // biome-ignore lint/suspicious/noExplicitAny: needs to be fixed upstream
  publicAuthFunctions: (api as any).auth as PublicAuthFunctions,
  verbose: false,
});

// These are required named exports
export const {
  createUser,
  updateUser,
  deleteUser,
  createSession,
  isAuthenticated,
} = betterAuthComponent.createAuthFunctions<DataModel>({
  // Must create a user and return the user id
  onCreateUser: (ctx, user) => {
    return ctx.db.insert("users", {
      email: user.email as Email,
      name: user.name,
      emailVerificationTime: user.emailVerified ? Date.now() : undefined,
      image: user.image === null ? undefined : user.image,
      createdAt: user.createdAt,
    });
  },

  // Delete the user when they are deleted from Better Auth
  onDeleteUser: async (ctx, userId) => {
    await ctx.db.delete(userId as Id<"users">);
  },
});

// Example function for getting the current user
// Feel free to edit, omit, etc.
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    // Get user data from Better Auth - email, name, image, etc.
    const userMetadata = await betterAuthComponent.getAuthUser(ctx);
    if (!userMetadata) {
      return null;
    }
    // Get user data from your application's database
    // (skip this if you have no fields in your users table schema)
    const user = await ctx.db.get(userMetadata.userId as Id<"users">);
    return {
      ...user,
      ...userMetadata,
    };
  },
});

// export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
//   providers: [
//     Password(),
//     GitHub({
//       profile(githubProfile, _tokens) {
//         return {
//           id: String(githubProfile.id),
//           name: githubProfile.name ?? githubProfile.login,
//           email: githubProfile.email,
//           image: githubProfile.avatar_url,
//           githubId: githubProfile.id,
//         };
//       },
//     }),
//   ],
// });
