import { v } from "convex/values";
import { authenticatedMutation } from "../lib/auth";

export const updateProfile = authenticatedMutation({
  args: {
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updateData: { name?: string; image?: string } = {};

    if (args.name !== undefined) {
      updateData.name = args.name;
    }

    if (args.image !== undefined) {
      updateData.image = args.image;
    }

    await ctx.db.patch(ctx.userId, updateData);

    return ctx.db.get(ctx.userId);
  },
});
