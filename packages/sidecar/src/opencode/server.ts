import {
  createOpencodeServer,
  type Config as OpencodeConfig,
} from "@opencode-ai/sdk";
import { logger } from "../logger";

const HEALTH_CHECK_THRESHOLD_SECONDS = 30;
const MILLISECONDS_PER_SECOND = 1000;
const REQUEST_TIMEOUT_MS = 5000;

export type EncryptedProviderKey = {
  provider: string;
  encryptedKey: string;
  nonce: string;
};

export type ServerConfig = {
  hostname: string;
  port: number;
  sessionId: string;
  providerKeys: EncryptedProviderKey[];
  orchestratorConfig?: Record<string, unknown>;
};

export type ServerState = {
  isRunning: boolean;
  url: string | null;
  sessionId: string | null;
  startTime: number | null;
  lastHealthCheck: number | null;
};

export class OpencodeServerManager {
  private readonly server: Awaited<
    ReturnType<typeof createOpencodeServer>
  > | null = null;
  private readonly state: ServerState = {
    isRunning: false,
    url: null,
    sessionId: null,
    startTime: null,
    lastHealthCheck: null,
  };

  async start(config: ServerConfig): Promise<string> {
    if (this.state.isRunning) {
      throw new Error("OpenCode server is already running");
    }

    try {
      // Build OpenCode configuration
      const opencodeConfig: OpencodeConfig = {
        // Merge orchestrator config with defaults
        ...(config.orchestratorConfig || {}),
      };

      logger.info(
        {
          hostname: config.hostname,
          port: config.port,
          sessionId: config.sessionId,
        },
        "Starting OpenCode server..."
      );

      // Create and start the server
      this.server = await createOpencodeServer({
        hostname: config.hostname,
        port: config.port,
        config: opencodeConfig,
      });

      // Update state
      this.state = {
        isRunning: true,
        url: this.server.url,
        sessionId: config.sessionId,
        startTime: Date.now(),
        lastHealthCheck: Date.now(),
      };

      logger.info(
        {
          url: this.state.url,
          sessionId: this.state.sessionId,
          startupTime: this.state.startTime,
        },
        "OpenCode server started successfully"
      );

      // Inject provider keys after server is running
      await this.injectProviderKeys(config.providerKeys);

      return this.server.url;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to start OpenCode server"
      );
      throw error;
    }
  }

  stop(): void {
    if (!(this.server && this.state.isRunning)) {
      logger.warn("OpenCode server is not running");
      return;
    }

    try {
      logger.info("Stopping OpenCode server...");

      // Close the server
      this.server.close();

      // Reset state
      this.state = {
        isRunning: false,
        url: null,
        sessionId: null,
        startTime: null,
        lastHealthCheck: null,
      };

      this.server = null;

      logger.info("OpenCode server stopped successfully");
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Error stopping OpenCode server"
      );
      throw error;
    }
  }

  async restart(config: ServerConfig): Promise<string> {
    if (this.state.isRunning) {
      await this.stop();
    }
    return await this.start(config);
  }

  getState(): ServerState {
    return { ...this.state };
  }

  getUrl(): string | null {
    return this.state.url;
  }

  isHealthy(): boolean {
    if (!(this.state.isRunning && this.state.lastHealthCheck)) {
      return false;
    }

    // Consider server healthy if it responded to health check within last 30 seconds
    const healthCheckThreshold =
      HEALTH_CHECK_THRESHOLD_SECONDS * MILLISECONDS_PER_SECOND;
    return Date.now() - this.state.lastHealthCheck < healthCheckThreshold;
  }

  async healthCheck(): Promise<boolean> {
    if (!(this.state.isRunning && this.state.url)) {
      return false;
    }

    try {
      // Simple health check by making a request to the server
      const response = await fetch(`${this.state.url}/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), // 5 second timeout
      });

      if (response.ok) {
        this.state.lastHealthCheck = Date.now();
        return true;
      }

      return false;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "OpenCode server health check failed"
      );
      return false;
    }
  }

  private async injectProviderKeys(
    providerKeys: EncryptedProviderKey[]
  ): Promise<void> {
    if (!this.state.url || providerKeys.length === 0) {
      logger.info("No provider keys to inject");
      return;
    }

    try {
      logger.info(
        { count: providerKeys.length },
        "Injecting provider keys into OpenCode server..."
      );

      // Create a client to inject keys
      const { createOpencodeClient } = await import("@opencode-ai/sdk");
      const client = createOpencodeClient({
        baseUrl: this.state.url,
        responseStyle: "data",
      });

      // Inject each provider key
      for (const key of providerKeys) {
        try {
          await client.auth.set({
            path: { id: key.provider },
            body: {
              type: "api",
              key: key.encryptedKey, // Note: In real implementation, this would be decrypted first
            },
          });

          logger.info(
            { provider: key.provider },
            "Provider key injected successfully"
          );
        } catch (error) {
          logger.error(
            {
              provider: key.provider,
              error: error instanceof Error ? error.message : String(error),
            },
            "Failed to inject provider key"
          );
          throw error;
        }
      }

      logger.info("All provider keys injected successfully");

      // Security: Zero out the keys from memory after injection
      for (const key of providerKeys) {
        key.encryptedKey = "";
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to inject provider keys"
      );
      throw error;
    }
  }

  getServerInfo(): {
    url: string | null;
    sessionId: string | null;
    uptime: number | null;
    isHealthy: boolean;
  } {
    const uptime = this.state.startTime
      ? Date.now() - this.state.startTime
      : null;
    const isHealthy = this.isHealthy();

    return {
      url: this.state.url,
      sessionId: this.state.sessionId,
      uptime,
      isHealthy,
    };
  }
}

// Global server manager instance
export const opencodeServer = new OpencodeServerManager();
