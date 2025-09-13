import { describe, it, expect, beforeEach } from "vitest";
import { MockDockerDriver } from "../mocks/mock-docker-driver";
import { MockLocalDriver } from "../mocks/mock-local-driver";
import {
  createDriverConfig,
  createResourceLimits,
  createSecurityOptions,
  ContainerConfigSchema,
  ResourceLimitsSchema,
  SecurityOptionsSchema,
} from "../../src";

describe("Mock Driver Comparison Tests", () => {
  let dockerDriver: MockDockerDriver;
  let localDriver: MockLocalDriver;

  beforeEach(() => {
    dockerDriver = new MockDockerDriver();
    localDriver = new MockLocalDriver();
  });

  describe("Driver Capabilities and Limits", () => {
    it("should compare CPU resource limits between drivers", async () => {
      const highCpuConfig = createDriverConfig({
        sessionId: "test-cpu-comparison",
        image: "nginx:alpine",
        resources: createResourceLimits({
          cpu: 3.0,
          memory: 512,
          disk: 1024,
          pids: 100,
        }),
      });

      const dockerResult = await dockerDriver.createContainer(highCpuConfig);
      expect(dockerResult.resources.cpu).toBe(3.0);

      try {
        await localDriver.createContainer(highCpuConfig);
        expect.fail("Local driver should have thrown ResourceLimitError");
      } catch (error) {
        expect(error).toHaveProperty("code", "RESOURCE_LIMIT_EXCEEDED");
      }

      await dockerDriver.removeContainer(dockerResult.id);
    });

    it("should compare memory handling between drivers", async () => {
      const memoryConfig = createDriverConfig({
        sessionId: "test-memory-comparison",
        image: "nginx:alpine",
        resources: createResourceLimits({
          cpu: 1.0,
          memory: 2048,
          disk: 2048,
          pids: 200,
        }),
      });

      const dockerContainer = await dockerDriver.createContainer(memoryConfig);
      const localContainer = await localDriver.createContainer(memoryConfig);

      expect(dockerContainer.resources.memory).toBe(2048);
      expect(localContainer.resources.memory).toBe(2048);

      await dockerDriver.removeContainer(dockerContainer.id);
      await localDriver.removeContainer(localContainer.id);
    });

    it("should compare network capabilities", async () => {
      const networkName = "test-network-comparison";

      const dockerNetwork = await dockerDriver.createNetwork({
        name: networkName,
        driver: "bridge",
        labels: { test: "docker" },
      });

      const localNetwork = await localDriver.createNetwork({
        name: networkName,
        driver: "bridge",
        labels: { test: "local" },
      });

      expect(dockerNetwork.driver).toBe("bridge");
      expect(localNetwork.driver).toBe("bridge");
      expect(dockerNetwork.name).toBe(networkName);
      expect(localNetwork.name).toBe(networkName);

      await dockerDriver.removeNetwork(dockerNetwork.id);
      await localDriver.removeNetwork(localNetwork.id);
    });
  });

  describe("Performance Characteristics", () => {
    it("should compare operation timing between drivers", async () => {
      const config = createDriverConfig({
        sessionId: "test-timing-comparison",
        image: "nginx:alpine",
      });

      const dockerStart = Date.now();
      const dockerContainer = await dockerDriver.createContainer(config);
      await dockerDriver.startContainer(dockerContainer.id);
      const dockerEnd = Date.now();
      const dockerTime = dockerEnd - dockerStart;

      const localStart = Date.now();
      const localContainer = await localDriver.createContainer(config);
      await localDriver.startContainer(localContainer.id);
      const localEnd = Date.now();
      const localTime = localEnd - localStart;

      expect(dockerTime).toBeGreaterThan(0);
      expect(localTime).toBeGreaterThan(0);

      await dockerDriver.stopContainer(dockerContainer.id);
      await localDriver.stopContainer(localContainer.id);
      await dockerDriver.removeContainer(dockerContainer.id);
      await localDriver.removeContainer(localContainer.id);
    });

    it("should compare concurrent operation handling", async () => {
      const sessionId = "test-concurrent-comparison";
      const containerCount = 5;
      const configs = Array.from({ length: containerCount }, (_, i) =>
        createDriverConfig({
          sessionId,
          image: `nginx:alpine`,
          labels: { index: i.toString() },
        })
      );

      const dockerStart = Date.now();
      const dockerContainers = await Promise.all(
        configs.map(config => dockerDriver.createContainer(config))
      );
      await Promise.all(
        dockerContainers.map(container => dockerDriver.startContainer(container.id))
      );
      const dockerEnd = Date.now();
      const dockerConcurrentTime = dockerEnd - dockerStart;

      const localStart = Date.now();
      const localContainers = await Promise.all(
        configs.map(config => localDriver.createContainer(config))
      );
      await Promise.all(
        localContainers.map(container => localDriver.startContainer(container.id))
      );
      const localEnd = Date.now();
      const localConcurrentTime = localEnd - localStart;

      expect(dockerConcurrentTime).toBeGreaterThan(0);
      expect(localConcurrentTime).toBeGreaterThan(0);
      expect(dockerContainers).toHaveLength(containerCount);
      expect(localContainers).toHaveLength(containerCount);

      await Promise.all(
        dockerContainers.map(container => dockerDriver.stopContainer(container.id))
      );
      await Promise.all(
        localContainers.map(container => localDriver.stopContainer(container.id))
      );
      await Promise.all(
        dockerContainers.map(container => dockerDriver.removeContainer(container.id))
      );
      await Promise.all(
        localContainers.map(container => localDriver.removeContainer(container.id))
      );
    });
  });

  describe("Error Handling Differences", () => {
    it("should compare timeout handling between drivers", async () => {
      const config = createDriverConfig({
        sessionId: "test-timeout-comparison",
        image: "nginx:alpine",
      });

      const dockerContainer = await dockerDriver.createContainer(config);
      await dockerDriver.startContainer(dockerContainer.id);

      const localContainer = await localDriver.createContainer(config);
      await localDriver.startContainer(localContainer.id);

      try {
        await dockerDriver.stopContainer(dockerContainer.id, { timeout: 1000 });
        expect.fail("Docker driver should have thrown ContainerStopError");
      } catch (error) {
        expect(error).toHaveProperty("code", "CONTAINER_STOP_FAILED");
      }

      try {
        await localDriver.stopContainer(localContainer.id, { timeout: 1000 });
        expect.fail("Local driver should have thrown ContainerStopError");
      } catch (error) {
        expect(error).toHaveProperty("code", "CONTAINER_STOP_FAILED");
      }

      await dockerDriver.stopContainer(dockerContainer.id, { timeout: 15000 });
      await localDriver.stopContainer(localContainer.id, { timeout: 15000 });
      await dockerDriver.removeContainer(dockerContainer.id);
      await localDriver.removeContainer(localContainer.id);
    });

    it("should compare resource limit error behavior", async () => {
      const excessiveCpuConfig = createDriverConfig({
        sessionId: "test-excessive-cpu",
        image: "nginx:alpine",
        resources: createResourceLimits({
          cpu: 5.0,
          memory: 512,
          disk: 1024,
          pids: 100,
        }),
      });

      let dockerThrew = false;
      let localThrew = false;

      try {
        await dockerDriver.createContainer(excessiveCpuConfig);
      } catch (error) {
        dockerThrew = error.code === "RESOURCE_LIMIT_EXCEEDED";
      }

      try {
        await localDriver.createContainer(excessiveCpuConfig);
      } catch (error) {
        localThrew = error.code === "RESOURCE_LIMIT_EXCEEDED";
      }

      expect(dockerThrew).toBe(true);
      expect(localThrew).toBe(true);
    });
  });

  describe("State Management Consistency", () => {
    it("should compare container state transitions", async () => {
      const config = createDriverConfig({
        sessionId: "test-state-transitions",
        image: "nginx:alpine",
      });

      const dockerContainer = await dockerDriver.createContainer(config);
      const localContainer = await localDriver.createContainer(config);

      expect(dockerContainer.status).toBe("created");
      expect(localContainer.status).toBe("created");
      expect(dockerContainer.state).toBe("terminated");
      expect(localContainer.state).toBe("terminated");

      await dockerDriver.startContainer(dockerContainer.id);
      await localDriver.startContainer(localContainer.id);

      const dockerStarted = await dockerDriver.getContainer(dockerContainer.id);
      const localStarted = await localDriver.getContainer(localContainer.id);

      expect(dockerStarted?.status).toBe("running");
      expect(localStarted?.status).toBe("running");
      expect(dockerStarted?.state).toBe("running");
      expect(localStarted?.state).toBe("running");

      await dockerDriver.stopContainer(dockerContainer.id);
      await localDriver.stopContainer(localContainer.id);

      const dockerStopped = await dockerDriver.getContainer(dockerContainer.id);
      const localStopped = await localDriver.getContainer(localContainer.id);

      expect(dockerStopped?.status).toBe("stopped");
      expect(localStopped?.status).toBe("stopped");
      expect(dockerStopped?.state).toBe("terminated");
      expect(localStopped?.state).toBe("terminated");

      await dockerDriver.removeContainer(dockerContainer.id);
      await localDriver.removeContainer(localContainer.id);

      const dockerRemoved = await dockerDriver.getContainer(dockerContainer.id);
      const localRemoved = await localDriver.getContainer(localContainer.id);

      expect(dockerRemoved).toBeNull();
      expect(localRemoved).toBeNull();
    });

    it("should compare container listing and filtering consistency", async () => {
      const sessionId = "test-listing-consistency";
      const labels = [
        { app: "web", tier: "frontend" },
        { app: "api", tier: "backend" },
        { app: "db", tier: "database" },
      ];

      const dockerContainers = [];
      const localContainers = [];

      for (const label of labels) {
        const dockerConfig = createDriverConfig({
          sessionId,
          image: "nginx:alpine",
          labels: label,
        });
        const localConfig = createDriverConfig({
          sessionId,
          image: "nginx:alpine",
          labels: label,
        });

        const dockerContainer = await dockerDriver.createContainer(dockerConfig);
        const localContainer = await localDriver.createContainer(localConfig);

        await dockerDriver.startContainer(dockerContainer.id);
        await localDriver.startContainer(localContainer.id);

        dockerContainers.push(dockerContainer);
        localContainers.push(localContainer);
      }

      const dockerSessionContainers = await dockerDriver.listContainers({ sessionId });
      const localSessionContainers = await localDriver.listContainers({ sessionId });

      expect(dockerSessionContainers).toHaveLength(labels.length);
      expect(localSessionContainers).toHaveLength(labels.length);

      const dockerWebContainers = await dockerDriver.listContainers({
        sessionId,
        label: { app: "web" },
      });
      const localWebContainers = await localDriver.listContainers({
        sessionId,
        label: { app: "web" },
      });

      expect(dockerWebContainers).toHaveLength(1);
      expect(localWebContainers).toHaveLength(1);

      const dockerRunningContainers = await dockerDriver.listContainers({
        sessionId,
        status: "running",
      });
      const localRunningContainers = await localDriver.listContainers({
        sessionId,
        status: "running",
      });

      expect(dockerRunningContainers).toHaveLength(labels.length);
      expect(localRunningContainers).toHaveLength(labels.length);

      await Promise.all(
        dockerContainers.map(container => dockerDriver.stopContainer(container.id))
      );
      await Promise.all(
        localContainers.map(container => localDriver.stopContainer(container.id))
      );
      await Promise.all(
        dockerContainers.map(container => dockerDriver.removeContainer(container.id))
      );
      await Promise.all(
        localContainers.map(container => localDriver.removeContainer(container.id))
      );
    });
  });

  describe("Resource Management Comparison", () => {
    it("should compare volume management capabilities", async () => {
      const volumeConfig = {
        name: "test-volume-comparison",
        driver: "local",
        labels: { test: "comparison" },
      };

      const dockerVolume = await dockerDriver.createVolume(volumeConfig);
      const localVolume = await localDriver.createVolume(volumeConfig);

      expect(dockerVolume.name).toBe(volumeConfig.name);
      expect(localVolume.name).toBe(volumeConfig.name);
      expect(dockerVolume.driver).toBe(volumeConfig.driver);
      expect(localVolume.driver).toBe(volumeConfig.driver);

      await dockerDriver.removeVolume(dockerVolume.id);
      await localDriver.removeVolume(localVolume.id);
    });

    it("should compare resource allocation and deallocation", async () => {
      const sessionId = "test-resource-allocation";
      const resourceConfigs = [
        createResourceLimits({ cpu: 0.5, memory: 256, disk: 512, pids: 50 }),
        createResourceLimits({ cpu: 1.0, memory: 512, disk: 1024, pids: 100 }),
        createResourceLimits({ cpu: 1.5, memory: 768, disk: 1536, pids: 150 }),
      ];

      const dockerContainers = [];
      const localContainers = [];

      for (const resources of resourceConfigs) {
        const config = createDriverConfig({
          sessionId,
          image: "nginx:alpine",
          resources,
        });

        const dockerContainer = await dockerDriver.createContainer(config);
        const localContainer = await localDriver.createContainer(config);

        dockerContainers.push(dockerContainer);
        localContainers.push(localContainer);
      }

      const dockerHealth = await dockerDriver.healthCheck();
      const localHealth = await localDriver.healthCheck();

      expect(dockerHealth.containers.total).toBe(resourceConfigs.length);
      expect(localHealth.containers.total).toBe(resourceConfigs.length);

      await Promise.all(
        dockerContainers.map(container => dockerDriver.stopContainer(container.id))
      );
      await Promise.all(
        localContainers.map(container => localDriver.stopContainer(container.id))
      );
      await Promise.all(
        dockerContainers.map(container => dockerDriver.removeContainer(container.id))
      );
      await Promise.all(
        localContainers.map(container => localDriver.removeContainer(container.id))
      );

      const dockerFinalHealth = await dockerDriver.healthCheck();
      const localFinalHealth = await localDriver.healthCheck();

      expect(dockerFinalHealth.containers.total).toBe(0);
      expect(localFinalHealth.containers.total).toBe(0);
    });
  });

  describe("Interface Compliance", () => {
    it("should verify both drivers implement all required methods", () => {
      const requiredMethods = [
        "createContainer",
        "startContainer",
        "stopContainer",
        "removeContainer",
        "getContainer",
        "listContainers",
        "getContainerLogs",
        "healthCheck",
        "isContainerHealthy",
        "createVolume",
        "removeVolume",
        "createNetwork",
        "removeNetwork",
      ];

      for (const method of requiredMethods) {
        expect(typeof dockerDriver[method]).toBe("function");
        expect(typeof localDriver[method]).toBe("function");
      }
    });

    it("should verify both drivers have required properties", () => {
      expect(dockerDriver.name).toBe("mock-docker");
      expect(localDriver.name).toBe("mock-local");
      expect(typeof dockerDriver.version).toBe("string");
      expect(typeof localDriver.version).toBe("string");
    });

    it("should verify method signatures are consistent", async () => {
      const config = createDriverConfig({
        sessionId: "test-signatures",
        image: "nginx:alpine",
      });

      const dockerContainer = await dockerDriver.createContainer(config);
      const localContainer = await localDriver.createContainer(config);

      expect(typeof dockerContainer.id).toBe("string");
      expect(typeof localContainer.id).toBe("string");
      expect(typeof dockerContainer.name).toBe("string");
      expect(typeof localContainer.name).toBe("string");
      expect(typeof dockerContainer.sessionId).toBe("string");
      expect(typeof localContainer.sessionId).toBe("string");

      const dockerHealth = await dockerDriver.healthCheck();
      const localHealth = await localDriver.healthCheck();

      expect(dockerHealth).toHaveProperty("status");
      expect(localHealth).toHaveProperty("status");
      expect(dockerHealth).toHaveProperty("version");
      expect(localHealth).toHaveProperty("version");
      expect(dockerHealth).toHaveProperty("uptime");
      expect(localHealth).toHaveProperty("uptime");
      expect(dockerHealth).toHaveProperty("containers");
      expect(localHealth).toHaveProperty("containers");

      await dockerDriver.removeContainer(dockerContainer.id);
      await localDriver.removeContainer(localContainer.id);
    });
  });
});