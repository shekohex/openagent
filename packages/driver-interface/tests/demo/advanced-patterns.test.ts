import { describe, it, expect, beforeEach } from "vitest";
import { MockDockerDriver } from "../mocks/mock-docker-driver";
import { MockLocalDriver } from "../mocks/mock-local-driver";
import { createDriverConfig, createResourceLimits, createSecurityOptions, validateContainerConfig } from "../../src";

describe("Advanced Usage Pattern Tests", () => {
  let dockerDriver: MockDockerDriver;
  let localDriver: MockLocalDriver;

  beforeEach(() => {
    dockerDriver = new MockDockerDriver();
    localDriver = new MockLocalDriver();
  });

  describe("Multi-container Orchestration Patterns", () => {
    it("should create and manage multiple containers in a session", async () => {
      const sessionId = "test-session-multi";
      const containers = [];

      const appConfig = createDriverConfig({
        sessionId,
        image: "node:18",
        env: { NODE_ENV: "production" },
        labels: { app: "main", tier: "frontend" },
      });

      const dbConfig = createDriverConfig({
        sessionId,
        image: "postgres:15",
        env: { POSTGRES_USER: "user", POSTGRES_DB: "testdb" },
        labels: { app: "database", tier: "backend" },
      });

      const cacheConfig = createDriverConfig({
        sessionId,
        image: "redis:7",
        env: { REDIS_PASSWORD: "secret" },
        labels: { app: "cache", tier: "backend" },
      });

      const appContainer = await dockerDriver.createContainer(appConfig);
      const dbContainer = await dockerDriver.createContainer(dbConfig);
      const cacheContainer = await dockerDriver.createContainer(cacheConfig);

      containers.push(appContainer, dbContainer, cacheContainer);

      expect(containers).toHaveLength(3);
      expect(containers.every(c => c.sessionId === sessionId)).toBe(true);
      expect(containers.every(c => c.status === "created")).toBe(true);

      const sessionContainers = await dockerDriver.listContainers({ sessionId });
      expect(sessionContainers).toHaveLength(3);
    });

    it("should demonstrate dependency-based startup order", async () => {
      const sessionId = "test-session-dependency";

      const dbConfig = createDriverConfig({
        sessionId,
        image: "postgres:15",
        env: { POSTGRES_USER: "user", POSTGRES_DB: "testdb" },
        labels: { app: "database", depends_on: "none" },
      });

      const appConfig = createDriverConfig({
        sessionId,
        image: "node:18",
        env: { DB_HOST: "localhost", DB_PORT: "5432" },
        labels: { app: "application", depends_on: "database" },
      });

      const dbContainer = await dockerDriver.createContainer(dbConfig);
      const appContainer = await dockerDriver.createContainer(appConfig);

      expect(dbContainer.labels.depends_on).toBe("none");
      expect(appContainer.labels.depends_on).toBe("database");

      await dockerDriver.startContainer(dbContainer.id);
      expect((await dockerDriver.getContainer(dbContainer.id))?.status).toBe("running");

      await dockerDriver.startContainer(appContainer.id);
      expect((await dockerDriver.getContainer(appContainer.id))?.status).toBe("running");
    });
  });

  describe("Session-based Container Management", () => {
    it("should manage containers with session lifecycle", async () => {
      const sessionId = "test-session-lifecycle";
      const containerIds: string[] = [];

      const baseConfig = createDriverConfig({
        sessionId,
        image: "python:3.11",
        env: { SESSION_ID: sessionId },
        labels: { session_type: "development" },
      });

      for (let i = 0; i < 3; i++) {
        const config = {
          ...baseConfig,
          labels: { ...baseConfig.labels, container_index: i.toString() },
        };
        const container = await dockerDriver.createContainer(config);
        containerIds.push(container.id);
        await dockerDriver.startContainer(container.id);
      }

      const sessionContainers = await dockerDriver.listContainers({ sessionId });
      expect(sessionContainers).toHaveLength(3);
      expect(sessionContainers.every(c => c.state === "running")).toBe(true);

      for (const id of containerIds) {
        await dockerDriver.stopContainer(id, { timeout: 10000 });
      }

      const stoppedContainers = await dockerDriver.listContainers({ sessionId, status: "stopped" });
      expect(stoppedContainers).toHaveLength(3);
    });

    it("should clean up all containers in a session", async () => {
      const sessionId = "test-session-cleanup";

      const config = createDriverConfig({
        sessionId,
        image: "nginx:alpine",
        labels: { cleanup_group: "test" },
      });

      const container1 = await dockerDriver.createContainer(config);
      const container2 = await dockerDriver.createContainer(config);

      await dockerDriver.startContainer(container1.id);
      await dockerDriver.startContainer(container2.id);

      const beforeCleanup = await dockerDriver.listContainers({ sessionId });
      expect(beforeCleanup).toHaveLength(2);

      await dockerDriver.stopContainer(container1.id);
      await dockerDriver.stopContainer(container2.id);
      await dockerDriver.removeContainer(container1.id);
      await dockerDriver.removeContainer(container2.id);

      const afterCleanup = await dockerDriver.listContainers({ sessionId });
      expect(afterCleanup).toHaveLength(0);
    });
  });

  describe("Resource Pooling and Reuse", () => {
    it("should demonstrate resource limit patterns", async () => {
      const sessionId = "test-resource-pooling";

      const lowResourceConfig = createDriverConfig({
        sessionId,
        image: "busybox:latest",
        resources: createResourceLimits({
          cpu: 0.1,
          memory: 64,
          disk: 100,
          pids: 10,
        }),
        labels: { resource_class: "low" },
      });

      const highResourceConfig = createDriverConfig({
        sessionId,
        image: "node:18",
        resources: createResourceLimits({
          cpu: 2.0,
          memory: 1024,
          disk: 2048,
          pids: 100,
        }),
        labels: { resource_class: "high" },
      });

      const lowContainer = await dockerDriver.createContainer(lowResourceConfig);
      const highContainer = await dockerDriver.createContainer(highResourceConfig);

      expect(lowContainer.resources.cpu).toBe(0.1);
      expect(lowContainer.resources.memory).toBe(64);
      expect(highContainer.resources.cpu).toBe(2.0);
      expect(highContainer.resources.memory).toBe(1024);

      const lowContainers = await dockerDriver.listContainers({ sessionId, label: { resource_class: "low" } });
      const highContainers = await dockerDriver.listContainers({ sessionId, label: { resource_class: "high" } });

      expect(lowContainers).toHaveLength(1);
      expect(highContainers).toHaveLength(1);
    });

    it("should simulate resource sharing between containers", async () => {
      const sessionId = "test-resource-sharing";

      const sharedVolumeConfig = {
        name: "shared-data",
        labels: { shared_by: sessionId },
      };

      const volume1 = await dockerDriver.createVolume(sharedVolumeConfig);
      const volume2 = await localDriver.createVolume(sharedVolumeConfig);

      expect(volume1.name).toBe("shared-data");
      expect(volume2.name).toBe("shared-data");

      const configWithVolume = createDriverConfig({
        sessionId,
        image: "nginx:alpine",
        volumes: [{ source: volume1.mountpoint, target: "/usr/share/nginx/html", type: "volume" }],
        labels: { uses_shared_volume: "true" },
      });

      const container = await dockerDriver.createContainer(configWithVolume);
      expect(container).toBeDefined();
      expect(container.id).toBeDefined();
    });
  });

  describe("Error Recovery and Retry Patterns", () => {
    it("should demonstrate retry logic for transient failures", async () => {
      const sessionId = "test-retry-pattern";

      const config = createDriverConfig({
        sessionId,
        image: "busybox:latest",
        resources: createResourceLimits({
          cpu: 5,
          memory: 1024,
          disk: 2048,
          pids: 100,
        }),
        labels: { test_retry: "true" },
      });

      let attempts = 0;
      let container = null;

      while (attempts < 3) {
        try {
          container = await dockerDriver.createContainer(config);
          break;
        } catch (error) {
          attempts++;
          if (attempts < 3) {
            config.resources.cpu = 1;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }

      expect(container).not.toBeNull();
      expect(attempts).toBe(1);
    });

    it("should demonstrate graceful degradation", async () => {
      const sessionId = "test-graceful-degradation";

      const config = createDriverConfig({
        sessionId,
        image: "nginx:alpine",
        labels: { fallback_mode: "true" },
      });

      let primarySuccess = false;
      let fallbackSuccess = false;

      try {
        const container = await dockerDriver.createContainer(config);
        await dockerDriver.startContainer(container.id);
        primarySuccess = true;
      } catch (error) {
        try {
          const fallbackContainer = await localDriver.createContainer(config);
          await localDriver.startContainer(fallbackContainer.id);
          fallbackSuccess = true;
        } catch (fallbackError) {
        }
      }

      expect(primarySuccess || fallbackSuccess).toBe(true);
    });
  });

  describe("Event-driven Architecture Patterns", () => {
    it("should demonstrate container state change events", async () => {
      const sessionId = "test-event-driven";
      const stateChanges: Array<{ id: string; from: string; to: string }> = [];

      const config = createDriverConfig({
        sessionId,
        image: "busybox:latest",
        labels: { event_test: "true" },
      });

      const container = await dockerDriver.createContainer(config);
      const initialStatus = container.status;

      await dockerDriver.startContainer(container.id);
      const runningStatus = (await dockerDriver.getContainer(container.id))?.status;

      await dockerDriver.stopContainer(container.id);
      const stoppedStatus = (await dockerDriver.getContainer(container.id))?.status;

      expect(initialStatus).toBe("created");
      expect(runningStatus).toBe("running");
      expect(stoppedStatus).toBe("stopped");
    });

    it("should demonstrate health monitoring patterns", async () => {
      const sessionId = "test-health-monitoring";

      const config = createDriverConfig({
        sessionId,
        image: "nginx:alpine",
        labels: { health_check: "enabled" },
      });

      const container = await dockerDriver.createContainer(config);
      await dockerDriver.startContainer(container.id);

      const healthStatus = await dockerDriver.isContainerHealthy(container.id);
      expect(healthStatus).toBe(true);

      const driverHealth = await dockerDriver.healthCheck();
      expect(driverHealth.status).toBe("healthy");
      expect(driverHealth.containers.total).toBeGreaterThanOrEqual(1);
      expect(driverHealth.containers.running).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Monitoring and Metrics Collection", () => {
    it("should demonstrate container metrics collection", async () => {
      const sessionId = "test-metrics-collection";

      const configs = [
        createDriverConfig({
          sessionId,
          image: "nginx:alpine",
          labels: { metrics: "frontend" },
        }),
        createDriverConfig({
          sessionId,
          image: "postgres:15",
          labels: { metrics: "database" },
        }),
      ];

      const containers = await Promise.all(
        configs.map(config => dockerDriver.createContainer(config))
      );

      await Promise.all(
        containers.map(container => dockerDriver.startContainer(container.id))
      );

      const runningContainers = await dockerDriver.listContainers({ sessionId, state: "running" });
      expect(runningContainers).toHaveLength(2);

      const driverHealth = await dockerDriver.healthCheck();
      expect(driverHealth.containers.total).toBe(2);
      expect(driverHealth.containers.running).toBe(2);

      const frontendContainers = await dockerDriver.listContainers({ sessionId, label: { metrics: "frontend" } });
      const databaseContainers = await dockerDriver.listContainers({ sessionId, label: { metrics: "database" } });

      expect(frontendContainers).toHaveLength(1);
      expect(databaseContainers).toHaveLength(1);
    });

    it("should demonstrate log aggregation patterns", async () => {
      const sessionId = "test-log-aggregation";

      const config = createDriverConfig({
        sessionId,
        image: "busybox:latest",
        labels: { log_test: "true" },
      });

      const container = await dockerDriver.createContainer(config);
      await dockerDriver.startContainer(container.id);

      const recentLogs = await dockerDriver.getContainerLogs(container.id, {
        tail: 5,
        timestamps: true,
      });

      expect(typeof recentLogs).toBe("string");
      expect(recentLogs.length).toBeGreaterThan(0);

      const timestampedLines = recentLogs.split("\n").filter(line => line.startsWith("["));
      expect(timestampedLines.length).toBeGreaterThan(0);
    });
  });

  describe("Cross-driver Pattern Comparison", () => {
    it("should demonstrate consistent patterns across different drivers", async () => {
      const sessionId = "test-cross-driver";

      const baseConfig = createDriverConfig({
        sessionId,
        image: "nginx:alpine",
        labels: { cross_driver_test: "true" },
      });

      const dockerContainer = await dockerDriver.createContainer(baseConfig);
      const localContainer = await localDriver.createContainer(baseConfig);

      expect(dockerContainer.sessionId).toBe(sessionId);
      expect(localContainer.sessionId).toBe(sessionId);
      expect(dockerContainer.image).toBe("nginx:alpine");
      expect(localContainer.image).toBe("nginx:alpine");

      await dockerDriver.startContainer(dockerContainer.id);
      await localDriver.startContainer(localContainer.id);

      const dockerHealth = await dockerDriver.isContainerHealthy(dockerContainer.id);
      const localHealth = await localDriver.isContainerHealthy(localContainer.id);

      expect(dockerHealth).toBe(true);
      expect(localHealth).toBe(true);

      const dockerDriverHealth = await dockerDriver.healthCheck();
      const localDriverHealth = await localDriver.healthCheck();

      expect(dockerDriverHealth.status).toBe("healthy");
      expect(localDriverHealth.status).toBe("healthy");
    });
  });
});