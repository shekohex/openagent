# Implementation Guide

## Overview

This guide provides comprehensive instructions for implementing new container drivers that conform to the Driver Interface contract. It covers architectural patterns, best practices, testing strategies, and common pitfalls to avoid.

## Prerequisites

Before implementing a driver, ensure you understand:

- TypeScript and modern JavaScript features
- Containerization concepts (Docker, Kubernetes, etc.)
- Asynchronous programming patterns
- Error handling best practices
- The Driver Interface contract specification

## Driver Architecture

### Core Components

A complete driver implementation consists of:

1. **Driver Class**: Implements the `ContainerDriver` interface
2. **Configuration System**: Handles driver-specific settings
3. **Error Handling**: Custom error types and retry logic
4. **Connection Management**: Handles communication with the container runtime
5. **Resource Management**: Tracks and manages container resources
6. **Health Monitoring**: Implements health check mechanisms

### Basic Driver Structure

```typescript
import {
  ContainerDriver,
  ContainerConfig,
  ContainerInstance,
  DriverHealth,
  // ... other imports
} from '@openagent/driver-interface';
import {
  ContainerNotFoundError,
  ContainerCreationError,
  // ... error imports
} from '@openagent/driver-interface/errors';

export class MyCustomDriver implements ContainerDriver {
  readonly name = 'my-custom-driver';
  readonly version = '1.0.0';

  private connection: any; // Your connection/client object
  private config: DriverConfig;
  private containers: Map<string, ContainerInstance> = new Map();

  constructor(config: DriverConfig) {
    this.config = config;
    this.initializeConnection();
  }

  // Implementation of all ContainerDriver methods
  // ...
}
```

## Step-by-Step Implementation

### 1. Driver Class Setup

#### Driver Identification
```typescript
export class MyCustomDriver implements ContainerDriver {
  readonly name = 'my-custom-driver';  // Must be unique
  readonly version = '1.0.0';          // Semantic versioning

  // Driver-specific configuration
  private config: DriverConfig;
  private isHealthy = true;
  private startTime = Date.now();

  constructor(config: DriverConfig = {}) {
    this.config = {
      timeout: 30000,
      retries: 3,
      ...config
    };
  }
}
```

#### Configuration Management
```typescript
interface DriverConfig {
  timeout?: number;      // Operation timeout in ms
  retries?: number;      // Retry attempts for retryable errors
  endpoint?: string;     // Runtime endpoint
  credentials?: any;     // Authentication credentials
  debug?: boolean;       // Enable debug logging
}

private validateConfig(config: DriverConfig): void {
  if (config.timeout && config.timeout < 1000) {
    throw new ConfigurationError('Timeout must be at least 1000ms');
  }
  if (config.retries && config.retries > 10) {
    throw new ConfigurationError('Maximum retry count is 10');
  }
}
```

### 2. Container Lifecycle Implementation

#### createContainer Implementation
```typescript
async createContainer(config: ContainerConfig): Promise<ContainerInstance> {
  try {
    // Validate configuration
    this.validateContainerConfig(config);

    // Check resource limits
    await this.validateResourceLimits(config.resources);

    // Generate unique container ID
    const containerId = this.generateContainerId(config.sessionId);

    // Create container in your runtime
    const runtimeContainer = await this.runtime.createContainer({
      ...config,
      id: containerId
    });

    // Create ContainerInstance object
    const container: ContainerInstance = {
      id: containerId,
      name: config.sessionId,
      sessionId: config.sessionId,
      image: config.image,
      status: 'created',
      state: 'terminated',
      endpoint: this.buildEndpoint(containerId),
      createdAt: Date.now(),
      labels: config.labels,
      resources: config.resources
    };

    // Store container reference
    this.containers.set(containerId, container);

    return container;

  } catch (error) {
    if (error instanceof ResourceLimitError) {
      throw error; // Re-throw known errors
    }
    throw new ContainerCreationError(
      `Failed to create container: ${error.message}`,
      { originalError: error }
    );
  }
}
```

#### startContainer Implementation
```typescript
async startContainer(id: string): Promise<void> {
  const container = this.containers.get(id);
  if (!container) {
    throw new ContainerNotFoundError(id);
  }

  if (container.status === 'running') {
    return; // Already running
  }

  try {
    // Start container in runtime
    await this.runtime.startContainer(id);

    // Update container state
    container.status = 'running';
    container.state = 'running';
    container.startedAt = Date.now();

    this.containers.set(id, container);

  } catch (error) {
    throw new ContainerStartError(id, error.message);
  }
}
```

#### stopContainer Implementation
```typescript
async stopContainer(id: string, options: StopOptions = {}): Promise<void> {
  const container = this.containers.get(id);
  if (!container) {
    throw new ContainerNotFoundError(id);
  }

  if (container.status === 'stopped') {
    return; // Already stopped
  }

  try {
    const timeout = options.timeout || this.config.timeout;

    // Stop container with timeout
    await Promise.race([
      this.runtime.stopContainer(id),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);

    // Update container state
    container.status = 'stopped';
    container.state = 'terminated';

    this.containers.set(id, container);

  } catch (error) {
    if (error.message === 'Timeout') {
      throw new ContainerStopError(id, 'Timeout stopping container');
    }
    throw new ContainerStopError(id, error.message);
  }
}
```

### 3. Container Query Implementation

#### getContainer Implementation
```typescript
async getContainer(id: string): Promise<ContainerInstance | null> {
  try {
    // Check local cache first
    const cachedContainer = this.containers.get(id);
    if (cachedContainer) {
      // Verify container still exists in runtime
      const runtimeContainer = await this.runtime.getContainer(id);
      if (!runtimeContainer) {
        this.containers.delete(id);
        return null;
      }

      // Update status from runtime
      return this.updateContainerStatus(cachedContainer, runtimeContainer);
    }

    // Check runtime directly
    const runtimeContainer = await this.runtime.getContainer(id);
    if (!runtimeContainer) {
      return null;
    }

    // Create container object from runtime data
    return this.containerFromRuntime(runtimeContainer);

  } catch (error) {
    // getContainer should not throw for non-existent containers
    return null;
  }
}
```

#### listContainers Implementation
```typescript
async listContainers(filter?: ContainerFilter): Promise<ContainerInstance[]> {
  try {
    // Get all containers from runtime
    const runtimeContainers = await this.runtime.listContainers();

    // Convert to ContainerInstance objects
    let containers = runtimeContainers.map(c => this.containerFromRuntime(c));

    // Apply filters if provided
    if (filter) {
      containers = this.applyFilters(containers, filter);
    }

    return containers;

  } catch (error) {
    throw new DriverError('Failed to list containers', 'LIST_CONTAINERS_FAILED', true);
  }
}

private applyFilters(
  containers: ContainerInstance[],
  filter: ContainerFilter
): ContainerInstance[] {
  return containers.filter(container => {
    if (filter.sessionId && container.sessionId !== filter.sessionId) {
      return false;
    }
    if (filter.status && container.status !== filter.status) {
      return false;
    }
    if (filter.state && container.state !== filter.state) {
      return false;
    }
    if (filter.label) {
      for (const [key, value] of Object.entries(filter.label)) {
        if (container.labels[key] !== value) {
          return false;
        }
      }
    }
    return true;
  });
}
```

### 4. Health Monitoring Implementation

#### healthCheck Implementation
```typescript
async healthCheck(): Promise<DriverHealth> {
  try {
    // Check runtime connectivity
    await this.runtime.ping();

    // Get container statistics
    const allContainers = await this.runtime.listContainers();
    const runningContainers = allContainers.filter(c => c.status === 'running');
    const stoppedContainers = allContainers.filter(c => c.status === 'stopped');

    return {
      status: this.isHealthy ? 'healthy' : 'unhealthy',
      version: this.version,
      uptime: Date.now() - this.startTime,
      containers: {
        total: allContainers.length,
        running: runningContainers.length,
        stopped: stoppedContainers.length
      }
    };

  } catch (error) {
    this.isHealthy = false;
    return {
      status: 'unhealthy',
      version: this.version,
      uptime: Date.now() - this.startTime,
      containers: { total: 0, running: 0, stopped: 0 },
      error: error.message
    };
  }
}
```

#### isContainerHealthy Implementation
```typescript
async isContainerHealthy(id: string): Promise<boolean> {
  const container = await this.getContainer(id);
  if (!container) {
    throw new ContainerNotFoundError(id);
  }

  try {
    // Check if container is running and responsive
    if (container.status !== 'running') {
      return false;
    }

    // Perform health check specific to your runtime
    const healthStatus = await this.runtime.checkContainerHealth(id);
    return healthStatus.healthy;

  } catch (error) {
    return false;
  }
}
```

### 5. Resource Management Implementation

#### Volume Management
```typescript
async createVolume(config: VolumeConfig): Promise<Volume> {
  try {
    // Check if volume already exists
    const existingVolume = await this.runtime.getVolume(config.name);
    if (existingVolume) {
      throw new VolumeCreationError(config.name, 'Volume already exists');
    }

    // Create volume in runtime
    const runtimeVolume = await this.runtime.createVolume(config);

    return {
      id: runtimeVolume.id,
      name: runtimeVolume.name,
      driver: runtimeVolume.driver || 'local',
      mountpoint: runtimeVolume.mountpoint,
      createdAt: Date.now(),
      labels: config.labels || {}
    };

  } catch (error) {
    throw new VolumeCreationError(config.name, error.message);
  }
}

async removeVolume(id: string): Promise<void> {
  try {
    // Check if volume exists
    const volume = await this.runtime.getVolume(id);
    if (!volume) {
      throw new VolumeNotFoundError(id);
    }

    // Check if volume is in use
    const usingContainers = await this.getContainersUsingVolume(id);
    if (usingContainers.length > 0) {
      throw new VolumeRemoveError(id, 'Volume is in use by containers');
    }

    // Remove volume from runtime
    await this.runtime.removeVolume(id);

  } catch (error) {
    if (error instanceof VolumeNotFoundError || error instanceof VolumeRemoveError) {
      throw error;
    }
    throw new VolumeRemoveError(id, error.message);
  }
}
```

#### Network Management
```typescript
async createNetwork(config: NetworkConfig): Promise<Network> {
  try {
    // Check if network already exists
    const existingNetwork = await this.runtime.getNetwork(config.name);
    if (existingNetwork) {
      throw new NetworkCreationError(config.name, 'Network already exists');
    }

    // Create network in runtime
    const runtimeNetwork = await this.runtime.createNetwork(config);

    return {
      id: runtimeNetwork.id,
      name: runtimeNetwork.name,
      driver: runtimeNetwork.driver || 'bridge',
      createdAt: Date.now(),
      labels: config.labels || {}
    };

  } catch (error) {
    throw new NetworkCreationError(config.name, error.message);
  }
}
```

### 6. Error Handling Implementation

#### Retry Logic
```typescript
private async withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = this.config.retries
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry non-retryable errors
      if (!isRetryableError(error)) {
        throw error;
      }

      // Exponential backoff
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        await this.sleep(delay);
      }
    }
  }

  throw lastError;
}
```

#### Error Transformation
```typescript
private transformError(error: any): DriverError {
  if (error instanceof DriverError) {
    return error;
  }

  // Transform common runtime errors to DriverError types
  if (error.code === 'ENOENT') {
    return new FileSystemError(error.message);
  }

  if (error.code === 'ECONNREFUSED') {
    return new NetworkError(error.message);
  }

  if (error.code === 'ETIMEDOUT') {
    return new TimeoutError('operation', this.config.timeout);
  }

  // Generic error
  return new DriverError(
    error.message,
    'UNKNOWN_ERROR',
    true // Assume unknown errors are retryable
  );
}
```

### 7. Utility Methods

#### Container State Management
```typescript
private updateContainerStatus(
  cached: ContainerInstance,
  runtime: any
): ContainerInstance {
  // Map runtime status to ContainerStatus
  const status = this.mapRuntimeStatus(runtime.status);
  const state = this.mapRuntimeState(runtime.state);

  return {
    ...cached,
    status,
    state,
    startedAt: runtime.startedAt || cached.startedAt
  };
}

private mapRuntimeStatus(runtimeStatus: string): ContainerStatus {
  const statusMap: Record<string, ContainerStatus> = {
    'created': 'created',
    'running': 'running',
    'paused': 'paused',
    'stopped': 'stopped',
    'exited': 'exited',
    'dead': 'dead'
  };

  return statusMap[runtimeStatus] || 'exited';
}
```

#### ID Generation
```typescript
private generateContainerId(sessionId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${sessionId}-${timestamp}-${random}`;
}

private buildEndpoint(containerId: string): string {
  return `http://localhost:8080/containers/${containerId}`;
}
```

## Testing Your Implementation

### Unit Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MyCustomDriver } from './my-custom-driver';

describe('MyCustomDriver', () => {
  let driver: MyCustomDriver;

  beforeEach(() => {
    driver = new MyCustomDriver();
  });

  describe('createContainer', () => {
    it('should create container with valid config', async () => {
      const config = createDriverConfig({
        sessionId: 'test-session',
        image: 'nginx:alpine'
      });

      const container = await driver.createContainer(config);

      expect(container.sessionId).toBe('test-session');
      expect(container.image).toBe('nginx:alpine');
      expect(container.status).toBe('created');
    });

    it('should throw ContainerCreationError for invalid image', async () => {
      const config = createDriverConfig({
        sessionId: 'test-session',
        image: 'nonexistent:image'
      });

      await expect(driver.createContainer(config))
        .rejects.toThrow(ContainerCreationError);
    });
  });

  // More test cases...
});
```

### Integration Tests

```typescript
describe('MyCustomDriver Integration', () => {
  let driver: MyCustomDriver;

  beforeAll(async () => {
    driver = new MyCustomDriver({
      endpoint: process.env.DRIVER_ENDPOINT
    });

    // Ensure driver is healthy
    const health = await driver.healthCheck();
    expect(health.status).toBe('healthy');
  });

  it('should handle complete container lifecycle', async () => {
    const config = createDriverConfig({
      sessionId: 'integration-test',
      image: 'nginx:alpine'
    });

    // Create
    const container = await driver.createContainer(config);

    // Start
    await driver.startContainer(container.id);
    const started = await driver.getContainer(container.id);
    expect(started?.status).toBe('running');

    // Health check
    const isHealthy = await driver.isContainerHealthy(container.id);
    expect(isHealthy).toBe(true);

    // Stop
    await driver.stopContainer(container.id);
    const stopped = await driver.getContainer(container.id);
    expect(stopped?.status).toBe('stopped');

    // Remove
    await driver.removeContainer(container.id);
    const removed = await driver.getContainer(container.id);
    expect(removed).toBeNull();
  });
});
```

## Performance Considerations

### Connection Pooling
```typescript
export class MyCustomDriver implements ContainerDriver {
  private connectionPool: ConnectionPool;

  constructor(config: DriverConfig) {
    this.connectionPool = new ConnectionPool({
      maxSize: config.maxConnections || 10,
      idleTimeout: config.idleTimeout || 30000
    });
  }

  private async withConnection<T>(
    operation: (connection: Connection) => Promise<T>
  ): Promise<T> {
    const connection = await this.connectionPool.getConnection();
    try {
      return await operation(connection);
    } finally {
      this.connectionPool.releaseConnection(connection);
    }
  }
}
```

### Caching Strategy
```typescript
export class MyCustomDriver implements ContainerDriver {
  private cache: Map<string, { value: any; expires: number }> = new Map();
  private cacheTTL = 5000; // 5 seconds

  private async withCache<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }

    const result = await operation();
    this.cache.set(key, {
      value: result,
      expires: Date.now() + this.cacheTTL
    });

    return result;
  }
}
```

## Security Best Practices

### Credential Management
```typescript
export class MyCustomDriver implements ContainerDriver {
  private credentials: Credentials;

  constructor(config: DriverConfig) {
    // Validate and encrypt credentials
    this.credentials = this.validateCredentials(config.credentials);
  }

  private validateCredentials(credentials: any): Credentials {
    if (!credentials) {
      throw new AuthenticationError('Credentials required');
    }

    // Encrypt sensitive data
    return {
      ...credentials,
      token: this.encrypt(credentials.token),
      secret: this.encrypt(credentials.secret)
    };
  }

  private async authenticate(): Promise<void> {
    try {
      await this.runtime.authenticate(this.credentials);
    } catch (error) {
      throw new AuthenticationError('Authentication failed');
    }
  }
}
```

### Input Validation
```typescript
private validateContainerConfig(config: ContainerConfig): void {
  // Validate session ID format
  if (!/^[a-zA-Z0-9-]+$/.test(config.sessionId)) {
    throw new ConfigurationError('Invalid session ID format');
  }

  // Validate image format
  if (!config.image.includes(':')) {
    throw new ConfigurationError('Image must include tag');
  }

  // Validate resource limits
  if (config.resources.cpu > 16) {
    throw new ResourceLimitError('cpu', 16, config.resources.cpu);
  }

  // Additional validations...
}
```

## Deployment Considerations

### Configuration Management
```typescript
// config.ts
export interface DriverConfiguration {
  endpoint: string;
  timeout: number;
  retries: number;
  security: SecurityConfig;
  logging: LoggingConfig;
}

// Environment-specific configurations
export const configurations = {
  development: {
    endpoint: 'http://localhost:2375',
    timeout: 30000,
    retries: 3,
    debug: true
  },
  production: {
    endpoint: 'https://runtime.example.com',
    timeout: 60000,
    retries: 5,
    debug: false
  }
};
```

### Monitoring and Metrics
```typescript
export class MyCustomDriver implements ContainerDriver {
  private metrics: MetricsCollector;

  constructor(config: DriverConfig) {
    this.metrics = new MetricsCollector({
      prefix: 'driver_interface',
      enabled: config.metrics || false
    });
  }

  private async withMetrics<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const timer = this.metrics.startTimer(operation);
    try {
      const result = await fn();
      timer.recordSuccess();
      return result;
    } catch (error) {
      timer.recordFailure(error);
      throw error;
    }
  }
}
```

## Common Pitfalls and Solutions

### 1. Memory Leaks
**Problem**: Container references accumulating in memory
**Solution**: Implement proper cleanup and weak references

```typescript
export class MyCustomDriver implements ContainerDriver {
  private containers: WeakMap<string, WeakRef<ContainerInstance>> = new WeakMap();

  private cleanupExpiredContainers(): void {
    for (const [id, ref] of this.containers) {
      const container = ref.deref();
      if (!container) {
        this.containers.delete(id);
      }
    }
  }
}
```

### 2. Connection Timeouts
**Problem**: Operations hanging indefinitely
**Solution**: Implement proper timeout handling

```typescript
private async withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number = this.config.timeout
): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new TimeoutError('operation', timeoutMs)), timeoutMs)
    )
  ]);
}
```

### 3. Race Conditions
**Problem**: Concurrent operations causing inconsistent state
**Solution**: Implement proper locking

```typescript
export class MyCustomDriver implements ContainerDriver {
  private locks: Map<string, Promise<void>> = new Map();

  private async withLock<T>(
    resourceId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    // Wait for existing lock
    const existingLock = this.locks.get(resourceId);
    if (existingLock) {
      await existingLock;
    }

    // Acquire lock
    const lock = operation().finally(() => {
      this.locks.delete(resourceId);
    });

    this.locks.set(resourceId, lock);
    return lock;
  }
}
```

## Conclusion

This implementation guide provides a comprehensive foundation for creating robust container drivers that conform to the Driver Interface specification. Remember to:

1. **Follow the interface contract strictly**
2. **Implement comprehensive error handling**
3. **Add thorough test coverage**
4. **Consider performance and security implications**
5. **Monitor and maintain your implementation**

For additional examples and reference implementations, see the mock drivers in the `tests/mocks/` directory.