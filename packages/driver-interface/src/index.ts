export {
  AuthenticationError,
  AuthorizationError,
  ConfigurationError,
  ContainerCreationError,
  ContainerNotFoundError,
  ContainerRemoveError,
  ContainerStartError,
  ContainerStopError,
  DriverError,
  DriverHealthError,
  FileSystemError,
  getErrorCode,
  getErrorMessage,
  isDriverError,
  isRetryableError,
  NetworkCreationError,
  NetworkError,
  NetworkNotFoundError,
  NetworkRemoveError,
  ResourceLimitError,
  TimeoutError,
  VolumeCreationError,
  VolumeNotFoundError,
  VolumeRemoveError,
} from "./errors";

export {
  type ContainerConfig,
  ContainerConfigSchema,
  type ContainerDriver,
  type ContainerStatus,
  ContainerStatusSchema,
  type DriverHealth,
  type NetworkConfig,
  type ResourceLimits,
  ResourceLimitsSchema,
  type SecurityOptions,
  SecurityOptionsSchema,
  type VolumeConfig,
} from "./types";

export const DRIVER_INTERFACE_VERSION = "1.0.0";

const DEFAULT_CPU_LIMIT = 0.5;
const DEFAULT_MEMORY_LIMIT = 512;
const DEFAULT_DISK_LIMIT = 1024;
const DEFAULT_PIDS_LIMIT = 100;

import {
  type ContainerConfig,
  ContainerConfigSchema,
  type ResourceLimits,
  ResourceLimitsSchema,
  type SecurityOptions,
  SecurityOptionsSchema,
} from "./types";

export function createDriverConfig(
  config: Partial<ContainerConfig>
): ContainerConfig {
  return {
    sessionId: config.sessionId || "",
    image: config.image || "",
    command: config.command || [],
    env: config.env || {},
    labels: config.labels || {},
    resources: config.resources || {
      cpu: DEFAULT_CPU_LIMIT,
      memory: DEFAULT_MEMORY_LIMIT,
      disk: DEFAULT_DISK_LIMIT,
      pids: DEFAULT_PIDS_LIMIT,
    },
    volumes: config.volumes || [],
    network: config.network || "openagent-network",
    security: config.security || {
      readOnly: true,
      noNewPrivileges: true,
      user: "openagent",
      capabilities: {
        drop: ["ALL"],
        add: [],
      },
    },
  };
}

export function createResourceLimits(
  limits: Partial<ResourceLimits>
): ResourceLimits {
  return {
    cpu: limits.cpu || DEFAULT_CPU_LIMIT,
    memory: limits.memory || DEFAULT_MEMORY_LIMIT,
    disk: limits.disk || DEFAULT_DISK_LIMIT,
    pids: limits.pids || DEFAULT_PIDS_LIMIT,
  };
}

export function createSecurityOptions(
  options: Partial<SecurityOptions>
): SecurityOptions {
  return {
    readOnly: options.readOnly ?? true,
    noNewPrivileges: options.noNewPrivileges ?? true,
    user: options.user || "openagent",
    capabilities: options.capabilities || {
      drop: ["ALL"],
      add: [],
    },
  };
}

export function validateContainerConfig(config: ContainerConfig): boolean {
  try {
    ContainerConfigSchema.parse(config);
    return true;
  } catch {
    return false;
  }
}

export function validateResourceLimits(limits: ResourceLimits): boolean {
  try {
    ResourceLimitsSchema.parse(limits);
    return true;
  } catch {
    return false;
  }
}

export function validateSecurityOptions(options: SecurityOptions): boolean {
  try {
    SecurityOptionsSchema.parse(options);
    return true;
  } catch {
    return false;
  }
}
