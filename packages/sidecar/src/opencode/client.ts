import { createOpencodeClient } from "@opencode-ai/sdk";
import { logger } from "../logger";
import { opencodeServer } from "./server";

export class OpencodeClientManager {
  private readonly client: ReturnType<typeof createOpencodeClient> | null =
    null;

  createClient(): ReturnType<typeof createOpencodeClient> {
    const serverUrl = opencodeServer.getUrl();

    if (!serverUrl) {
      throw new Error("OpenCode server is not running");
    }

    try {
      logger.info({ baseUrl: serverUrl }, "Creating OpenCode client");

      this.client = createOpencodeClient({
        baseUrl: serverUrl,
        responseStyle: "data",
        throwOnError: false,
      });

      return this.client;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to create OpenCode client"
      );
      throw error;
    }
  }

  getClient(): ReturnType<typeof createOpencodeClient> | null {
    return this.client;
  }

  async getClientOrThrow(): Promise<ReturnType<typeof createOpencodeClient>> {
    if (!this.client) {
      return await this.createClient();
    }
    return this.client;
  }

  async testConnection(): Promise<boolean> {
    try {
      const client = await this.getClientOrThrow();

      // Test connection by getting config
      const config = await client.config.get();

      logger.info(
        {
          hasConfig: !!config,
          serverUrl: opencodeServer.getUrl(),
        },
        "OpenCode client connection test successful"
      );

      return true;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "OpenCode client connection test failed"
      );
      return false;
    }
  }

  async getSession(sessionId: string) {
    const client = await this.getClientOrThrow();
    return await client.session.get({ path: { id: sessionId } });
  }

  async createSession(
    title: string,
    model?: { providerID: string; modelID: string }
  ) {
    const client = await this.getClientOrThrow();
    return await client.session.create({
      body: {
        title,
        ...(model !== undefined && { model }),
      },
    });
  }

  async sendPrompt(
    sessionId: string,
    prompt: string,
    model?: { providerID: string; modelID: string }
  ) {
    const client = await this.getClientOrThrow();
    return await client.session.prompt({
      path: { id: sessionId },
      body: {
        model,
        parts: [{ type: "text", text: prompt }],
      },
    });
  }

  async listSessions() {
    const client = await this.getClientOrThrow();
    return await client.session.list();
  }

  async abortSession(sessionId: string) {
    const client = await this.getClientOrThrow();
    return await client.session.abort({ path: { id: sessionId } });
  }
}

// Global client manager instance
export const opencodeClient = new OpencodeClientManager();
