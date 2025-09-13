import { z } from "zod";

export type ContainerDriver = {
  readonly name: string;
  readonly version: string;

  createContainer(config: ContainerConfig): Promise<ContainerInstance>;
  startContainer(id: string): Promise<void>;
  stopContainer(id: string, options?: StopOptions): Promise<void>;
  removeContainer(id: string): Promise<void>;

  getContainer(id: string): Promise<ContainerInstance | null>;
  listContainers(filter?: ContainerFilter): Promise<ContainerInstance[]>;
  getContainerLogs(id: string, options?: LogOptions): Promise<string>;

  healthCheck(): Promise<DriverHealth>;
  isContainerHealthy(id: string): Promise<boolean>;

  createVolume(config: VolumeConfig): Promise<Volume>;
  removeVolume(id: string): Promise<void>;
  createNetwork(config: NetworkConfig): Promise<Network>;
  removeNetwork(id: string): Promise<void>;
};

export type ContainerConfig = {
  sessionId: string;
  image: string;
  command?: string[];
  env: Record<string, string>;
  labels: Record<string, string>;
  resources: ResourceLimits;
  volumes: VolumeMount[];
  network: string;
  security: SecurityOptions;
};

export type ResourceLimits = {
  cpu: number;
  memory: number;
  disk: number;
  pids: number;
};

export type SecurityOptions = {
  readOnly: boolean;
  noNewPrivileges: boolean;
  user: string;
  capabilities: {
    drop: string[];
    add: string[];
  };
};

export type VolumeMount = {
  source: string;
  target: string;
  readOnly?: boolean;
  type?: "bind" | "volume";
};

export type ContainerInstance = {
  id: string;
  name: string;
  sessionId: string;
  image: string;
  status: ContainerStatus;
  state: ContainerState;
  endpoint: string;
  createdAt: number;
  startedAt?: number;
  labels: Record<string, string>;
  resources: ResourceLimits;
};

export type ContainerStatus =
  | "created"
  | "running"
  | "paused"
  | "stopped"
  | "removing"
  | "exited"
  | "dead";
export type ContainerState = "running" | "terminated" | "error";

export type ContainerFilter = {
  sessionId?: string;
  status?: ContainerStatus;
  state?: ContainerState;
  label?: Record<string, string>;
};

export type StopOptions = {
  timeout?: number;
  force?: boolean;
};

export type LogOptions = {
  follow?: boolean;
  tail?: number;
  since?: number;
  timestamps?: boolean;
};

export type DriverHealth = {
  status: "healthy" | "unhealthy";
  version: string;
  uptime: number;
  containers: {
    total: number;
    running: number;
    stopped: number;
  };
  error?: string;
};

export type VolumeConfig = {
  name: string;
  driver?: string;
  labels?: Record<string, string>;
};

export type Volume = {
  id: string;
  name: string;
  driver: string;
  mountpoint: string;
  createdAt: number;
  labels: Record<string, string>;
};

export type NetworkConfig = {
  name: string;
  driver?: string;
  labels?: Record<string, string>;
  options?: Record<string, string>;
};

export type Network = {
  id: string;
  name: string;
  driver: string;
  createdAt: number;
  labels: Record<string, string>;
};

export const ContainerConfigSchema = z.object({
  sessionId: z.string(),
  image: z.string(),
  command: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()),
  labels: z.record(z.string(), z.string()),
  resources: z.object({
    cpu: z.number().min(0),
    memory: z.number().min(1),
    disk: z.number().min(1),
    pids: z.number().min(1),
  }),
  volumes: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      readOnly: z.boolean().optional(),
      type: z.enum(["bind", "volume"]).optional(),
    })
  ),
  network: z.string(),
  security: z.object({
    readOnly: z.boolean(),
    noNewPrivileges: z.boolean(),
    user: z.string(),
    capabilities: z.object({
      drop: z.array(z.string()),
      add: z.array(z.string()),
    }),
  }),
});

export const ResourceLimitsSchema = z.object({
  cpu: z.number().min(0),
  memory: z.number().min(1),
  disk: z.number().min(1),
  pids: z.number().min(1),
});

export const SecurityOptionsSchema = z.object({
  readOnly: z.boolean(),
  noNewPrivileges: z.boolean(),
  user: z.string(),
  capabilities: z.object({
    drop: z.array(z.string()),
    add: z.array(z.string()),
  }),
});

export const ContainerStatusSchema = z.enum([
  "created",
  "running",
  "paused",
  "stopped",
  "removing",
  "exited",
  "dead",
]);
export const ContainerStateSchema = z.enum(["running", "terminated", "error"]);
