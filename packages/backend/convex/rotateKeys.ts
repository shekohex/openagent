import { v } from "convex/values";
import { internal } from "./_generated/api";
import { authenticatedInternalMutation } from "./lib/auth";
import { getDefaultEnvelopeEncryption } from "./lib/envelope";

export const rotateProviderKey = authenticatedInternalMutation({
  args: {
    provider: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    provider: v.string(),
    newVersion: v.number(),
  }),
  handler: async (ctx, args) => {
    const envelope = getDefaultEnvelopeEncryption();

    // Get the current encrypted key
    const currentKey = await ctx.runQuery(
      internal.providerKeys.getEncryptedProviderKey,
      {
        userId: ctx.userId,
        provider: args.provider.trim().toLowerCase(),
      }
    );

    if (!currentKey) {
      throw new Error(`No key found for provider: ${args.provider}`);
    }

    // Rotate the key (re-encrypt with new data key)
    const rotatedKey = await envelope.rotateKey(currentKey);

    // Update the stored key
    await ctx.runMutation(internal.providerKeys.updateProviderKeyData, {
      userId: ctx.userId,
      provider: args.provider.trim().toLowerCase(),
      encryptedKey: rotatedKey.encryptedKey,
      encryptedDataKey: rotatedKey.encryptedDataKey,
      keyVersion: rotatedKey.keyVersion,
      nonce: rotatedKey.nonce,
      tag: rotatedKey.tag,
      dataKeyNonce: rotatedKey.dataKeyNonce,
      dataKeyTag: rotatedKey.dataKeyTag,
      masterKeyId: rotatedKey.masterKeyId,
    });

    return {
      success: true,
      provider: args.provider,
      newVersion: rotatedKey.keyVersion,
    };
  },
});
