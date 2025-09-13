# Advanced Usage Examples

## Overview

This document provides advanced usage examples for the Driver Interface package, demonstrating complex scenarios, multi-container orchestration, and sophisticated patterns for container management.

## Multi-Container Orchestration

### 1. Microservices Architecture Setup

```typescript
import {
  createDriverConfig,
  createResourceLimits,
  createSecurityOptions,
  validateContainerConfig,
  type ContainerDriver,
  type ContainerInstance,
  type ContainerConfig
} from '@openagent/driver-interface';

interface MicroserviceConfig {
  name: string;
  image: string;
  ports: { external: number; internal: number }[];
  environment: Record<string, string>;
  dependencies: string[];
  resources: Partial<{
    cpu: number;
    memory: number;
    disk: number;
    pids: number;
  }>;
}

class MicroserviceOrchestrator {
  private driver: ContainerDriver;
  private containers: Map<string, ContainerInstance> = new Map();
  private services: Map<string, MicroserviceConfig> = new Map();

  constructor(driver: ContainerDriver) {
    this.driver = driver;
  }

  async deployMicroservices(services: MicroserviceConfig[], sessionId: string) {
    console.log(`Deploying ${services.length} microservices in session: ${sessionId}`);

    // Register services
    services.forEach(service => {
      this.services.set(service.name, service);
    });

    // Deploy in dependency order
    const deploymentOrder = this.calculateDeploymentOrder(services);

    for (const serviceName of deploymentOrder) {
      const service = this.services.get(serviceName)!;
      await this.deployService(service, sessionId);
    }

    console.log('All microservices deployed successfully');
    return this.containers;
  }

  private calculateDeploymentOrder(services: MicroserviceConfig[]): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (serviceName: string) => {
      if (visiting.has(serviceName)) {
        throw new Error(`Circular dependency detected involving ${serviceName}`);
      }

      if (visited.has(serviceName)) {
        return;
      }

      visiting.add(serviceName);

      const service = services.find(s => s.name === serviceName);
      if (service) {
        service.dependencies.forEach(dep => visit(dep));
      }

      visiting.delete(serviceName);
      visited.add(serviceName);
      order.push(serviceName);
    };

    services.forEach(service => visit(service.name));
    return order;
  }

  private async deployService(service: MicroserviceConfig, sessionId: string) {
    console.log(`Deploying service: ${service.name}`);

    const config = createDriverConfig({
      sessionId,
      image: service.image,
      env: service.environment,
      labels: {
        'service': service.name,
        'orchestrator': 'microservices',
        'dependencies': service.dependencies.join(',')
      },
      resources: createResourceLimits({
        cpu: service.resources.cpu || 0.5,
        memory: service.resources.memory || 512,
        disk: service.resources.disk || 1024,
        pids: service.resources.pids || 100
      }),
      security: createSecurityOptions({
        readOnly: false,
        noNewPrivileges: true,
        user: 'appuser',
        capabilities: {
          drop: ['ALL'],
          add: ['NET_BIND_SERVICE']
        }
      })
    });

    // Wait for dependencies to be healthy
    await this.waitForDependencies(service.dependencies);

    const container = await this.driver.createContainer(config);
    await this.driver.startContainer(container.id);

    // Wait for service to be healthy
    await this.waitForHealth(container.id, 30);

    this.containers.set(service.name, container);
    console.log(`Service ${service.name} deployed successfully: ${container.id}`);
  }

  private async waitForDependencies(dependencies: string[]) {
    for (const depName of dependencies) {
      const depContainer = this.containers.get(depName);
      if (depContainer) {
        const isHealthy = await this.driver.isContainerHealthy(depContainer.id);
        if (!isHealthy) {
          throw new Error(`Dependency ${depName} is not healthy`);
        }
      }
    }
  }

  private async waitForHealth(containerId: string, timeout: number) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout * 1000) {
      const isHealthy = await this.driver.isContainerHealthy(containerId);
      if (isHealthy) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`Container ${containerId} did not become healthy within ${timeout} seconds`);
  }

  async scaleService(serviceName: string, replicas: number) {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not found`);
    }

    console.log(`Scaling service ${serviceName} to ${replicas} replicas`);

    // Remove existing containers for this service
    await this.removeServiceContainers(serviceName);

    // Create new replicas
    for (let i = 0; i < replicas; i++) {
      const config = createDriverConfig({
        sessionId: `scale-${serviceName}-${Date.now()}`,
        image: service.image,
        env: {
          ...service.environment,
          REPLICA_ID: i.toString(),
          TOTAL_REPLICAS: replicas.toString()
        },
        labels: {
          'service': serviceName,
          'replica': i.toString(),
          'orchestrator': 'microservices'
        },
        resources: createResourceLimits({
          cpu: service.resources.cpu || 0.5,
          memory: service.resources.memory || 512,
          disk: service.resources.disk || 1024,
          pids: service.resources.pids || 100
        })
      });

      const container = await this.driver.createContainer(config);
      await this.driver.startContainer(container.id);

      // Store with replica-specific key
      this.containers.set(`${serviceName}-${i}`, container);
    }

    console.log(`Service ${serviceName} scaled to ${replicas} replicas`);
  }

  async removeServiceContainers(serviceName: string) {
    const containersToRemove = Array.from(this.containers.entries())
      .filter(([key, container]) => key.startsWith(serviceName))
      .map(([key, container]) => container);

    for (const container of containersToRemove) {
      await this.driver.stopContainer(container.id);
      await this.driver.removeContainer(container.id);

      // Remove from containers map
      for (const [key, value] of this.containers.entries()) {
        if (value.id === container.id) {
          this.containers.delete(key);
        }
      }
    }
  }

  async getClusterHealth() {
    const health = {
      totalContainers: this.containers.size,
      healthyContainers: 0,
      services: {} as Record<string, { replicas: number; healthy: number }>
    };

    for (const [serviceName, container] of this.containers.entries()) {
      const isHealthy = await this.driver.isContainerHealthy(container.id);
      if (isHealthy) {
        health.healthyContainers++;
      }

      const baseServiceName = serviceName.split('-')[0];
      if (!health.services[baseServiceName]) {
        health.services[baseServiceName] = { replicas: 0, healthy: 0 };
      }
      health.services[baseServiceName].replicas++;
      if (isHealthy) {
        health.services[baseServiceName].healthy++;
      }
    }

    return health;
  }

  async cleanup() {
    console.log('Cleaning up all containers...');

    for (const container of this.containers.values()) {
      try {
        await this.driver.stopContainer(container.id);
        await this.driver.removeContainer(container.id);
      } catch (error) {
        console.error(`Failed to cleanup container ${container.id}:`, error.message);
      }
    }

    this.containers.clear();
    console.log('Cleanup completed');
  }
}

// Usage example
async function deployMicroservicesExample() {
  // const driver = new DockerDriver(); // Production driver
  const orchestrator = new MicroserviceOrchestrator(driver);

  const services: MicroserviceConfig[] = [
    {
      name: 'redis',
      image: 'redis:alpine',
      ports: [{ external: 6379, internal: 6379 }],
      environment: { REDIS_PASSWORD: 'secure-password' },
      dependencies: [],
      resources: { cpu: 0.5, memory: 256 }
    },
    {
      name: 'postgres',
      image: 'postgres:15',
      ports: [{ external: 5432, internal: 5432 }],
      environment: {
        POSTGRES_DB: 'appdb',
        POSTGRES_USER: 'appuser',
        POSTGRES_PASSWORD: 'apppassword'
      },
      dependencies: [],
      resources: { cpu: 1.0, memory: 1024 }
    },
    {
      name: 'api',
      image: 'node:18-alpine',
      ports: [{ external: 3000, internal: 3000 }],
      environment: {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://appuser:apppassword@postgres:5432/appdb',
        REDIS_URL: 'redis://:secure-password@redis:6379'
      },
      dependencies: ['postgres', 'redis'],
      resources: { cpu: 1.5, memory: 1024 }
    },
    {
      name: 'web',
      image: 'nginx:alpine',
      ports: [{ external: 80, internal: 80 }],
      environment: {
        API_URL: 'http://api:3000'
      },
      dependencies: ['api'],
      resources: { cpu: 0.5, memory: 512 }
    }
  ];

  try {
    // Deploy all services
    const containers = await orchestrator.deployMicroservices(services, 'microservices-demo');

    // Check cluster health
    const health = await orchestrator.getClusterHealth();
    console.log('Cluster Health:', health);

    // Scale API service
    await orchestrator.scaleService('api', 3);

    // Check health after scaling
    const scaledHealth = await orchestrator.getClusterHealth();
    console.log('Cluster Health after scaling:', scaledHealth);

  } finally {
    // Cleanup
    await orchestrator.cleanup();
  }
}

deployMicroservicesExample().catch(console.error);
```

### 2. Advanced Resource Pooling and Management

```typescript
interface ResourcePool {
  totalCpu: number;
  totalMemory: number;
  totalDisk: number;
  totalPids: number;
  allocatedCpu: number;
  allocatedMemory: number;
  allocatedDisk: number;
  allocatedPids: number;
}

class ResourceManager {
  private driver: ContainerDriver;
  private resourcePool: ResourcePool;
  private allocations: Map<string, { cpu: number; memory: number; disk: number; pids: number }> = new Map();

  constructor(driver: ContainerDriver, pool: ResourcePool) {
    this.driver = driver;
    this.resourcePool = pool;
  }

  async allocateResources(
    containerId: string,
    requirements: { cpu: number; memory: number; disk: number; pids: number }
  ): Promise<boolean> {
    // Check if resources are available
    const availableCpu = this.resourcePool.totalCpu - this.resourcePool.allocatedCpu;
    const availableMemory = this.resourcePool.totalMemory - this.resourcePool.allocatedMemory;
    const availableDisk = this.resourcePool.totalDisk - this.resourcePool.allocatedDisk;
    const availablePids = this.resourcePool.totalPids - this.resourcePool.allocatedPids;

    if (requirements.cpu > availableCpu ||
        requirements.memory > availableMemory ||
        requirements.disk > availableDisk ||
        requirements.pids > availablePids) {
      return false;
    }

    // Allocate resources
    this.allocations.set(containerId, requirements);
    this.resourcePool.allocatedCpu += requirements.cpu;
    this.resourcePool.allocatedMemory += requirements.memory;
    this.resourcePool.allocatedDisk += requirements.disk;
    this.resourcePool.allocatedPids += requirements.pids;

    return true;
  }

  async deallocateResources(containerId: string) {
    const allocation = this.allocations.get(containerId);
    if (!allocation) {
      return;
    }

    this.resourcePool.allocatedCpu -= allocation.cpu;
    this.resourcePool.allocatedMemory -= allocation.memory;
    this.resourcePool.allocatedDisk -= allocation.disk;
    this.resourcePool.allocatedPids -= allocation.pids;

    this.allocations.delete(containerId);
  }

  getResourceUtilization() {
    return {
      cpu: this.resourcePool.allocatedCpu / this.resourcePool.totalCpu,
      memory: this.resourcePool.allocatedMemory / this.resourcePool.totalMemory,
      disk: this.resourcePool.allocatedDisk / this.resourcePool.totalDisk,
      pids: this.resourcePool.allocatedPids / this.resourcePool.totalPids
    };
  }

  getAvailableResources() {
    return {
      cpu: this.resourcePool.totalCpu - this.resourcePool.allocatedCpu,
      memory: this.resourcePool.totalMemory - this.resourcePool.allocatedMemory,
      disk: this.resourcePool.totalDisk - this.resourcePool.allocatedDisk,
      pids: this.resourcePool.totalPids - this.resourcePool.allocatedPids
    };
  }
}

class AdvancedContainerManager {
  private driver: ContainerDriver;
  private resourceManager: ResourceManager;

  constructor(driver: ContainerDriver, resourcePool: ResourcePool) {
    this.driver = driver;
    this.resourceManager = new ResourceManager(driver, resourcePool);
  }

  async createContainerWithResourceGuarantee(
    config: ReturnType<typeof createDriverConfig>,
    priority: 'high' | 'medium' | 'low' = 'medium'
  ) {
    const containerId = `container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Try to allocate resources
    const allocated = await this.resourceManager.allocateResources(containerId, config.resources);

    if (!allocated) {
      // If priority is high, try to evict low priority containers
      if (priority === 'high') {
        const evicted = await this.evictLowPriorityContainers();
        if (evicted > 0) {
          // Retry allocation after eviction
          const retryAllocated = await this.resourceManager.allocateResources(containerId, config.resources);
          if (!retryAllocated) {
            throw new Error('Insufficient resources even after eviction');
          }
        } else {
          throw new Error('Insufficient resources and no containers to evict');
        }
      } else {
        throw new Error('Insufficient resources');
      }
    }

    try {
      const container = await this.driver.createContainer(config);
      await this.driver.startContainer(container.id);
      return container;
    } catch (error) {
      // Clean up resource allocation on failure
      await this.resourceManager.deallocateResources(containerId);
      throw error;
    }
  }

  private async evictLowPriorityContainers(): Promise<number> {
    const containers = await this.driver.listContainers({
      label: { 'priority': 'low' }
    });

    let evictedCount = 0;

    for (const container of containers) {
      try {
        await this.driver.stopContainer(container.id);
        await this.driver.removeContainer(container.id);
        await this.resourceManager.deallocateResources(container.id);
        evictedCount++;
      } catch (error) {
        console.error(`Failed to evict container ${container.id}:`, error.message);
      }
    }

    return evictedCount;
  }

  async getResourceOptimizationSuggestions() {
    const utilization = this.resourceManager.getResourceUtilization();
    const available = this.resourceManager.getAvailableResources();

    const suggestions = [];

    if (utilization.cpu > 0.8) {
      suggestions.push({
        type: 'scale_up',
        resource: 'cpu',
        message: 'CPU utilization is high, consider adding more CPU resources',
        current: utilization.cpu,
        available: available.cpu
      });
    }

    if (utilization.memory > 0.8) {
      suggestions.push({
        type: 'scale_up',
        resource: 'memory',
        message: 'Memory utilization is high, consider adding more memory',
        current: utilization.memory,
        available: available.memory
      });
    }

    if (utilization.cpu < 0.3) {
      suggestions.push({
        type: 'scale_down',
        resource: 'cpu',
        message: 'CPU utilization is low, consider reducing CPU allocation',
        current: utilization.cpu,
        available: available.cpu
      });
    }

    return suggestions;
  }
}

// Usage example
async function resourceManagementExample() {
  // const driver = new DockerDriver(); // Production driver

  const resourcePool: ResourcePool = {
    totalCpu: 8.0,
    totalMemory: 8192,
    totalDisk: 16384,
    totalPids: 1000,
    allocatedCpu: 0,
    allocatedMemory: 0,
    allocatedDisk: 0,
    allocatedPids: 0
  };

  const manager = new AdvancedContainerManager(driver, resourcePool);

  try {
    // Create containers with resource guarantees
    const container1 = await manager.createContainerWithResourceGuarantee(
      createDriverConfig({
        sessionId: 'resource-demo',
        image: 'nginx:alpine',
        labels: { 'priority': 'high' },
        resources: createResourceLimits({ cpu: 2.0, memory: 1024, disk: 2048, pids: 200 })
      }),
      'high'
    );

    const container2 = await manager.createContainerWithResourceGuarantee(
      createDriverConfig({
        sessionId: 'resource-demo',
        image: 'redis:alpine',
        labels: { 'priority': 'medium' },
        resources: createResourceLimits({ cpu: 0.5, memory: 512, disk: 1024, pids: 100 })
      }),
      'medium'
    );

    // Check resource utilization
    const utilization = manager.resourceManager.getResourceUtilization();
    console.log('Resource utilization:', utilization);

    // Get optimization suggestions
    const suggestions = await manager.getResourceOptimizationSuggestions();
    console.log('Optimization suggestions:', suggestions);

  } finally {
    // Cleanup would need to deallocate resources properly
  }
}
```

### 3. Advanced Health Monitoring and Auto-Healing

```typescript
interface HealthCheckConfig {
  interval: number;
  timeout: number;
  retries: number;
  unhealthyThreshold: number;
  healthyThreshold: number;
}

interface AutoHealingConfig {
  enabled: boolean;
  maxRestarts: number;
  restartDelay: number;
  fallbackImage?: string;
}

class HealthMonitor {
  private driver: ContainerDriver;
  private healthChecks: Map<string, NodeJS.Timeout> = new Map();
  private healthStatus: Map<string, { healthy: boolean; consecutiveFailures: number; consecutiveSuccesses: number }> = new Map();
  private healingActions: Map<string, number> = new Map(); // restart counts

  constructor(
    driver: ContainerDriver,
    private healthConfig: HealthCheckConfig,
    private healingConfig: AutoHealingConfig
  ) {
    this.driver = driver;
  }

  startMonitoring(containerId: string) {
    console.log(`Starting health monitoring for container: ${containerId}`);

    this.healthStatus.set(containerId, {
      healthy: true,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0
    });

    const checkInterval = setInterval(() => {
      this.performHealthCheck(containerId);
    }, this.healthConfig.interval);

    this.healthChecks.set(containerId, checkInterval);
  }

  stopMonitoring(containerId: string) {
    const interval = this.healthChecks.get(containerId);
    if (interval) {
      clearInterval(interval);
      this.healthChecks.delete(containerId);
      this.healthStatus.delete(containerId);
      console.log(`Stopped health monitoring for container: ${containerId}`);
    }
  }

  private async performHealthCheck(containerId: string) {
    const status = this.healthStatus.get(containerId);
    if (!status) return;

    try {
      const isHealthy = await Promise.race([
        this.driver.isContainerHealthy(containerId),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), this.healthConfig.timeout)
        )
      ]);

      if (isHealthy) {
        status.consecutiveSuccesses++;
        status.consecutiveFailures = 0;

        if (status.consecutiveSuccesses >= this.healthConfig.healthyThreshold && !status.healthy) {
          status.healthy = true;
          console.log(`Container ${containerId} is now healthy`);
        }
      } else {
        throw new Error('Container reported unhealthy');
      }
    } catch (error) {
      status.consecutiveFailures++;
      status.consecutiveSuccesses = 0;

      if (status.consecutiveFailures >= this.healthConfig.unhealthyThreshold && status.healthy) {
        status.healthy = false;
        console.log(`Container ${containerId} is now unhealthy`);
        await this.handleUnhealthyContainer(containerId);
      }
    }
  }

  private async handleUnhealthyContainer(containerId: string) {
    if (!this.healingConfig.enabled) {
      console.log(`Auto-healing disabled for container: ${containerId}`);
      return;
    }

    const restartCount = this.healingActions.get(containerId) || 0;

    if (restartCount >= this.healingConfig.maxRestarts) {
      console.log(`Max restarts reached for container ${containerId}. Not restarting.`);
      return;
    }

    console.log(`Attempting to restart unhealthy container: ${containerId}`);

    try {
      // Stop the container
      await this.driver.stopContainer(containerId, { timeout: 5000 });

      // Wait before restart
      await new Promise(resolve => setTimeout(resolve, this.healingConfig.restartDelay));

      // Start the container
      await this.driver.startContainer(containerId);

      // Update restart count
      this.healingActions.set(containerId, restartCount + 1);

      console.log(`Successfully restarted container: ${containerId}`);

      // Reset health status to allow recovery detection
      const status = this.healthStatus.get(containerId);
      if (status) {
        status.consecutiveFailures = 0;
        status.consecutiveSuccesses = 0;
      }

    } catch (error) {
      console.error(`Failed to restart container ${containerId}:`, error.message);

      // Try fallback image if configured
      if (this.healingConfig.fallbackImage) {
        await this.tryFallbackImage(containerId);
      }
    }
  }

  private async tryFallbackImage(containerId: string) {
    console.log(`Attempting fallback image for container: ${containerId}`);

    try {
      // Get current container info
      const container = await this.driver.getContainer(containerId);
      if (!container) {
        console.log(`Container ${containerId} not found`);
        return;
      }

      // Stop and remove current container
      await this.driver.stopContainer(containerId);
      await this.driver.removeContainer(containerId);

      // Create new container with fallback image
      const fallbackConfig = createDriverConfig({
        sessionId: container.sessionId,
        image: this.healingConfig.fallbackImage!,
        env: container.labels, // Preserve environment
        labels: {
          ...container.labels,
          'fallback': 'true',
          'original-image': container.image
        },
        resources: container.resources
      });

      const newContainer = await this.driver.createContainer(fallbackConfig);
      await this.driver.startContainer(newContainer.id);

      console.log(`Successfully created fallback container: ${newContainer.id}`);

      // Update monitoring to new container
      this.stopMonitoring(containerId);
      this.startMonitoring(newContainer.id);

    } catch (error) {
      console.error(`Fallback image attempt failed for container ${containerId}:`, error.message);
    }
  }

  getHealthSummary() {
    const summary = {
      totalMonitored: this.healthChecks.size,
      healthy: 0,
      unhealthy: 0,
      restartCounts: {} as Record<string, number>
    };

    this.healthStatus.forEach((status, containerId) => {
      if (status.healthy) {
        summary.healthy++;
      } else {
        summary.unhealthy++;
      }
    });

    this.healingActions.forEach((count, containerId) => {
      summary.restartCounts[containerId] = count;
    });

    return summary;
  }
}

// Usage example
async function healthMonitoringExample() {
  // const driver = new DockerDriver(); // Production driver

  const healthConfig: HealthCheckConfig = {
    interval: 5000,     // Check every 5 seconds
    timeout: 3000,      // Timeout after 3 seconds
    retries: 3,         // Retry 3 times
    unhealthyThreshold: 2, // 2 consecutive failures mark as unhealthy
    healthyThreshold: 2    // 2 consecutive successes mark as healthy
  };

  const healingConfig: AutoHealingConfig = {
    enabled: true,
    maxRestarts: 3,
    restartDelay: 10000,  // 10 seconds between restarts
    fallbackImage: 'nginx:alpine-fallback'
  };

  const healthMonitor = new HealthMonitor(driver, healthConfig, healingConfig);

  try {
    // Create containers to monitor
    const containers = [];
    for (let i = 0; i < 3; i++) {
      const config = createDriverConfig({
        sessionId: 'health-demo',
        image: 'nginx:alpine',
        labels: {
          'health-monitor': 'enabled',
          'container-index': i.toString()
        }
      });

      const container = await driver.createContainer(config);
      await driver.startContainer(container.id);
      containers.push(container);

      // Start health monitoring
      healthMonitor.startMonitoring(container.id);
    }

    // Monitor for a while
    let monitorCount = 0;
    const monitorInterval = setInterval(() => {
      monitorCount++;
      const summary = healthMonitor.getHealthSummary();
      console.log('Health Summary:', summary);

      if (monitorCount >= 10) {
        clearInterval(monitorInterval);
      }
    }, 10000);

    // Wait for monitoring to complete
    await new Promise(resolve => setTimeout(resolve, 100000));

    // Cleanup
    containers.forEach(container => {
      healthMonitor.stopMonitoring(container.id);
    });

  } finally {
    // Cleanup containers
    const containers = await driver.listContainers({ sessionId: 'health-demo' });
    for (const container of containers) {
      try {
        await driver.stopContainer(container.id);
        await driver.removeContainer(container.id);
      } catch (error) {
        console.error('Cleanup error:', error.message);
      }
    }
  }
}
```

### 4. Advanced Event-Driven Architecture

```typescript
interface ContainerEvent {
  type: 'created' | 'started' | 'stopped' | 'removed' | 'healthy' | 'unhealthy' | 'error';
  containerId: string;
  timestamp: number;
  data?: any;
}

interface EventHandler {
  eventType: string;
  handler: (event: ContainerEvent) => Promise<void> | void;
}

class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();

  subscribe(eventType: string, handler: (event: ContainerEvent) => Promise<void> | void) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push({ eventType, handler });
  }

  async emit(event: ContainerEvent) {
    const handlers = this.handlers.get(event.type) || [];

    for (const handler of handlers) {
      try {
        await handler.handler(event);
      } catch (error) {
        console.error(`Error in event handler for ${event.type}:`, error.message);
      }
    }
  }

  unsubscribe(eventType: string, handler: (event: ContainerEvent) => Promise<void> | void) {
    const handlers = this.handlers.get(eventType) || [];
    const index = handlers.findIndex(h => h.handler === handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }
}

class EventDrivenContainerManager {
  private driver: ContainerDriver;
  private eventBus: EventBus;
  private containers: Map<string, ContainerInstance> = new Map();

  constructor(driver: ContainerDriver) {
    this.driver = driver;
    this.eventBus = new EventBus();
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Log all events
    this.eventBus.subscribe('*', (event) => {
      console.log(`[${new Date(event.timestamp).toISOString()}] ${event.type}: ${event.containerId}`, event.data);
    });

    // Handle container errors
    this.eventBus.subscribe('error', async (event) => {
      console.error('Container error:', event.data);

      // Attempt recovery for certain error types
      if (event.data.retryable) {
        await this.attemptRecovery(event.containerId);
      }
    });

    // Handle unhealthy containers
    this.eventBus.subscribe('unhealthy', async (event) => {
      console.log(`Container ${event.containerId} became unhealthy`);

      // Restart after delay
      setTimeout(async () => {
        await this.restartContainer(event.containerId);
      }, 5000);
    });

    // Track container lifecycle
    this.eventBus.subscribe('created', (event) => {
      console.log(`Container created: ${event.containerId}`);
    });

    this.eventBus.subscribe('removed', (event) => {
      console.log(`Container removed: ${event.containerId}`);
      this.containers.delete(event.containerId);
    });
  }

  async createContainer(config: ReturnType<typeof createDriverConfig>): Promise<ContainerInstance> {
    const container = await this.driver.createContainer(config);
    this.containers.set(container.id, container);

    await this.eventBus.emit({
      type: 'created',
      containerId: container.id,
      timestamp: Date.now(),
      data: { config }
    });

    return container;
  }

  async startContainer(containerId: string) {
    await this.driver.startContainer(containerId);

    await this.eventBus.emit({
      type: 'started',
      containerId: containerId,
      timestamp: Date.now()
    });

    // Start monitoring for health changes
    this.startHealthMonitoring(containerId);
  }

  async stopContainer(containerId: string, options?: any) {
    await this.driver.stopContainer(containerId, options);

    await this.eventBus.emit({
      type: 'stopped',
      containerId: containerId,
      timestamp: Date.now(),
      data: { options }
    });

    // Stop health monitoring
    this.stopHealthMonitoring(containerId);
  }

  async removeContainer(containerId: string) {
    await this.driver.removeContainer(containerId);

    await this.eventBus.emit({
      type: 'removed',
      containerId: containerId,
      timestamp: Date.now()
    });
  }

  private startHealthMonitoring(containerId: string) {
    const monitor = async () => {
      try {
        const isHealthy = await this.driver.isContainerHealthy(containerId);
        const event: ContainerEvent = {
          type: isHealthy ? 'healthy' : 'unhealthy',
          containerId: containerId,
          timestamp: Date.now()
        };

        await this.eventBus.emit(event);
      } catch (error) {
        await this.eventBus.emit({
          type: 'error',
          containerId: containerId,
          timestamp: Date.now(),
          data: { error: error.message, retryable: false }
        });
      }
    };

    // Monitor every 10 seconds
    const interval = setInterval(monitor, 10000);

    // Store interval for cleanup
    (this.containers.get(containerId) as any)._healthInterval = interval;
  }

  private stopHealthMonitoring(containerId: string) {
    const container = this.containers.get(containerId) as any;
    if (container && container._healthInterval) {
      clearInterval(container._healthInterval);
      delete container._healthInterval;
    }
  }

  private async attemptRecovery(containerId: string) {
    console.log(`Attempting recovery for container: ${containerId}`);

    try {
      await this.stopContainer(containerId);
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.startContainer(containerId);
    } catch (error) {
      console.error(`Recovery failed for container ${containerId}:`, error.message);
    }
  }

  private async restartContainer(containerId: string) {
    console.log(`Restarting container: ${containerId}`);

    try {
      await this.stopContainer(containerId);
      await new Promise(resolve => setTimeout(resolve, 3000));
      await this.startContainer(containerId);
    } catch (error) {
      console.error(`Restart failed for container ${containerId}:`, error.message);
    }
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }

  async getContainerStats() {
    const containers = Array.from(this.containers.values());
    const stats = {
      total: containers.length,
      running: 0,
      stopped: 0,
      bySession: {} as Record<string, number>
    };

    for (const container of containers) {
      if (container.status === 'running') {
        stats.running++;
      } else {
        stats.stopped++;
      }

      if (!stats.bySession[container.sessionId]) {
        stats.bySession[container.sessionId] = 0;
      }
      stats.bySession[container.sessionId]++;
    }

    return stats;
  }
}

// Usage example
async function eventDrivenExample() {
  // const driver = new DockerDriver(); // Production driver
  const manager = new EventDrivenContainerManager(driver);

  // Custom event handlers
  manager.getEventBus().subscribe('started', async (event) => {
    console.log(`🚀 Container started: ${event.containerId}`);

    // Send notification or trigger other actions
    await sendNotification(`Container ${event.containerId} started successfully`);
  });

  manager.getEventBus().subscribe('unhealthy', async (event) => {
    console.log(`⚠️  Container unhealthy: ${event.containerId}`);

    // Send alert to monitoring system
    await sendAlert(`Container ${event.containerId} is unhealthy`);
  });

  // Create and manage containers
  try {
    const containers = [];
    for (let i = 0; i < 3; i++) {
      const config = createDriverConfig({
        sessionId: `event-demo-${i % 2}`, // Create 2 sessions
        image: 'nginx:alpine',
        labels: {
          'event-driven': 'true',
          'container-type': 'web-server'
        }
      });

      const container = await manager.createContainer(config);
      await manager.startContainer(container.id);
      containers.push(container);
    }

    // Monitor for a while
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Get stats
    const stats = await manager.getContainerStats();
    console.log('Container stats:', stats);

    // Cleanup
    for (const container of containers) {
      await manager.stopContainer(container.id);
      await manager.removeContainer(container.id);
    }

  } catch (error) {
    console.error('Event-driven example error:', error.message);
  }
}

// Helper functions for event handlers
async function sendNotification(message: string) {
  console.log(`📧 Notification: ${message}`);
  // In a real implementation, this would send to Slack, email, etc.
}

async function sendAlert(message: string) {
  console.log(`🚨 Alert: ${message}`);
  // In a real implementation, this would send to PagerDuty, Slack, etc.
}

eventDrivenExample().catch(console.error);
```

### 5. Advanced Configuration Management

```typescript
interface ConfigurationTemplate {
  name: string;
  baseConfig: ReturnType<typeof createDriverConfig>;
  environmentVariables: Record<string, string>;
  resourceProfiles: {
    development: Partial<ResourceLimits>;
    staging: Partial<ResourceLimits>;
    production: Partial<ResourceLimits>;
  };
  securityProfiles: {
    development: Partial<SecurityOptions>;
    staging: Partial<SecurityOptions>;
    production: Partial<SecurityOptions>;
  };
}

class ConfigurationManager {
  private templates: Map<string, ConfigurationTemplate> = new Map();
  private environments: Map<string, { overrides: Record<string, any> }> = new Map();

  registerTemplate(template: ConfigurationTemplate) {
    this.templates.set(template.name, template);
  }

  defineEnvironment(name: string, overrides: Record<string, any>) {
    this.environments.set(name, { overrides });
  }

  generateConfiguration(
    templateName: string,
    environment: string,
    customizations?: Partial<ReturnType<typeof createDriverConfig>>
  ): ReturnType<typeof createDriverConfig> {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    const envConfig = this.environments.get(environment);
    if (!envConfig) {
      throw new Error(`Environment ${environment} not found`);
    }

    // Start with base configuration
    let config = { ...template.baseConfig };

    // Apply resource profile for environment
    const resourceProfile = template.resourceProfiles[environment as keyof typeof template.resourceProfiles];
    if (resourceProfile) {
      config.resources = createResourceLimits({
        ...config.resources,
        ...resourceProfile
      });
    }

    // Apply security profile for environment
    const securityProfile = template.securityProfiles[environment as keyof typeof template.securityProfiles];
    if (securityProfile) {
      config.security = createSecurityOptions({
        ...config.security,
        ...securityProfile
      });
    }

    // Apply environment-specific overrides
    Object.assign(config, envConfig.overrides);

    // Apply customizations
    if (customizations) {
      Object.assign(config, customizations);
    }

    // Merge environment variables
    config.env = {
      ...template.environmentVariables,
      ...config.env,
      NODE_ENV: environment
    };

    return config;
  }

  validateConfiguration(config: ReturnType<typeof createDriverConfig>): boolean {
    // Basic validation
    if (!config.sessionId || !config.image) {
      return false;
    }

    // Resource validation
    if (config.resources.cpu <= 0 || config.resources.memory <= 0) {
      return false;
    }

    // Environment-specific validation would go here
    return true;
  }
}

// Usage example
async function configurationManagementExample() {
  const configManager = new ConfigurationManager();

  // Register a web server template
  configManager.registerTemplate({
    name: 'web-server',
    baseConfig: createDriverConfig({
      sessionId: '', // Will be overridden
      image: 'nginx:alpine',
      volumes: [
        {
          source: 'nginx-config',
          target: '/etc/nginx/conf.d',
          readOnly: true,
          type: 'volume'
        }
      ],
      labels: {
        'app-type': 'web-server',
        'managed-by': 'config-manager'
      }
    }),
    environmentVariables: {
      NGINX_WORKER_PROCESSES: 'auto',
      NGINX_KEEPALIVE_TIMEOUT: '65'
    },
    resourceProfiles: {
      development: { cpu: 0.5, memory: 256, disk: 512, pids: 100 },
      staging: { cpu: 1.0, memory: 512, disk: 1024, pids: 150 },
      production: { cpu: 2.0, memory: 1024, disk: 2048, pids: 200 }
    },
    securityProfiles: {
      development: { readOnly: false, noNewPrivileges: false, user: 'root' },
      staging: { readOnly: true, noNewPrivileges: true, user: 'nginx' },
      production: { readOnly: true, noNewPrivileges: true, user: 'nginx' }
    }
  });

  // Define environments
  configManager.defineEnvironment('development', {
    network: 'dev-network',
    labels: { 'environment': 'development' }
  });

  configManager.defineEnvironment('staging', {
    network: 'staging-network',
    labels: { 'environment': 'staging' }
  });

  configManager.defineEnvironment('production', {
    network: 'prod-network',
    labels: { 'environment': 'production' }
  });

  // const driver = new DockerDriver(); // Production driver

  try {
    // Generate configurations for different environments
    const devConfig = configManager.generateConfiguration('web-server', 'development', {
      sessionId: 'web-dev-001'
    });

    const stagingConfig = configManager.generateConfiguration('web-server', 'staging', {
      sessionId: 'web-staging-001'
    });

    const prodConfig = configManager.generateConfiguration('web-server', 'production', {
      sessionId: 'web-prod-001'
    });

    console.log('Development config:', devConfig.resources);
    console.log('Staging config:', stagingConfig.resources);
    console.log('Production config:', prodConfig.resources);

    // Create containers with different configurations
    const containers = [];

    const devContainer = await driver.createContainer(devConfig);
    await driver.startContainer(devContainer.id);
    containers.push(devContainer);

    const stagingContainer = await driver.createContainer(stagingConfig);
    await driver.startContainer(stagingContainer.id);
    containers.push(stagingContainer);

    const prodContainer = await driver.createContainer(prodConfig);
    await driver.startContainer(prodContainer.id);
    containers.push(prodContainer);

    console.log('Created containers with different environment configurations');

    // Cleanup
    for (const container of containers) {
      await driver.stopContainer(container.id);
      await driver.removeContainer(container.id);
    }

  } catch (error) {
    console.error('Configuration management example error:', error.message);
  }
}

configurationManagementExample().catch(console.error);
```

## Summary

These advanced usage examples demonstrate sophisticated container management patterns:

1. **Microservices Orchestration**: Dependency-based deployment, scaling, and cluster management
2. **Resource Pooling**: Advanced resource allocation, optimization, and eviction strategies
3. **Health Monitoring**: Comprehensive health checks, auto-healing, and fallback strategies
4. **Event-Driven Architecture**: Event-based container management with custom handlers
5. **Configuration Management**: Template-based configuration with environment-specific profiles

These examples show how the Driver Interface package can be extended to handle complex, real-world container orchestration scenarios while maintaining type safety, error handling, and monitoring capabilities.