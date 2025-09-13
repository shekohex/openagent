import { describe, it, expect, beforeEach } from "vitest";
import { MockDockerDriver } from "../mocks/mock-docker-driver";
import { MockLocalDriver } from "../mocks/mock-local-driver";
import {
  createDriverConfig,
  createResourceLimits,
  createSecurityOptions,
  validateContainerConfig,
  validateResourceLimits,
  validateSecurityOptions,
  ContainerConfigSchema,
  ResourceLimitsSchema,
  SecurityOptionsSchema
} from "../../src";

describe("Interface Usage Demonstration Tests", () => {
  let dockerDriver: MockDockerDriver;
  let localDriver: MockLocalDriver;

  beforeEach(() => {
    dockerDriver = new MockDockerDriver();
    localDriver = new MockLocalDriver();
  });

  describe("Driver Initialization and Configuration", () => {
    it("should demonstrate driver initialization", () => {
      expect(dockerDriver.name).toBe("mock-docker");
      expect(dockerDriver.version).toBe("1.0.0");
      expect(localDriver.name).toBe("mock-local");
      expect(localDriver.version).toBe("1.0.0");

      expect(typeof dockerDriver.createContainer).toBe("function");
      expect(typeof dockerDriver.startContainer).toBe("function");
      expect(typeof dockerDriver.stopContainer).toBe("function");
      expect(typeof dockerDriver.removeContainer).toBe("function");
    });

    it("should demonstrate driver health check", async () => {
      const dockerHealth = await dockerDriver.healthCheck();
      const localHealth = await localDriver.healthCheck();

      expect(dockerHealth.status).toBe("healthy");
      expect(dockerHealth.version).toBe("1.0.0");
      expect(dockerHealth.uptime).toBeGreaterThan(0);
      expect(typeof dockerHealth.containers.total).toBe("number");

      expect(localHealth.status).toBe("healthy");
      expect(localHealth.version).toBe("1.0.0");
      expect(localHealth.uptime).toBeGreaterThan(0);
    });
  });

  describe("Container Lifecycle Management", () => {
    it("should demonstrate complete container lifecycle", async () => {
      const config = createDriverConfig({
        sessionId: "test-lifecycle",
        image: "nginx:alpine",
        env: { NGINX_PORT: "8080" },
        labels: { tier: "web", app: "demo" },
      });

      // Create container
      const container = await dockerDriver.createContainer(config);
      expect(container.status).toBe("created");
      expect(container.state).toBe("terminated");
      expect(container.sessionId).toBe("test-lifecycle");
      expect(container.image).toBe("nginx:alpine");

      // Start container
      await dockerDriver.startContainer(container.id);
      const startedContainer = await dockerDriver.getContainer(container.id);
      expect(startedContainer?.status).toBe("running");
      expect(startedContainer?.state).toBe("running");
      expect(startedContainer?.startedAt).toBeDefined();

      // Check container health
      const isHealthy = await dockerDriver.isContainerHealthy(container.id);
      expect(isHealthy).toBe(true);

      // Stop container
      await dockerDriver.stopContainer(container.id, { timeout: 10000 });
      const stoppedContainer = await dockerDriver.getContainer(container.id);
      expect(stoppedContainer?.status).toBe("stopped");
      expect(stoppedContainer?.state).toBe("terminated");

      // Remove container
      await dockerDriver.removeContainer(container.id);
      const removedContainer = await dockerDriver.getContainer(container.id);
      expect(removedContainer).toBeNull();
    });

    it("should demonstrate container listing and filtering", async () => {
      const sessionId = "test-filtering";
      const containers = [];

      // Create multiple containers
      for (let i = 0; i < 3; i++) {
        const config = createDriverConfig({
          sessionId,
          image: i % 2 === 0 ? "nginx:alpine" : "postgres:15",
          labels: { index: i.toString(), tier: i % 2 === 0 ? "web" : "db" },
        });
        const container = await dockerDriver.createContainer(config);
        containers.push(container);
        await dockerDriver.startContainer(container.id);
      }

      // List all containers in session
      const sessionContainers = await dockerDriver.listContainers({ sessionId });
      expect(sessionContainers).toHaveLength(3);

      // Filter by status
      const runningContainers = await dockerDriver.listContainers({
        sessionId,
        status: "running"
      });
      expect(runningContainers).toHaveLength(3);

      // Filter by state
      const runningStateContainers = await dockerDriver.listContainers({
        sessionId,
        state: "running"
      });
      expect(runningStateContainers).toHaveLength(3);

      // Filter by label
      const webContainers = await dockerDriver.listContainers({
        sessionId,
        label: { tier: "web" }
      });
      expect(webContainers).toHaveLength(2);

      const dbContainers = await dockerDriver.listContainers({
        sessionId,
        label: { tier: "db" }
      });
      expect(dbContainers).toHaveLength(1);

      // Cleanup
      for (const container of containers) {
        await dockerDriver.stopContainer(container.id);
        await dockerDriver.removeContainer(container.id);
      }
    });

    it("should demonstrate container logs retrieval", async () => {
      const config = createDriverConfig({
        sessionId: "test-logs",
        image: "nginx:alpine",
      });

      const container = await dockerDriver.createContainer(config);
      await dockerDriver.startContainer(container.id);

      // Get basic logs
      const logs = await dockerDriver.getContainerLogs(container.id);
      expect(typeof logs).toBe("string");
      expect(logs.length).toBeGreaterThan(0);

      // Get logs with options
      const recentLogs = await dockerDriver.getContainerLogs(container.id, {
        tail: 5,
        timestamps: true,
      });
      expect(recentLogs.length).toBeGreaterThan(0);
      expect(recentLogs.includes("[")).toBe(true);
      expect(recentLogs.includes("]")).toBe(true); // Check for timestamps

      // Cleanup
      await dockerDriver.stopContainer(container.id);
      await dockerDriver.removeContainer(container.id);
    });
  });

  describe("Resource Configuration Examples", () => {
    it("should demonstrate resource limits configuration", () => {
      const minimalResources = createResourceLimits({
        cpu: 0.1,
        memory: 64,
        disk: 100,
        pids: 10,
      });

      const standardResources = createResourceLimits({
        cpu: 1.0,
        memory: 512,
        disk: 1024,
        pids: 100,
      });

      const highResources = createResourceLimits({
        cpu: 2.0,
        memory: 2048,
        disk: 4096,
        pids: 500,
      });

      expect(validateResourceLimits(minimalResources)).toBe(true);
      expect(validateResourceLimits(standardResources)).toBe(true);
      expect(validateResourceLimits(highResources)).toBe(true);

      expect(minimalResources.cpu).toBe(0.1);
      expect(standardResources.memory).toBe(512);
      expect(highResources.pids).toBe(500);
    });

    it("should demonstrate security options configuration", () => {
      const strictSecurity = createSecurityOptions({
        readOnly: true,
        noNewPrivileges: true,
        user: "nobody",
        capabilities: {
          drop: ["ALL"],
          add: [],
        },
      });

      const relaxedSecurity = createSecurityOptions({
        readOnly: false,
        noNewPrivileges: true,
        user: "root",
        capabilities: {
          drop: ["NET_RAW", "SYS_ADMIN"],
          add: ["NET_BIND_SERVICE"],
        },
      });

      expect(validateSecurityOptions(strictSecurity)).toBe(true);
      expect(validateSecurityOptions(relaxedSecurity)).toBe(true);

      expect(strictSecurity.readOnly).toBe(true);
      expect(strictSecurity.capabilities.drop).toContain("ALL");
      expect(relaxedSecurity.capabilities.add).toContain("NET_BIND_SERVICE");
    });

    it("should demonstrate volume and network configuration", async () => {
      // Create volume
      const volumeConfig = {
        name: "test-volume",
        labels: { environment: "test" },
      };
      const volume = await dockerDriver.createVolume(volumeConfig);
      expect(volume.name).toBe("test-volume");
      expect(volume.driver).toBe("local");

      // Create network
      const networkConfig = {
        name: "test-network",
        labels: { environment: "test" },
      };
      const network = await dockerDriver.createNetwork(networkConfig);
      expect(network.name).toBe("test-network");
      expect(network.driver).toBe("bridge");

      // Use volume in container config
      const containerConfig = createDriverConfig({
        sessionId: "test-volume-network",
        image: "nginx:alpine",
        volumes: [{
          source: volume.mountpoint,
          target: "/usr/share/nginx/html",
          type: "volume"
        }],
        network: network.name,
      });

      expect(validateContainerConfig(containerConfig)).toBe(true);

      // Cleanup
      await dockerDriver.removeVolume(volume.id);
      await dockerDriver.removeNetwork(network.id);
    });
  });

  describe("Configuration Validation Patterns", () => {
    it("should demonstrate schema validation", () => {
      const validConfig = createDriverConfig({
        sessionId: "test-validation",
        image: "nginx:alpine",
        env: { PORT: "8080" },
        labels: { app: "test" },
      });

      const invalidConfig = {
        sessionId: "",
        image: "nginx:alpine",
        env: { PORT: 8080 }, // Should be string
        labels: { app: "test" },
      };

      expect(ContainerConfigSchema.safeParse(validConfig).success).toBe(true);
      expect(ContainerConfigSchema.safeParse(invalidConfig).success).toBe(false);
    });

    it("should demonstrate configuration helpers", () => {
      const partialConfig = {
        sessionId: "test-partial",
        image: "nginx:alpine",
      };

      const fullConfig = createDriverConfig(partialConfig);
      expect(fullConfig.sessionId).toBe("test-partial");
      expect(fullConfig.image).toBe("nginx:alpine");
      expect(fullConfig.env).toEqual({});
      expect(fullConfig.labels).toEqual({});
      expect(fullConfig.resources.cpu).toBe(0.5);
      expect(fullConfig.security.readOnly).toBe(true);

      const customResources = createResourceLimits({ cpu: 2.0, memory: 1024 });
      const configWithCustomResources = createDriverConfig({
        ...partialConfig,
        resources: customResources,
      });
      expect(configWithCustomResources.resources.cpu).toBe(2.0);
      expect(configWithCustomResources.resources.memory).toBe(1024);
    });
  });

  describe("Cross-Driver Interface Consistency", () => {
    it("should demonstrate consistent interface across drivers", async () => {
      const baseConfig = createDriverConfig({
        sessionId: "test-consistency",
        image: "nginx:alpine",
      });

      // Test with both drivers
      const dockerContainer = await dockerDriver.createContainer(baseConfig);
      const localContainer = await localDriver.createContainer(baseConfig);

      // Both should have same basic properties
      expect(dockerContainer.sessionId).toBe(localContainer.sessionId);
      expect(dockerContainer.image).toBe(localContainer.image);
      expect(dockerContainer.status).toBe(localContainer.status);

      // Start both containers
      await dockerDriver.startContainer(dockerContainer.id);
      await localDriver.startContainer(localContainer.id);

      // Check health on both
      const dockerHealthy = await dockerDriver.isContainerHealthy(dockerContainer.id);
      const localHealthy = await localDriver.isContainerHealthy(localContainer.id);

      expect(dockerHealthy).toBe(true);
      expect(localHealthy).toBe(true);

      // Get logs from both
      const dockerLogs = await dockerDriver.getContainerLogs(dockerContainer.id);
      const localLogs = await localDriver.getContainerLogs(localContainer.id);

      expect(typeof dockerLogs).toBe("string");
      expect(typeof localLogs).toBe("string");

      // Cleanup both
      await dockerDriver.stopContainer(dockerContainer.id);
      await localDriver.stopContainer(localContainer.id);
      await dockerDriver.removeContainer(dockerContainer.id);
      await localDriver.removeContainer(localContainer.id);
    });

    it("should demonstrate driver-specific behavior", async () => {
      const highResourceConfig = createDriverConfig({
        sessionId: "test-driver-specific",
        image: "nginx:alpine",
        resources: createResourceLimits({
          cpu: 3.0, // Within Docker limit (4) but exceeds Local limit (2)
          memory: 1024,
          disk: 2048,
          pids: 100,
        }),
      });

      // Docker should succeed
      const dockerContainer = await dockerDriver.createContainer(highResourceConfig);
      expect(dockerContainer.resources.cpu).toBe(3.0);

      // Local should fail
      try {
        await localDriver.createContainer(highResourceConfig);
        expect.fail("Local driver should have thrown ResourceLimitError");
      } catch (error) {
        expect(error).toHaveProperty("code", "RESOURCE_LIMIT_EXCEEDED");
      }

      // Cleanup
      await dockerDriver.stopContainer(dockerContainer.id);
      await dockerDriver.removeContainer(dockerContainer.id);
    });
  });

  describe("Error Handling Patterns", () => {
    it("should demonstrate graceful error handling", async () => {
      try {
        await dockerDriver.getContainer("non-existent-container");
        const container = await dockerDriver.getContainer("non-existent-container");
        expect(container).toBeNull(); // getContainer returns null for non-existent containers
      } catch (error) {
        // If it throws, it should be a driver error
        expect(error).toHaveProperty("code");
      }

      try {
        await dockerDriver.removeContainer("non-existent-container");
        expect.fail("Should have thrown ContainerNotFoundError");
      } catch (error) {
        expect(error).toHaveProperty("code", "CONTAINER_NOT_FOUND");
      }
    });

    it("should demonstrate operation timeout handling", async () => {
      const config = createDriverConfig({
        sessionId: "test-timeout",
        image: "nginx:alpine",
      });

      const container = await dockerDriver.createContainer(config);
      await dockerDriver.startContainer(container.id);

      // Test timeout that's too short
      try {
        await dockerDriver.stopContainer(container.id, { timeout: 1000 });
        expect.fail("Should have thrown ContainerStopError");
      } catch (error) {
        expect(error).toHaveProperty("code", "CONTAINER_STOP_FAILED");
      }

      // Test with sufficient timeout
      await dockerDriver.stopContainer(container.id, { timeout: 15000 });
      expect((await dockerDriver.getContainer(container.id))?.status).toBe("stopped");

      // Cleanup
      await dockerDriver.removeContainer(container.id);
    });
  });
});