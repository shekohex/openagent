import { authenticatedQuery } from "../lib/auth";

export const getCurrentUser = authenticatedQuery({
  args: {},
  handler: (ctx) => {
    return ctx.user;
  },
});
