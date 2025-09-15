import { v } from "convex/values";
import { action } from "./_generated/server";

// Stub action for `export.zip` to allow tests to compile and run RED until implemented.
export const zip = action({
  args: { id: v.id("sessions") },
  returns: v.object({
    downloadUrl: v.string(),
    size: v.number(),
    expiresAt: v.number(),
  }),
  handler: () => {
    throw new Error("export.zip not implemented");
  },
});
