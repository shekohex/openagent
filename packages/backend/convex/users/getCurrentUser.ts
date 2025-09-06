import { authenticatedQuery } from "../lib/auth";

export const getCurrentUser = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.user;
  },
});