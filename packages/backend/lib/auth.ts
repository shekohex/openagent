import { type BetterAuth, convexAdapter } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireEnv } from "@convex-dev/better-auth/utils";
import { betterAuth } from "better-auth";
import type { Id } from "../convex/_generated/dataModel";
import type { GenericCtx } from "../convex/_generated/server";
import { betterAuthComponent } from "../convex/auth";

const siteUrl = requireEnv("SITE_URL");

const convexAdapterWrapper = (
  ctx: GenericCtx,
  component: BetterAuth<Id<"users">>
  // biome-ignore lint/suspicious/noExplicitAny: it needs to be fixed upstream
) => convexAdapter(ctx as any, component as any);

export const createAuth = (ctx: GenericCtx) =>
  betterAuth({
    baseURL: siteUrl,
    database: convexAdapterWrapper(ctx, betterAuthComponent),
    account: {
      accountLinking: {
        enabled: true,
      },
    },
    // Simple non-verified email/password to get started
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    socialProviders: {
      github: {
        clientId: requireEnv("AUTH_GITHUB_ID"),
        clientSecret: requireEnv("AUTH_GITHUB_SECRET"),
      },
    },
    plugins: [
      // The Convex plugin is required
      convex(),
    ],
  });
