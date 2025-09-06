import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { CryptoError } from "../lib/crypto";
import { 
  KeyExchange, 
  SecureProviderKeyDelivery,
  type SealedPayload 
} from "../lib/keyExchange";
import {
  SecurityAuditLogger,
  keyProvisioningRateLimit,
  createSecureOperation,
  SecureBuffer
} from "../lib/security";

export interface SidecarRegistration {
  sessionId: string;
  publicKey: string;
  keyId: string;
  timestamp: number;
}

export interface ProvisioningResult {
  success: boolean;
  sealedKeys?: SealedPayload;
  sidecarToken?: string;
  error?: string;
  providersCount?: number;
}

export const registerSidecar = action({
  args: {
    sessionId: v.string(),
    registrationToken: v.string(),
    sidecarPublicKey: v.string(),
    sidecarKeyId: v.string(),
  },
  handler: async (ctx, args): Promise<ProvisioningResult> => {
    const rateLimit = keyProvisioningRateLimit.checkLimit(args.sessionId);
    if (!rateLimit.allowed) {
      SecurityAuditLogger.log({
        operation: 'register_sidecar',
        sessionId: args.sessionId,
        success: false,
        error: 'Rate limit exceeded',
      });
      return {
        success: false,
        error: "Rate limit exceeded for key provisioning operations",
      };
    }

    const operation = createSecureOperation();
    
    try {
      if (!KeyExchange.validatePublicKey(args.sidecarPublicKey)) {
        SecurityAuditLogger.log({
          operation: 'register_sidecar',
          sessionId: args.sessionId,
          success: false,
          error: 'Invalid sidecar public key format',
        });
        return {
          success: false,
          error: "Invalid sidecar public key format",
        };
      }

      if (!KeyExchange.validateKeyId(args.sidecarKeyId)) {
        SecurityAuditLogger.log({
          operation: 'register_sidecar',
          sessionId: args.sessionId,
          success: false,
          error: 'Invalid sidecar key ID format',
        });
        return {
          success: false,
          error: "Invalid sidecar key ID format",
        };
      }

      const session = await ctx.runQuery(api.sessions.getByIdWithToken, {
        id: args.sessionId as any,
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

      const userProviderKeys = await ctx.runQuery(api.providerKeys.listUserProviderKeys, {});
      
      if (userProviderKeys.length === 0) {
        return {
          success: false,
          error: "No provider keys configured for user",
        };
      }

      const decryptedKeys = new Map<string, string>();
      let failedKeys = 0;

      for (const keyInfo of userProviderKeys) {
        try {
          const decryptedKey = await ctx.runAction(api.providerKeys.getProviderKey, {
            userId: session.userId,
            provider: keyInfo.provider,
          });

          if (decryptedKey) {
            decryptedKeys.set(keyInfo.provider, decryptedKey);
          } else {
            failedKeys++;
          }
        } catch (error) {
          console.error(`Failed to decrypt key for provider ${keyInfo.provider}:`, error);
          failedKeys++;
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

      const sidecarToken = await generateSidecarToken(args.sessionId, args.sidecarKeyId);

      await ctx.runMutation(api.sessions.updateSidecarRegistration, {
        sessionId: args.sessionId as any,
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
      const errorMessage = error instanceof CryptoError ? error.message : "Unknown provisioning error";
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});

export const refreshProviderKeys = action({
  args: {
    sessionId: v.string(),
    sidecarToken: v.string(),
    providers: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<ProvisioningResult> => {
    try {
      const isValidToken = await validateSidecarToken(args.sidecarToken, args.sessionId);
      if (!isValidToken) {
        return {
          success: false,
          error: "Invalid sidecar token",
        };
      }

      const session = await ctx.runQuery(api.sessions.getById, {
        id: args.sessionId as any,
      });

      if (!session || !session.sidecarKeyId || !session.sidecarPublicKey || !session.orchestratorPrivateKey) {
        return {
          success: false,
          error: "Session not properly registered or missing key exchange data",
        };
      }

      const providersToRefresh = args.providers || [];
      const userKeys = await ctx.runQuery(api.providerKeys.listUserProviderKeys, {});
      
      const relevantKeys = args.providers 
        ? userKeys.filter(key => providersToRefresh.includes(key.provider))
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
          const decryptedKey = await ctx.runAction(api.providerKeys.getProviderKey, {
            userId: session.userId,
            provider: keyInfo.provider,
          });

          if (decryptedKey) {
            decryptedKeys.set(keyInfo.provider, decryptedKey);
          }
        } catch (error) {
          console.error(`Failed to decrypt key for provider ${keyInfo.provider}:`, error);
        }
      }

      if (decryptedKeys.size === 0) {
        return {
          success: false,
          error: "Failed to decrypt any requested provider keys",
        };
      }

      const sealedKeys = await SecureProviderKeyDelivery.packageProviderKeys(
        decryptedKeys,
        session.sidecarPublicKey,
        session.orchestratorPrivateKey,
        session.sidecarKeyId
      );

      return {
        success: true,
        sealedKeys,
        providersCount: decryptedKeys.size,
      };

    } catch (error) {
      const errorMessage = error instanceof CryptoError ? error.message : "Unknown refresh error";
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});

async function generateSidecarToken(sessionId: string, sidecarKeyId: string): Promise<string> {
  const payload = {
    sessionId,
    sidecarKeyId,
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
  };

  return btoa(JSON.stringify(payload));
}

async function validateSidecarToken(token: string, sessionId: string): Promise<boolean> {
  try {
    const payload = JSON.parse(atob(token));
    
    if (payload.sessionId !== sessionId) {
      return false;
    }

    const age = Date.now() - payload.timestamp;
    const MAX_TOKEN_AGE = 24 * 60 * 60 * 1000; // 24 hours
    
    return age < MAX_TOKEN_AGE;
  } catch {
    return false;
  }
}