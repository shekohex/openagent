import { logger } from "../logger";
import { opencodeClient } from "./client";
import { opencodeServer } from "./server";

const RETRY_DELAY_MS = 5000;

export type OpenCodeEvent = {
  type: string;
  properties: Record<string, unknown>;
  timestamp: number;
};

export class EventSubscriber {
  private readonly eventStream: unknown | null = null;
  private readonly isSubscribed = false;

  async subscribeToEvents(): Promise<void> {
    if (this.isSubscribed) {
      logger.warn("Already subscribed to OpenCode events");
      return;
    }

    try {
      const client = await opencodeClient.getClientOrThrow();

      logger.info("Subscribing to OpenCode server events...");

      this.eventStream = await client.event.subscribe();
      this.isSubscribed = true;

      // Start processing events in background
      this.processEvents().catch((error) => {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          "Error processing OpenCode events"
        );
        this.isSubscribed = false;
      });

      logger.info("Successfully subscribed to OpenCode events");
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to subscribe to OpenCode events"
      );
      throw error;
    }
  }

  unsubscribeFromEvents(): void {
    if (!(this.isSubscribed && this.eventStream)) {
      return;
    }

    try {
      logger.info("Unsubscribing from OpenCode events...");

      // Note: The SDK doesn't seem to have an explicit unsubscribe method
      // We'll set the flag to false and let the processing loop exit
      this.isSubscribed = false;
      this.eventStream = null;

      logger.info("Successfully unsubscribed from OpenCode events");
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Error unsubscribing from OpenCode events"
      );
    }
  }

  private async processEvents(): Promise<void> {
    if (!this.canProcessEvents()) {
      return;
    }

    try {
      await this.processEventStream();
    } catch (error) {
      this.handleProcessingError(error);
    }
  }

  private canProcessEvents(): boolean {
    return !!(this.eventStream && this.isSubscribed);
  }

  private async processEventStream(): Promise<void> {
    if (this.isAsyncIterable()) {
      await this.processAsyncEvents();
    } else {
      this.logNonAsyncIterableWarning();
    }
  }

  private isAsyncIterable(): boolean {
    return (
      this.eventStream !== null &&
      typeof (this.eventStream as { [Symbol.asyncIterator]?: unknown })[
        Symbol.asyncIterator
      ] === "function"
    );
  }

  private async processAsyncEvents(): Promise<void> {
    if (!this.eventStream) {
      return;
    }

    const eventStream = this.eventStream as AsyncIterable<unknown>;
    for await (const event of eventStream) {
      if (!this.isSubscribed) {
        break;
      }

      const openCodeEvent = this.transformEvent(event);
      await this.forwardEventToOrchestrator(openCodeEvent);
    }
  }

  private transformEvent(event: unknown): OpenCodeEvent {
    return {
      type: (event as { type?: string }).type || "unknown",
      properties:
        (event as { properties?: Record<string, unknown> }).properties || {},
      timestamp: Date.now(),
    };
  }

  private logNonAsyncIterableWarning(): void {
    logger.warn(
      "Event stream is not async iterable, skipping event processing"
    );
  }

  private handleProcessingError(error: unknown): void {
    if (!this.isSubscribed) {
      return;
    }

    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Error in OpenCode event processing loop"
    );

    this.scheduleResubscribe();
  }

  private scheduleResubscribe(): void {
    setTimeout(() => {
      if (this.isSubscribed) {
        this.subscribeToEvents().catch(() => {
          // Error already logged
        });
      }
    }, RETRY_DELAY_MS);
  }

  private forwardEventToOrchestrator(event: OpenCodeEvent): void {
    try {
      logger.debug(
        {
          eventType: event.type,
          properties: event.properties,
          timestamp: event.timestamp,
        },
        "Forwarding OpenCode event to orchestrator"
      );

      // TODO: Implement actual forwarding to orchestrator
      // This will be implemented in the event bridging task (T023)
      // For now, we'll just log the event

      // Map OpenCode events to orchestrator events
      switch (event.type) {
        case "server.connected":
          logger.info("OpenCode server connected event received");
          break;
        case "message.updated":
          logger.debug("Message updated event received");
          break;
        case "message.part.updated":
          logger.debug("Message part updated event received");
          break;
        case "permission.updated":
          logger.info("Permission request event received");
          break;
        case "permission.replied":
          logger.info("Permission response event received");
          break;
        case "session.updated":
          logger.info("Session state changed event received");
          break;
        case "session.idle":
          logger.debug("Session idle event received");
          break;
        case "file.edited":
          logger.debug("File edited event received");
          break;
        default:
          logger.debug(
            { eventType: event.type },
            "Unknown OpenCode event type"
          );
      }
    } catch (error) {
      logger.error(
        {
          eventType: event.type,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to forward OpenCode event to orchestrator"
      );
    }
  }

  isEventSubscribed(): boolean {
    return this.isSubscribed;
  }

  getEventStats(): {
    isSubscribed: boolean;
    serverUrl: string | null;
    sessionId: string | null;
  } {
    return {
      isSubscribed: this.isSubscribed,
      serverUrl: opencodeServer.getUrl(),
      sessionId: opencodeServer.getState().sessionId,
    };
  }
}

// Global event subscriber instance
export const eventSubscriber = new EventSubscriber();
