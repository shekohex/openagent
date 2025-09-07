import { v } from "convex/values";
import { action } from "./_generated/server";

export const getKnownProviders = action({
  args: {},
  returns: v.array(v.string()),
  handler: async (): Promise<string[]> => {
    try {
      const response = await fetch("https://models.dev/api.json");
      if (!response.ok) {
        throw new Error("Failed to fetch providers");
      }

      const data = await response.json();
      return Object.keys(data).sort();
    } catch {
      return [
        "openai",
        "anthropic",
        "google",
        "openrouter",
        "groq",
        "togetherai",
        "mistral",
      ];
    }
  },
});
