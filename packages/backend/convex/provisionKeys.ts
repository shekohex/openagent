import { v } from "convex/values";
import { CryptoError } from "../lib/crypto";
import {
  KeyExchange,
  type SealedPayload,
  SecureProviderKeyDelivery,
} from "../lib/keyExchange";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

const MILLISECONDS_PER_SECOND = 1000;
const MAX_TOKEN_AGE_MS = 24 * 60 * 60 * MILLISECONDS_PER_SECOND; // 24 hours

export type SidecarRegistration = {
  sessionId: string;
  publicKey: string;
  keyId: string;
  timestamp: number;
};

export type ProvisioningResult = {
  success: boolean;
  sealedKeys?: SealedPayload;
  sidecarToken?: string;
  error?: string;
  providersCount?: number;
};

export const registerSidecar = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    registrationToken: v.string(),
    sidecarPublicKey: v.string(),
    sidecarKeyId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    sealedKeys: v.optional(
      v.object({
        ciphertext: v.string(),
        nonce: v.string(),
        tag: v.string(),
        recipientKeyId: v.string(),
      })
    ),
    sidecarToken: v.optional(v.string()),
    error: v.optional(v.string()),
    providersCount: v.optional(v.number()),
  }),
  handler: async (ctx, args): Promise<ProvisioningResult> => {
    try {
      if (!KeyExchange.validatePublicKey(args.sidecarPublicKey)) {
        return {
          success: false,
          error: "Invalid sidecar public key format",
        };
      }

      if (!KeyExchange.validateKeyId(args.sidecarKeyId)) {
        return {
          success: false,
          error: "Invalid sidecar key ID format",
        };
      }

      const session = await ctx.runQuery(api.sessions.getByIdWithToken, {
        id: args.sessionId,
        token: args.registrationToken,
      });

      if (!session) {
        return {
          success: false,
          error: "Invalid session or registration token",
        };
      }

      if (session.status !== "creating") {
        return {
          success: false,
          error: `Session not in creating state, current state: ${session.status}`,
        };
      }

      const userProviderKeys = await ctx.runQuery(
        api.providerKeys.listUserProviderKeys,
        {}
      );

      if (userProviderKeys.length === 0) {
        return {
          success: false,
          error: "No provider keys configured for user",
        };
      }

      const decryptedKeys = new Map<string, string>();
      let _failedKeys = 0;

      // Get decrypted provider keys by calling the internal action
      for (const keyInfo of userProviderKeys) {
        try {
          const decryptedKey = await ctx.runMutation(
            internal.providerKeys.getProviderKey,
            {
              provider: keyInfo.provider,
            }
          );

          if (decryptedKey) {
            decryptedKeys.set(keyInfo.provider, decryptedKey);
          } else {
            _failedKeys++;
          }
        } catch (_error) {
          _failedKeys++;
        }
      }

      if (decryptedKeys.size === 0) {
        return {
          success: false,
          error: "Failed to decrypt any provider keys",
        };
      }

      const orchestratorKeys = await KeyExchange.generateEphemeralKeyPair();

      const sealedKeys = await SecureProviderKeyDelivery.packageProviderKeys(
        decryptedKeys,
        args.sidecarPublicKey,
        orchestratorKeys.privateKey,
        args.sidecarKeyId
      );

      const sidecarToken = generateSidecarToken(
        args.sessionId,
        args.sidecarKeyId
      );

      await ctx.runMutation(internal.sessions.updateSidecarRegistration, {
        sessionId: args.sessionId as Id<"sessions">,
        sidecarKeyId: args.sidecarKeyId,
        sidecarPublicKey: args.sidecarPublicKey,
        orchestratorPublicKey: orchestratorKeys.publicKey,
        orchestratorKeyId: orchestratorKeys.keyId,
        registeredAt: Date.now(),
      });

      return {
        success: true,
        sealedKeys,
        sidecarToken,
        providersCount: decryptedKeys.size,
      };
    } catch (error) {
      const errorMessage =
        error instanceof CryptoError
          ? error.message
          : "Unknown provisioning error";

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});

export const refreshProviderKeys = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    sidecarToken: v.string(),
    providers: v.optional(v.array(v.string())),
  },
  returns: v.object({
    success: v.boolean(),
    sealedKeys: v.optional(
      v.object({
        ciphertext: v.string(),
        nonce: v.string(),
        tag: v.string(),
        recipientKeyId: v.string(),
      })
    ),
    error: v.optional(v.string()),
    providersCount: v.optional(v.number()),
  }),
  handler: async (ctx, args): Promise<ProvisioningResult> => {
    try {
      const isValidToken = validateSidecarToken(
        args.sidecarToken,
        args.sessionId
      );
      if (!isValidToken) {
        return {
          success: false,
          error: "Invalid sidecar token",
        };
      }

      const session = await ctx.runQuery(internal.sessions.getById, {
        id: args.sessionId,
      });

      if (!(session?.sidecarKeyId && session.sidecarPublicKey)) {
        return {
          success: false,
          error: "Session not properly registered or missing key exchange data",
        };
      }

      const providersToRefresh = args.providers || [];
      const userKeys = await ctx.runQuery(
        api.providerKeys.listUserProviderKeys,
        {}
      );

      const relevantKeys = args.providers
        ? userKeys.filter((key) => providersToRefresh.includes(key.provider))
        : userKeys;

      if (relevantKeys.length === 0) {
        return {
          success: false,
          error: "No matching provider keys found",
        };
      }

      const decryptedKeys = new Map<string, string>();

      for (const keyInfo of relevantKeys) {
        try {
          const decryptedKey = await ctx.runMutation(
            internal.providerKeys.getProviderKey,
            {
              provider: keyInfo.provider,
            }
          );

          if (decryptedKey) {
            decryptedKeys.set(keyInfo.provider, decryptedKey);
          }
        } catch {
          // Silently skip keys that fail to decrypt - overall success is checked later
        }
      }

      if (decryptedKeys.size === 0) {
        return {
          success: false,
          error: "Failed to decrypt any requested provider keys",
        };
      }

      // Generate ephemeral keys for this refresh operation
      const orchestratorKeys = await KeyExchange.generateEphemeralKeyPair();

      const sealedKeys = await SecureProviderKeyDelivery.packageProviderKeys(
        decryptedKeys,
        session.sidecarPublicKey,
        orchestratorKeys.privateKey,
        session.sidecarKeyId
      );

      return {
        success: true,
        sealedKeys,
        providersCount: decryptedKeys.size,
      };
    } catch (error) {
      const errorMessage =
        error instanceof CryptoError ? error.message : "Unknown refresh error";

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});

function generateSidecarToken(sessionId: string, sidecarKeyId: string): string {
  const payload = {
    sessionId,
    sidecarKeyId,
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
  };

  return btoa(JSON.stringify(payload));
}

function validateSidecarToken(token: string, sessionId: string): boolean {
  try {
    const payload = JSON.parse(atob(token));

    if (payload.sessionId !== sessionId) {
      return false;
    }

    const age = Date.now() - payload.timestamp;

    return age < MAX_TOKEN_AGE_MS;
  } catch {
    return false;
  }
}
