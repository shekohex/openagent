import { authenticatedQuery } from "../authenticated";

export const getCurrentUser = authenticatedQuery({
  args: {},
  handler: (ctx) => {
    return ctx.user;
  },
});
