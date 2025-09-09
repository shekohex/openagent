import { reactStartHelpers } from "@convex-dev/better-auth/react-start";
import { createAuth } from "@openagent/backend/lib/auth";

export const { fetchSession, reactStartHandler, getCookieName } =
  // biome-ignore lint/suspicious/noExplicitAny: needs to be fixed upstream
  reactStartHelpers(createAuth as any, {
    convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL,
  });
