export class DriverError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "DriverError";
  }
}

export class ContainerNotFoundError extends DriverError {
  constructor(containerId: string) {
    super(`Container ${containerId} not found`, "CONTAINER_NOT_FOUND", false);
  }
}

export class ContainerCreationError extends DriverError {
  constructor(
    message: string,
    public readonly details?: any
  ) {
    super(message, "CONTAINER_CREATION_FAILED", true);
  }
}

export class ContainerStartError extends DriverError {
  constructor(containerId: string, message: string) {
    super(
      `Failed to start container ${containerId}: ${message}`,
      "CONTAINER_START_FAILED",
      true
    );
  }
}

export class ContainerStopError extends DriverError {
  constructor(containerId: string, message: string) {
    super(
      `Failed to stop container ${containerId}: ${message}`,
      "CONTAINER_STOP_FAILED",
      true
    );
  }
}

export class ContainerRemoveError extends DriverError {
  constructor(containerId: string, message: string) {
    super(
      `Failed to remove container ${containerId}: ${message}`,
      "CONTAINER_REMOVE_FAILED",
      false
    );
  }
}

export class VolumeCreationError extends DriverError {
  constructor(volumeName: string, message: string) {
    super(
      `Failed to create volume ${volumeName}: ${message}`,
      "VOLUME_CREATION_FAILED",
      true
    );
  }
}

export class VolumeNotFoundError extends DriverError {
  constructor(volumeId: string) {
    super(`Volume ${volumeId} not found`, "VOLUME_NOT_FOUND", false);
  }
}

export class VolumeRemoveError extends DriverError {
  constructor(volumeId: string, message: string) {
    super(
      `Failed to remove volume ${volumeId}: ${message}`,
      "VOLUME_REMOVE_FAILED",
      false
    );
  }
}

export class NetworkCreationError extends DriverError {
  constructor(networkName: string, message: string) {
    super(
      `Failed to create network ${networkName}: ${message}`,
      "NETWORK_CREATION_FAILED",
      true
    );
  }
}

export class NetworkNotFoundError extends DriverError {
  constructor(networkId: string) {
    super(`Network ${networkId} not found`, "NETWORK_NOT_FOUND", false);
  }
}

export class NetworkRemoveError extends DriverError {
  constructor(networkId: string, message: string) {
    super(
      `Failed to remove network ${networkId}: ${message}`,
      "NETWORK_REMOVE_FAILED",
      false
    );
  }
}

export class DriverHealthError extends DriverError {
  constructor(message: string) {
    super(
      `Driver health check failed: ${message}`,
      "DRIVER_HEALTH_CHECK_FAILED",
      false
    );
  }
}

export class ResourceLimitError extends DriverError {
  constructor(resource: string, limit: number, requested: number) {
    super(
      `Resource limit exceeded for ${resource}: requested ${requested}, limit ${limit}`,
      "RESOURCE_LIMIT_EXCEEDED",
      false
    );
  }
}

export class AuthenticationError extends DriverError {
  constructor(message: string) {
    super(`Authentication failed: ${message}`, "AUTHENTICATION_FAILED", false);
  }
}

export class AuthorizationError extends DriverError {
  constructor(message: string) {
    super(`Authorization failed: ${message}`, "AUTHORIZATION_FAILED", false);
  }
}

export class ConfigurationError extends DriverError {
  constructor(message: string) {
    super(`Configuration error: ${message}`, "CONFIGURATION_ERROR", false);
  }
}

export class TimeoutError extends DriverError {
  constructor(operation: string, timeout: number) {
    super(
      `Operation ${operation} timed out after ${timeout}ms`,
      "TIMEOUT_ERROR",
      true
    );
  }
}

export class NetworkError extends DriverError {
  constructor(message: string) {
    super(`Network error: ${message}`, "NETWORK_ERROR", true);
  }
}

export class FileSystemError extends DriverError {
  constructor(message: string) {
    super(`File system error: ${message}`, "FILE_SYSTEM_ERROR", false);
  }
}

export function isDriverError(error: unknown): error is DriverError {
  return error instanceof DriverError;
}

export function isRetryableError(error: unknown): boolean {
  return isDriverError(error) && error.retryable;
}

export function getErrorCode(error: unknown): string | undefined {
  return isDriverError(error) ? error.code : undefined;
}

export function getErrorMessage(error: unknown): string {
  if (isDriverError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
