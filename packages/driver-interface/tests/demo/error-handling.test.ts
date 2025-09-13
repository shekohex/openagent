import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockDockerDriver } from "../mocks/mock-docker-driver";
import { MockLocalDriver } from "../mocks/mock-local-driver";
import { createDriverConfig, createResourceLimits } from "../../src";
import {
  DriverError,
  ContainerNotFoundError,
  ContainerCreationError,
  ContainerStartError,
  ContainerStopError,
  ContainerRemoveError,
  VolumeCreationError,
  VolumeNotFoundError,
  VolumeRemoveError,
  NetworkCreationError,
  NetworkNotFoundError,
  NetworkRemoveError,
  DriverHealthError,
  ResourceLimitError,
  AuthenticationError,
  AuthorizationError,
  ConfigurationError,
  TimeoutError,
  NetworkError,
  FileSystemError,
  isDriverError,
  isRetryableError,
  getErrorCode,
  getErrorMessage
} from "../../src";

describe("Error Handling Demonstration Tests", () => {
  let dockerDriver: MockDockerDriver;
  let localDriver: MockLocalDriver;

  beforeEach(() => {
    dockerDriver = new MockDockerDriver();
    localDriver = new MockLocalDriver();
  });

  describe("Driver Error Type Usage", () => {
    it("should demonstrate ContainerNotFoundError handling", async () => {
      const nonExistentId = "container-does-not-exist";

      try {
        await dockerDriver.removeContainer(nonExistentId); // removeContainer throws the error
        expect.fail("Should have thrown ContainerNotFoundError");
      } catch (error) {
        expect(isDriverError(error)).toBe(true);
        expect(error).toBeInstanceOf(ContainerNotFoundError);
        expect(getErrorCode(error)).toBe("CONTAINER_NOT_FOUND");
        expect(getErrorMessage(error)).toContain(nonExistentId);
        expect(isRetryableError(error)).toBe(false);
      }
    });

    it("should demonstrate ResourceLimitError handling", async () => {
      const config = createDriverConfig({
        sessionId: "test-resource-limit",
        image: "busybox:latest",
        resources: createResourceLimits({
          cpu: 10, // Exceeds limit
          memory: 1024,
          disk: 2048,
          pids: 100,
        }),
      });

      try {
        await dockerDriver.createContainer(config);
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(isDriverError(error)).toBe(true);
        expect(error).toBeInstanceOf(ResourceLimitError);
        expect(getErrorCode(error)).toBe("RESOURCE_LIMIT_EXCEEDED");
        expect(getErrorMessage(error)).toContain("cpu");
        expect(isRetryableError(error)).toBe(false);
      }
    });

    it("should demonstrate ContainerStopError with timeout validation", async () => {
      const config = createDriverConfig({
        sessionId: "test-stop-timeout",
        image: "nginx:alpine",
      });

      const container = await dockerDriver.createContainer(config);
      await dockerDriver.startContainer(container.id);

      try {
        await dockerDriver.stopContainer(container.id, { timeout: 1000 }); // Too short
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(isDriverError(error)).toBe(true);
        expect(error).toBeInstanceOf(ContainerStopError);
        expect(getErrorCode(error)).toBe("CONTAINER_STOP_FAILED");
        expect(getErrorMessage(error)).toContain("Timeout too short");
        expect(isRetryableError(error)).toBe(true);
      }
    });

    it("should demonstrate ContainerRemoveError on running container", async () => {
      const config = createDriverConfig({
        sessionId: "test-remove-running",
        image: "nginx:alpine",
      });

      const container = await dockerDriver.createContainer(config);
      await dockerDriver.startContainer(container.id);

      try {
        await dockerDriver.removeContainer(container.id);
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(isDriverError(error)).toBe(true);
        expect(error).toBeInstanceOf(ContainerRemoveError);
        expect(getErrorCode(error)).toBe("CONTAINER_REMOVE_FAILED");
        expect(getErrorMessage(error)).toContain("Cannot remove running container");
        expect(isRetryableError(error)).toBe(false);
      }
    });
  });

  describe("Retry Logic Implementation", () => {
    it("should demonstrate retry logic for retryable errors", async () => {
      const config = createDriverConfig({
        sessionId: "test-retryable",
        image: "nginx:alpine",
      });

      let attemptCount = 0;
      let container = null;

      const maxRetries = 3;
      const retryDelay = 100;

      while (attemptCount < maxRetries) {
        try {
          container = await dockerDriver.createContainer(config);
          break; // Success
        } catch (error) {
          attemptCount++;
          if (attemptCount < maxRetries && isRetryableError(error)) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          throw error; // Re-throw if not retryable or max retries reached
        }
      }

      expect(container).not.toBeNull();
      expect(container!.id).toBeDefined();
      expect(attemptCount).toBe(0); // Should succeed on first attempt
    });

    it("should demonstrate exponential backoff retry strategy", async () => {
      const config = createDriverConfig({
        sessionId: "test-exponential-backoff",
        image: "nginx:alpine",
      });

      const maxRetries = 3;
      const baseDelay = 100;
      let attemptCount = 0;

      while (attemptCount < maxRetries) {
        try {
          await dockerDriver.createContainer(config);
          break;
        } catch (error) {
          attemptCount++;
          if (attemptCount < maxRetries && isRetryableError(error)) {
            const delay = baseDelay * Math.pow(2, attemptCount - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw error;
        }
      }

      expect(attemptCount).toBe(0); // Should succeed on first attempt
    });
  });

  describe("Error Recovery Strategies", () => {
    it("should demonstrate fallback to alternative driver", async () => {
      const config = createDriverConfig({
        sessionId: "test-fallback",
        image: "nginx:alpine",
      });

      let primarySuccess = false;
      let fallbackSuccess = false;
      let lastError = null;

      try {
        const container = await dockerDriver.createContainer(config);
        await dockerDriver.startContainer(container.id);
        primarySuccess = true;
      } catch (error) {
        lastError = error;
        try {
          const fallbackContainer = await localDriver.createContainer(config);
          await localDriver.startContainer(fallbackContainer.id);
          fallbackSuccess = true;
        } catch (fallbackError) {
          lastError = fallbackError;
        }
      }

      expect(primarySuccess || fallbackSuccess).toBe(true);
      if (!primarySuccess && !fallbackSuccess) {
        expect(lastError).toBeInstanceOf(DriverError);
      }
    });

    it("should demonstrate graceful degradation with partial functionality", async () => {
      const sessionId = "test-graceful-degradation";
      const containers = [];

      const configs = [
        createDriverConfig({ sessionId, image: "nginx:alpine" }),
        createDriverConfig({ sessionId, image: "postgres:15" }),
        createDriverConfig({ sessionId, image: "redis:7" }),
      ];

      let successCount = 0;
      const errors: DriverError[] = [];

      for (const config of configs) {
        try {
          const container = await dockerDriver.createContainer(config);
          await dockerDriver.startContainer(container.id);
          containers.push(container);
          successCount++;
        } catch (error) {
          if (isDriverError(error)) {
            errors.push(error);
          }
        }
      }

      expect(successCount).toBeGreaterThan(0);
      expect(successCount + errors.length).toBe(configs.length);

      if (errors.length > 0) {
        expect(containers.length).toBeLessThan(configs.length);
      }
    });
  });

  describe("Error Logging and Reporting", () => {
    it("should demonstrate structured error logging", async () => {
      const mockConsole = {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
      };

      const config = createDriverConfig({
        sessionId: "test-logging",
        image: "nginx:alpine",
      });

      try {
        await dockerDriver.getContainer("non-existent-container");
      } catch (error) {
        if (isDriverError(error)) {
          const errorLog = {
            timestamp: new Date().toISOString(),
            level: "error",
            code: getErrorCode(error),
            message: getErrorMessage(error),
            retryable: isRetryableError(error),
            stack: error.stack,
            context: {
              operation: "getContainer",
              containerId: "non-existent-container",
              driver: dockerDriver.name,
            },
          };

          mockConsole.error(JSON.stringify(errorLog, null, 2));
          expect(mockConsole.error).toHaveBeenCalled();
        }
      }
    });

    it("should demonstrate error aggregation and reporting", async () => {
      const sessionId = "test-error-aggregation";
      const errors: Array<{
        operation: string;
        error: DriverError;
        timestamp: number;
      }> = [];

      const operations = [
        () => dockerDriver.getContainer("non-existent-1"),
        () => dockerDriver.getContainer("non-existent-2"),
        () => dockerDriver.removeContainer("non-existent-3"),
      ];

      for (const operation of operations) {
        try {
          await operation();
        } catch (error) {
          if (isDriverError(error)) {
            errors.push({
              operation: operation.name,
              error,
              timestamp: Date.now(),
            });
          }
        }
      }

      expect(errors.length).toBeGreaterThan(0);

      const errorReport = {
        totalErrors: errors.length,
        errorTypes: [...new Set(errors.map(e => getErrorCode(e)))],
        retryableErrors: errors.filter(e => isRetryableError(e.error)).length,
        driver: dockerDriver.name,
        timestamp: Date.now(),
      };

      expect(errorReport.totalErrors).toBe(errors.length);
      expect(errorReport.errorTypes.length).toBeGreaterThan(0);
    });
  });

  describe("User-Friendly Error Messages", () => {
    it("should demonstrate user-facing error transformation", async () => {
      const config = createDriverConfig({
        sessionId: "test-user-friendly",
        image: "nginx:alpine",
      });

      try {
        await dockerDriver.getContainer("missing-container");
      } catch (error) {
        const userMessage = transformErrorForUser(error);
        expect(userMessage).toContain("container");
        expect(userMessage).not.toContain("ContainerNotFoundError");
        expect(userMessage).toMatch(/^[A-Z]/); // Should start with capital letter
      }
    });

    it("should demonstrate localized error messages", async () => {
      const config = createDriverConfig({
        sessionId: "test-localization",
        image: "nginx:alpine",
      });

      try {
        await dockerDriver.getContainer("container-not-found");
      } catch (error) {
        const localizedMessage = getLocalizedErrorMessage(error, "es");
        expect(typeof localizedMessage).toBe("string");
        expect(localizedMessage.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Cross-Driver Error Consistency", () => {
    it("should demonstrate consistent error handling across drivers", async () => {
      const config = createDriverConfig({
        sessionId: "test-cross-driver-errors",
        image: "nginx:alpine",
      });

      const dockerContainer = await dockerDriver.createContainer(config);
      const localContainer = await localDriver.createContainer(config);

      await dockerDriver.startContainer(dockerContainer.id);
      await localDriver.startContainer(localContainer.id);

      const dockerError = await simulateDriverError(dockerDriver, dockerContainer.id);
      const localError = await simulateDriverError(localDriver, localContainer.id);

      expect(dockerError).toBeInstanceOf(DriverError);
      expect(localError).toBeInstanceOf(DriverError);

      expect(isDriverError(dockerError)).toBe(true);
      expect(isDriverError(localError)).toBe(true);

      const dockerCode = getErrorCode(dockerError);
      const localCode = getErrorCode(localError);

      expect(dockerCode).toBeDefined();
      expect(localCode).toBeDefined();
    });

    it("should demonstrate driver-specific error handling", async () => {
      const highResourceConfig = createDriverConfig({
        sessionId: "test-driver-specific",
        image: "nginx:alpine",
        resources: createResourceLimits({
          cpu: 5, // Exceeds Docker limit (4) and Local limit (2)
          memory: 1024,
          disk: 2048,
          pids: 100,
        }),
      });

      let dockerThrew = false;
      let localThrew = false;

      try {
        await dockerDriver.createContainer(highResourceConfig);
      } catch (error) {
        dockerThrew = isDriverError(error) && getErrorCode(error) === "RESOURCE_LIMIT_EXCEEDED";
      }

      try {
        await localDriver.createContainer(highResourceConfig);
      } catch (error) {
        localThrew = isDriverError(error) && getErrorCode(error) === "RESOURCE_LIMIT_EXCEEDED";
      }

      expect(dockerThrew).toBe(true);
      expect(localThrew).toBe(true); // Both should throw since CPU limit is 5 > 2 for local
    });
  });

  describe("Error Prevention and Validation", () => {
    it("should demonstrate pre-operation validation", async () => {
      const invalidConfigs = [
        createDriverConfig({
          sessionId: "test-validation",
          image: "nginx:alpine",
          resources: createResourceLimits({
            cpu: 10, // Exceeds Docker limit
            memory: 1024,
            disk: 2048,
            pids: 100,
          }),
        }),
        createDriverConfig({
          sessionId: "test-validation-2",
          image: "nginx:alpine",
        }),
      ];

      for (const config of invalidConfigs) {
        try {
          if (config.resources.cpu > 4) {
            await dockerDriver.createContainer(config);
            expect.fail("Should have thrown an error for invalid config");
          } else {
            // This should succeed
            await dockerDriver.createContainer(config);
          }
        } catch (error) {
          expect(isDriverError(error)).toBe(true);
        }
      }
    });

    it("should demonstrate circuit breaker pattern", async () => {
      const circuitBreaker = {
        failures: 0,
        lastFailure: 0,
        threshold: 3,
        timeout: 5000,
        isOpen: false,
      };

      const testOperation = async () => {
        if (circuitBreaker.isOpen) {
          throw new Error("Circuit breaker is open");
        }

        try {
          await dockerDriver.removeContainer("non-existent"); // This will throw
        } catch (error) {
          circuitBreaker.failures++;
          circuitBreaker.lastFailure = Date.now();

          if (circuitBreaker.failures >= circuitBreaker.threshold) {
            circuitBreaker.isOpen = true;
          }
          throw error;
        }
      };

      let circuitBreakerOpened = false;

      for (let i = 0; i < circuitBreaker.threshold + 1; i++) {
        try {
          await testOperation();
        } catch (error) {
          if (i < circuitBreaker.threshold) {
            expect(isDriverError(error)).toBe(true);
          } else {
            expect(error.message).toBe("Circuit breaker is open");
            circuitBreakerOpened = true;
          }
        }
      }

      expect(circuitBreakerOpened).toBe(true);
      expect(circuitBreaker.isOpen).toBe(true);
    });
  });
});

async function simulateDriverError(driver: MockDockerDriver | MockLocalDriver, containerId: string): Promise<DriverError> {
  try {
    await driver.removeContainer(containerId);
    throw new Error("Expected error");
  } catch (error) {
    if (error instanceof DriverError) {
      return error;
    }
    throw new Error("Unexpected error type");
  }
}

function transformErrorForUser(error: unknown): string {
  if (error instanceof ContainerNotFoundError) {
    return "The requested container could not be found. Please check the container ID and try again.";
  }
  if (error instanceof ResourceLimitError) {
    return "The requested operation exceeds available resource limits. Please reduce your resource requirements.";
  }
  if (error instanceof ContainerStopError) {
    return "Failed to stop the container. Please try again or contact support.";
  }
  return "An unexpected error occurred. Please try again.";
}

function getLocalizedErrorMessage(error: unknown, locale: string): string {
  if (locale === "es") {
    if (error instanceof ContainerNotFoundError) {
      return "El contenedor solicitado no pudo ser encontrado. Verifique el ID del contenedor e inténtelo de nuevo.";
    }
    if (error instanceof ResourceLimitError) {
      return "La operación solicitada excede los límites de recursos disponibles. Reduzca sus requisitos de recursos.";
    }
  }

  return getErrorMessage(error);
}