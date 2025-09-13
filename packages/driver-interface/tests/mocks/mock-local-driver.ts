import {
  type ContainerConfig,
  ContainerCreationError,
  type ContainerDriver,
  type ContainerFilter,
  type ContainerInstance,
  ContainerNotFoundError,
  ContainerRemoveError,
  ContainerStopError,
  type DriverHealth,
  type LogOptions,
  type Network,
  type NetworkConfig,
  NetworkNotFoundError,
  ResourceLimitError,
  type StopOptions,
  type Volume,
  type VolumeConfig,
  VolumeNotFoundError,
} from "../../src";

export class MockLocalDriver implements ContainerDriver {
  readonly name = "mock-local";
  readonly version = "1.0.0";

  // Constants for mock behavior - different from Docker to show driver variation
  private readonly CREATE_DELAY_MS = 200;
  private readonly MAX_CPU_CORES = 2;
  private readonly START_DELAY_MS = 300;
  private readonly STOP_DELAY_MS = 200;
  private readonly MIN_STOP_TIMEOUT_MS = 8000;
  private readonly REMOVE_DELAY_MS = 100;
  private readonly HEALTH_CHECK_DELAY_MS = 20;
  private readonly IS_CONTAINER_HEALTHY_DELAY_MS = 40;
  private readonly CREATE_VOLUME_DELAY_MS = 150;
  private readonly REMOVE_VOLUME_DELAY_MS = 120;
  private readonly CREATE_NETWORK_DELAY_MS = 130;
  private readonly REMOVE_NETWORK_DELAY_MS = 100;
  private readonly GET_LOGS_DELAY_MS = 50;
  private readonly DEFAULT_LOG_TAIL = 100;
  private readonly DEFAULT_TIMEOUT_MS = 15_000;
  private readonly LOG_DELAY_ADDITION = 30;
  private readonly MAX_MOCK_LOG_LINES = 5;

  private readonly containers = new Map<string, ContainerInstance>();
  private readonly volumes = new Map<string, Volume>();
  private readonly networks = new Map<string, Network>();
  private nextId = 1;
  private startTime = Date.now();

  async createContainer(config: ContainerConfig): Promise<ContainerInstance> {
    await this.simulateDelay(this.CREATE_DELAY_MS);

    const id = `local-${this.nextId++}`;
    const name = `${config.sessionId}-local`;

    if (config.resources.cpu > this.MAX_CPU_CORES) {
      throw new ResourceLimitError(
        "cpu",
        this.MAX_CPU_CORES,
        config.resources.cpu
      );
    }

    if (config.security.readOnly && config.volumes.some((v) => !v.readOnly)) {
      throw new ContainerCreationError(
        "Cannot mount writable volumes in read-only container"
      );
    }

    const container: ContainerInstance = {
      id,
      name,
      sessionId: config.sessionId,
      image: config.image,
      status: "created",
      state: "terminated",
      endpoint: `http://localhost:8081/containers/${id}`,
      createdAt: Date.now(),
      labels: config.labels,
      resources: config.resources,
    };

    this.containers.set(id, container);
    return container;
  }

  async startContainer(id: string): Promise<void> {
    await this.simulateDelay(this.START_DELAY_MS);

    const container = this.containers.get(id);
    if (!container) {
      throw new ContainerNotFoundError(id);
    }

    if (container.status === "running") {
      return;
    }

    container.status = "running";
    container.state = "running";
    container.startedAt = Date.now();
    this.containers.set(id, container);
  }

  async stopContainer(id: string, options?: StopOptions): Promise<void> {
    await this.simulateDelay(this.STOP_DELAY_MS);

    const container = this.containers.get(id);
    if (!container) {
      throw new ContainerNotFoundError(id);
    }

    if (container.status === "stopped") {
      return;
    }

    const timeout = options?.timeout || this.DEFAULT_TIMEOUT_MS;
    const force = options?.force;

    if (!force && timeout < this.MIN_STOP_TIMEOUT_MS) {
      throw new ContainerStopError(id, "Timeout too short for graceful stop");
    }

    container.status = "stopped";
    container.state = "terminated";
    this.containers.set(id, container);
  }

  async removeContainer(id: string): Promise<void> {
    await this.simulateDelay(this.REMOVE_DELAY_MS);

    const container = this.containers.get(id);
    if (!container) {
      throw new ContainerNotFoundError(id);
    }

    if (container.status === "running") {
      throw new ContainerRemoveError(id, "Cannot remove running container");
    }

    this.containers.delete(id);
  }

  async getContainer(id: string): Promise<ContainerInstance | null> {
    await this.simulateDelay(this.IS_CONTAINER_HEALTHY_DELAY_MS);
    return this.containers.get(id) || null;
  }

  async listContainers(filter?: ContainerFilter): Promise<ContainerInstance[]> {
    await this.simulateDelay(this.GET_LOGS_DELAY_MS + 10);

    let containers = Array.from(this.containers.values());

    if (filter) {
      if (filter.sessionId) {
        containers = containers.filter((c) => c.sessionId === filter.sessionId);
      }
      if (filter.status) {
        containers = containers.filter((c) => c.status === filter.status);
      }
      if (filter.state) {
        containers = containers.filter((c) => c.state === filter.state);
      }
      if (filter.label) {
        containers = containers.filter((c) =>
          Object.entries(filter.label || {}).every(
            ([key, value]) => c.labels[key] === value
          )
        );
      }
    }

    return containers;
  }

  async getContainerLogs(id: string, options?: LogOptions): Promise<string> {
    await this.simulateDelay(this.GET_LOGS_DELAY_MS + this.LOG_DELAY_ADDITION);

    const container = this.containers.get(id);
    if (!container) {
      throw new ContainerNotFoundError(id);
    }

    const tail = options?.tail || this.DEFAULT_LOG_TAIL;
    const timestamps = options?.timestamps;

    const mockLogs = Array.from(
      { length: Math.min(tail, this.MAX_MOCK_LOG_LINES) },
      (_, i) => {
        const timestamp = timestamps ? `[${new Date().toISOString()}] ` : "";
        return `${timestamp}Local log line ${i + 1} from container ${id}`;
      }
    ).join("\n");

    return mockLogs;
  }

  async healthCheck(): Promise<DriverHealth> {
    await this.simulateDelay(this.HEALTH_CHECK_DELAY_MS);

    const runningContainers = Array.from(this.containers.values()).filter(
      (c) => c.status === "running"
    ).length;
    const stoppedContainers = Array.from(this.containers.values()).filter(
      (c) => c.status === "stopped"
    ).length;

    return {
      status: "healthy",
      version: this.version,
      uptime: Date.now() - this.startTime,
      containers: {
        total: this.containers.size,
        running: runningContainers,
        stopped: stoppedContainers,
      },
    };
  }

  async isContainerHealthy(id: string): Promise<boolean> {
    await this.simulateDelay(this.IS_CONTAINER_HEALTHY_DELAY_MS);

    const container = this.containers.get(id);
    if (!container) {
      return false;
    }

    return container.status === "running";
  }

  async createVolume(config: VolumeConfig): Promise<Volume> {
    await this.simulateDelay(this.CREATE_VOLUME_DELAY_MS);

    const id = `local-volume-${this.nextId++}`;
    const volume: Volume = {
      id,
      name: config.name,
      driver: config.driver || "local",
      mountpoint: `/tmp/openagent/volumes/${id}`,
      createdAt: Date.now(),
      labels: config.labels || {},
    };

    this.volumes.set(id, volume);
    return volume;
  }

  async removeVolume(id: string): Promise<void> {
    await this.simulateDelay(this.REMOVE_VOLUME_DELAY_MS);

    const volume = this.volumes.get(id);
    if (!volume) {
      throw new VolumeNotFoundError(id);
    }

    this.volumes.delete(id);
  }

  async createNetwork(config: NetworkConfig): Promise<Network> {
    await this.simulateDelay(this.CREATE_NETWORK_DELAY_MS);

    const id = `local-network-${this.nextId++}`;
    const network: Network = {
      id,
      name: config.name,
      driver: config.driver || "bridge",
      createdAt: Date.now(),
      labels: config.labels || {},
    };

    this.networks.set(id, network);
    return network;
  }

  async removeNetwork(id: string): Promise<void> {
    await this.simulateDelay(this.REMOVE_NETWORK_DELAY_MS);

    const network = this.networks.get(id);
    if (!network) {
      throw new NetworkNotFoundError(id);
    }

    this.networks.delete(id);
  }

  private async simulateDelay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  reset(): void {
    this.containers.clear();
    this.volumes.clear();
    this.networks.clear();
    this.nextId = 1;
    this.startTime = Date.now();
  }
}
