/**
 * Sidecar API Contract Definitions
 *
 * The sidecar is a thin wrapper around the OpenCode SDK server that:
 * 1. Manages secure registration with the orchestrator
 * 2. Starts and manages the OpenCode server using the SDK
 * 3. Handles secure key provisioning
 * 4. Bridges events between OpenCode and orchestrator
 * 5. Provides terminal access via WebSocket
 *
 * Most API calls are proxied directly to the OpenCode server running internally.
 */

import type {
  Agent,
  Config,
  Event,
  Message,
  Part,
  Provider,
  Session,
} from "@opencode-ai/sdk";

// ============================================================================
// SIDECAR INTERNAL ENDPOINTS (Not proxied to OpenCode)
// ============================================================================

export const sidecarInternalEndpoints = {
  /**
   * Registration endpoint - called once during sidecar startup
   * Establishes secure communication channel with orchestrator
   */
  "/internal/register": {
    method: "POST" as const,
    request: {
      sessionId: string,           // Convex session ID (must match OpenCode session ID)
      registrationToken: string,    // One-time token from orchestrator
      publicKey: string,           // P-256 public key for envelope encryption
      keyId: string,               // URL-safe base64 key identifier for the sidecar
    },
    response: {
      success: boolean,
      sidecarAuthToken: string,     // Bearer token for subsequent requests
      orchestratorPublicKey: string, // For encrypting responses
      orchestratorKeyId: string,     // Key identifier for orchestrator public key
      opencodePort: number,          // Port to bind OpenCode server to
      encryptedProviderKeys: {
        ciphertext: string,
        nonce: string,
        tag: string,
        recipientKeyId: string,
      },
    },
  },

  /**
   * Health check endpoint
   */
  "/internal/health": {
    method: "GET" as const,
    response: {
      status: "healthy" | "unhealthy",
      opencodeServerRunning: boolean,
      opencodeServerUrl: string | null,
      uptime: number,
      version: string,
    },
  },

  /**
   * Readiness probe - confirms OpenCode server is ready
   */
  "/internal/ready": {
    method: "GET" as const,
    response: {
      ready: boolean,
      opencodeUrl: string,  // Internal URL of OpenCode server
      sessionId: string,     // Confirmed session ID
    },
  },

  /**
   * Update provider keys (for rotation)
   */
  "/internal/update-keys": {
    method: "PUT" as const,
    headers: {
      Authorization: "Bearer {sidecarAuthToken}",
    },
    request: {
      encryptedProviderKeys: Array<{
        provider: string,
        encryptedKey: string,
        nonce: string,
      }>,
    },
    response: {
      updated: boolean,
      providers: string[], // List of updated providers
    },
  },

  /**
   * Graceful shutdown
   */
  "/internal/shutdown": {
    method: "POST" as const,
    headers: {
      Authorization: "Bearer {sidecarAuthToken}",
    },
    request: {
      gracePeriodMs?: number, // Time to wait before force kill (default 5000)
    },
    response: {
      shuttingDown: boolean,
    },
  },
};

// ============================================================================
// OPENCODE PROXY ENDPOINTS
// ============================================================================

/**
 * These endpoints proxy directly to the OpenCode server running inside the sidecar.
 * The sidecar adds authentication and monitoring but doesn't modify the API.
 *
 * The OpenCode server is started using:
 * ```typescript
 * import { createOpencodeServer } from "@opencode-ai/sdk";
 * const server = await createOpencodeServer({
 *   hostname: "0.0.0.0",  // Bind to all interfaces inside container
 *   port: opencodePort,    // Port assigned by orchestrator
 *   config: {
 *     // Configuration merged from orchestrator
 *   }
 * });
 * ```
 */
export const opencodeProxyEndpoints = {
  // Session Management - Proxied to OpenCode
  "/session": {
    GET: "List all sessions",
    POST: "Create new session",
  },
  "/session/{id}": {
    GET: "Get session details",
    PATCH: "Update session",
    DELETE: "Delete session",
  },
  "/session/{id}/message": {
    GET: "List messages in session",
    POST: "Send prompt message (main interaction endpoint)",
  },
  "/session/{id}/command": {
    POST: "Execute slash command",
  },
  "/session/{id}/shell": {
    POST: "Run shell command",
  },
  "/session/{id}/permissions/{permissionId}": {
    POST: "Respond to permission request",
  },
  "/session/{id}/abort": {
    POST: "Abort running session",
  },

  // Configuration
  "/config": {
    GET: "Get configuration",
  },
  "/config/providers": {
    GET: "List available providers and models",
  },

  // File Operations
  "/find": {
    GET: "Search text in files",
  },
  "/find/file": {
    GET: "Find files by name",
  },
  "/file": {
    GET: "Read file content",
  },

  // Agents
  "/agent": {
    GET: "List available agents",
  },

  // Authentication - Special handling
  "/auth/{providerId}": {
    PUT: "Set provider credentials (injected by sidecar)",
  },
};

// ============================================================================
// EVENT STREAM
// ============================================================================

/**
 * The sidecar subscribes to the OpenCode server's event stream and forwards
 * events to the orchestrator. It also adds sidecar-specific events.
 */
export const eventStream = {
  /**
   * SSE endpoint that bridges OpenCode events to orchestrator
   * The sidecar connects to OpenCode's `/event` endpoint and forwards events
   */
  "/events": {
    method: "GET" as const,
    headers: {
      Authorization: "Bearer {sidecarAuthToken}",
    },
    protocol: "text/event-stream" as const,
    
    // Events forwarded from OpenCode server
    opencodeEvents: {
      "server.connected": {
        description: "OpenCode server connected",
        data: { sessionId: string, version: string },
      },
      "message.updated": {
        description: "Message content updated",
        data: { messageId: string, parts: Part[] },
      },
      "message.part.updated": {
        description: "Message part updated",
        data: { messageId: string, partId: string, content: any },
      },
      "permission.updated": {
        description: "New permission request",
        data: { permissionId: string, type: string, details: any },
      },
      "permission.replied": {
        description: "Permission response received",
        data: { permissionId: string, granted: boolean },
      },
      "session.updated": {
        description: "Session state changed",
        data: { sessionId: string, status: string },
      },
      "session.idle": {
        description: "Session became idle",
        data: { sessionId: string },
      },
      "file.edited": {
        description: "File was edited",
        data: { path: string, action: string },
      },
    },
    
    // Sidecar-specific events
    sidecarEvents: {
      "sidecar.ready": {
        description: "Sidecar fully initialized",
        data: { opencodeUrl: string },
      },
      "sidecar.error": {
        description: "Sidecar error occurred",
        data: { error: string, fatal: boolean },
      },
      "sidecar.keys.updated": {
        description: "Provider keys were updated",
        data: { providers: string[] },
      },
    },
  },
};

// ============================================================================
// TERMINAL WEBSOCKET
// ============================================================================

export const terminalWebSocket = {
  /**
   * WebSocket endpoint for terminal access
   * This is NOT part of OpenCode - it's a sidecar feature
   */
  "/terminal": {
    protocol: "ws" as const,
    authentication: {
      method: "query" as const,
      param: "token", // One-time token from orchestrator
    },

    // Client → Server messages
    clientMessages: {
      stdin: {
        type: "stdin",
        data: string, // Terminal input
      },
      resize: {
        type: "resize",
        cols: number,
        rows: number,
      },
    },

    // Server → Client messages
    serverMessages: {
      stdout: {
        type: "stdout",
        data: string, // Terminal output
      },
      stderr: {
        type: "stderr",
        data: string, // Error output
      },
      exit: {
        type: "exit",
        code: number,
      },
    },
  },
};

// ============================================================================
// SIDECAR IMPLEMENTATION NOTES
// ============================================================================

export const implementation = {
  /**
   * Sidecar startup sequence:
   * 1. Generate ephemeral X25519 keypair
   * 2. Register with orchestrator via /internal/register
   * 3. Decrypt provider keys using private key
   * 4. Start OpenCode server using SDK:
   *    ```typescript
   *    const server = await createOpencodeServer({
   *      hostname: "0.0.0.0",
   *      port: opencodePort,
   *      config: {
   *        // Model configuration from orchestrator
   *      }
   *    });
   *    ```
   * 5. Set provider credentials via OpenCode's /auth/:id endpoint
   * 6. Create or verify session matches orchestrator session ID
   * 7. Subscribe to OpenCode's /event stream
   * 8. Report ready via /internal/ready
   * 9. Start forwarding events to orchestrator
   */
  startup: "See sequence above",

  /**
   * Request handling:
   * - /internal/* endpoints: Handled directly by sidecar
   * - /terminal: WebSocket handled by sidecar
   * - /events: SSE bridge from OpenCode to orchestrator
   * - All other endpoints: Proxy to OpenCode server with auth check
   */
  requestRouting: "See routing rules above",

  /**
   * Security:
   * - All requests except /internal/register require sidecarAuthToken
   * - Provider keys are never written to disk or logs
   * - Keys are injected to OpenCode then zeroed from memory
   * - Terminal runs as non-root user with limited capabilities
   */
  security: "See security notes above",

  /**
   * Error handling:
   * - OpenCode server failures trigger sidecar.error events
   * - Network failures use exponential backoff for reconnection
   * - Fatal errors trigger graceful shutdown
   */
  errorHandling: "See error handling notes above",
};

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type SidecarInternalEndpoints = typeof sidecarInternalEndpoints;
export type OpencodeProxyEndpoints = typeof opencodeProxyEndpoints;
export type EventStream = typeof eventStream;
export type TerminalWebSocket = typeof terminalWebSocket;

// Re-export OpenCode types that are used
export type { Session, Message, Part, Provider, Config, Agent, Event };
