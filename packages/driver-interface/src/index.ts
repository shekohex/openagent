export * from "./errors";
export * from "./types";

export const DRIVER_INTERFACE_VERSION = "1.0.0";

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
      cpu: 0.5,
      memory: 512,
      disk: 1024,
      pids: 100,
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
    cpu: limits.cpu || 0.5,
    memory: limits.memory || 512,
    disk: limits.disk || 1024,
    pids: limits.pids || 100,
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
