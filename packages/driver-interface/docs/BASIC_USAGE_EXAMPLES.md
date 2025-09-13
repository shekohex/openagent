# Basic Usage Examples

## Overview

This document provides comprehensive basic usage examples for the Driver Interface package, demonstrating common operations and patterns for container management.

## Getting Started

### 1. Installation and Setup

```typescript
// Install the package
npm install @openagent/driver-interface

// Import the required components
import {
  createDriverConfig,
  createResourceLimits,
  createSecurityOptions,
  validateContainerConfig,
  type ContainerDriver,
  type ContainerConfig,
  type ContainerInstance,
  type ResourceLimits,
  type SecurityOptions
} from '@openagent/driver-interface';
```

### 2. Basic Driver Initialization

```typescript
// Note: Mock drivers are for testing only.
// In production, you would use actual driver implementations.
// Example usage would be:
// const dockerDriver = new DockerDriver();
// const localDriver = new LocalDriver();

// Driver health check example
// const health = await driver.healthCheck();
// console.log('Driver Health:', health);
```

## Container Lifecycle Management

### 3. Simple Container Creation and Management

```typescript
// Create a basic container configuration
const config = createDriverConfig({
  sessionId: 'my-session-001',
  image: 'nginx:alpine'
});

// Create a container
const container = await dockerDriver.createContainer(config);
console.log('Container created:', container.id, container.name);

// Start the container
await dockerDriver.startContainer(container.id);
console.log('Container started');

// Check if container is healthy
const isHealthy = await dockerDriver.isContainerHealthy(container.id);
console.log('Container health:', isHealthy);

// Get container information
const containerInfo = await dockerDriver.getContainer(container.id);
console.log('Container info:', containerInfo);

// Stop the container
await dockerDriver.stopContainer(container.id, { timeout: 10000 });
console.log('Container stopped');

// Remove the container
await dockerDriver.removeContainer(container.id);
console.log('Container removed');
```

### 4. Container Configuration with Resources

```typescript
// Create a container with custom resource limits
const resourceConfig = createDriverConfig({
  sessionId: 'resource-session-001',
  image: 'postgres:15',
  resources: createResourceLimits({
    cpu: 2.0,           // 2 CPU cores
    memory: 2048,       // 2048 MB RAM
    disk: 4096,        // 4096 MB disk space
    pids: 200          // 200 process limit
  }),
  security: createSecurityOptions({
    readOnly: false,
    noNewPrivileges: true,
    user: 'postgres',
    capabilities: {
      drop: ['ALL'],
      add: ['NET_BIND_SERVICE']
    }
  })
});

// Validate the configuration
if (validateContainerConfig(resourceConfig)) {
  const container = await dockerDriver.createContainer(resourceConfig);
  console.log('Resource-configured container created:', container.id);

  // Check actual resource allocation
  console.log('Allocated resources:', container.resources);
}
```

### 5. Working with Container Volumes

```typescript
// Create a container with volume mounts
const volumeConfig = createDriverConfig({
  sessionId: 'volume-session-001',
  image: 'nginx:alpine',
  volumes: [
    {
      source: '/host/data',
      target: '/container/data',
      readOnly: false,
      type: 'bind'
    },
    {
      source: 'nginx-config',
      target: '/etc/nginx/conf.d',
      readOnly: true,
      type: 'volume'
    }
  ]
});

const container = await dockerDriver.createContainer(volumeConfig);
console.log('Container with volumes created:', container.id);
```

### 6. Container Network Configuration

```typescript
// Create a container with custom network
const networkConfig = createDriverConfig({
  sessionId: 'network-session-001',
  image: 'redis:alpine',
  network: 'my-network',
  env: {
    REDIS_PASSWORD: 'secure-password'
  },
  labels: {
    'app': 'redis',
    'environment': 'development'
  }
});

const container = await dockerDriver.createContainer(networkConfig);
console.log('Container with network config created:', container.id);
```

## Container Operations

### 7. Listing and Filtering Containers

```typescript
// Create multiple containers
const containers = [];
for (let i = 0; i < 3; i++) {
  const config = createDriverConfig({
    sessionId: 'batch-session-001',
    image: 'nginx:alpine',
    labels: {
      'batch': 'true',
      'index': i.toString()
    }
  });
  const container = await dockerDriver.createContainer(config);
  containers.push(container);
  await dockerDriver.startContainer(container.id);
}

// List all containers
const allContainers = await dockerDriver.listContainers();
console.log('All containers:', allContainers.length);

// Filter containers by session
const sessionContainers = await dockerDriver.listContainers({
  sessionId: 'batch-session-001'
});
console.log('Session containers:', sessionContainers.length);

// Filter containers by status
const runningContainers = await dockerDriver.listContainers({
  status: 'running'
});
console.log('Running containers:', runningContainers.length);

// Filter containers by labels
const labeledContainers = await dockerDriver.listContainers({
  label: { 'batch': 'true' }
});
console.log('Labeled containers:', labeledContainers.length);
```

### 8. Container Logs Management

```typescript
// Create a container that generates logs
const logContainer = await dockerDriver.createContainer({
  sessionId: 'log-session-001',
  image: 'nginx:alpine',
  command: ['sh', '-c', 'for i in 1 2 3 4 5; do echo "Log entry $i"; sleep 1; done']
});

await dockerDriver.startContainer(logContainer.id);

// Get all logs
const allLogs = await dockerDriver.getContainerLogs(logContainer.id);
console.log('All logs:', allLogs);

// Get last 100 lines of logs
const recentLogs = await dockerDriver.getContainerLogs(logContainer.id, {
  tail: 100
});
console.log('Recent logs (last 100 lines):', recentLogs);

// Get logs with timestamps
const timestampedLogs = await dockerDriver.getContainerLogs(logContainer.id, {
  timestamps: true
});
console.log('Timestamped logs:', timestampedLogs);

// Get logs since specific time
const logsSince = await dockerDriver.getContainerLogs(logContainer.id, {
  since: Date.now() - 5000, // Last 5 seconds
  tail: 50
});
console.log('Logs since 5 seconds ago:', logsSince);
```

## Volume Management

### 9. Creating and Managing Volumes

```typescript
// Create a volume
const volumeConfig = {
  name: 'my-app-data',
  driver: 'local',
  labels: {
    'app': 'my-app',
    'environment': 'production'
  }
};

const volume = await dockerDriver.createVolume(volumeConfig);
console.log('Volume created:', volume.id, volume.name);

// Create another volume
const configVolume = await dockerDriver.createVolume({
  name: 'nginx-config',
  driver: 'local',
  labels: {
    'type': 'config',
    'app': 'nginx'
  }
});

console.log('Config volume created:', configVolume.id);
```

### 10. Using Volumes with Containers

```typescript
// Create container with volume mounts
const containerWithVolumes = await dockerDriver.createContainer({
  sessionId: 'volume-demo-001',
  image: 'nginx:alpine',
  volumes: [
    {
      source: volume.name,
      target: '/data',
      readOnly: false,
      type: 'volume'
    },
    {
      source: configVolume.name,
      target: '/etc/nginx/conf.d',
      readOnly: true,
      type: 'volume'
    }
  ]
});

console.log('Container with volumes created:', containerWithVolumes.id);
```

## Network Management

### 11. Creating and Managing Networks

```typescript
// Create a network
const networkConfig = {
  name: 'my-app-network',
  driver: 'bridge',
  labels: {
    'app': 'my-app',
    'environment': 'production'
  },
  options: {
    'subnet': '172.20.0.0/16'
  }
};

const network = await dockerDriver.createNetwork(networkConfig);
console.log('Network created:', network.id, network.name);

// Create another network for testing
const testNetwork = await dockerDriver.createNetwork({
  name: 'test-network',
  driver: 'bridge',
  labels: {
    'environment': 'testing'
  }
});

console.log('Test network created:', testNetwork.id);
```

### 12. Using Networks with Containers

```typescript
// Create containers in the same network
const appContainer = await dockerDriver.createContainer({
  sessionId: 'network-demo-001',
  image: 'nginx:alpine',
  network: network.name,
  env: {
    'NETWORK_MODE': 'custom'
  },
  labels: {
    'app': 'frontend',
    'network': network.name
  }
});

const dbContainer = await dockerDriver.createContainer({
  sessionId: 'network-demo-001',
  image: 'postgres:15',
  network: network.name,
  env: {
    'POSTGRES_PASSWORD': 'secure-password'
  },
  labels: {
    'app': 'database',
    'network': network.name
  }
});

console.log('Containers in network created:', appContainer.id, dbContainer.id);
```

## Health Monitoring

### 13. Container Health Monitoring

```typescript
// Create a container for health monitoring
const monitoredContainer = await dockerDriver.createContainer({
  sessionId: 'health-demo-001',
  image: 'nginx:alpine'
});

await dockerDriver.startContainer(monitoredContainer.id);

// Monitor container health
setInterval(async () => {
  const isHealthy = await dockerDriver.isContainerHealthy(monitoredContainer.id);
  const containerInfo = await dockerDriver.getContainer(monitoredContainer.id);

  console.log(`Container ${monitoredContainer.id} health:`, isHealthy);
  console.log('Container status:', containerInfo?.status);
  console.log('Container state:', containerInfo?.state);

  // Get detailed driver health
  const driverHealth = await dockerDriver.healthCheck();
  console.log('Driver health status:', driverHealth.status);
  console.log('Driver uptime:', driverHealth.uptime);
  console.log('Container statistics:', driverHealth.containers);
}, 5000);
```

### 14. Driver Health Monitoring

```typescript
// Monitor overall driver health
async function monitorDriverHealth(driver: ContainerDriver, driverName: string) {
  const health = await driver.healthCheck();

  console.log(`=== ${driverName} Health Report ===`);
  console.log(`Status: ${health.status}`);
  console.log(`Version: ${health.version}`);
  console.log(`Uptime: ${health.uptime}ms`);
  console.log(`Container Statistics:`);
  console.log(`  Total: ${health.containers.total}`);
  console.log(`  Running: ${health.containers.running}`);
  console.log(`  Stopped: ${health.containers.stopped}`);

  if (health.error) {
    console.log(`Error: ${health.error}`);
  }

  return health;
}

// Monitor both drivers
const dockerHealth = await monitorDriverHealth(dockerDriver, 'Docker');
const localHealth = await monitorDriverHealth(localDriver, 'Local');
```

## Cross-Driver Operations

### 15. Comparing Driver Behavior

```typescript
// Test the same operation on both drivers
async function compareDriverOperations() {
  const testConfig = createDriverConfig({
    sessionId: 'comparison-001',
    image: 'nginx:alpine',
    resources: createResourceLimits({
      cpu: 1.0,
      memory: 512,
      disk: 1024,
      pids: 100
    })
  });

  console.log('=== Comparing Driver Performance ===');

  // Test Docker driver
  const dockerStart = Date.now();
  const dockerContainer = await dockerDriver.createContainer(testConfig);
  await dockerDriver.startContainer(dockerContainer.id);
  const dockerTime = Date.now() - dockerStart;

  // Test Local driver
  const localStart = Date.now();
  const localContainer = await localDriver.createContainer(testConfig);
  await localDriver.startContainer(localContainer.id);
  const localTime = Date.now() - localStart;

  console.log(`Docker driver time: ${dockerTime}ms`);
  console.log(`Local driver time: ${localTime}ms`);
  console.log(`Performance difference: ${Math.abs(dockerTime - localTime)}ms`);

  // Cleanup
  await dockerDriver.stopContainer(dockerContainer.id);
  await dockerDriver.removeContainer(dockerContainer.id);
  await localDriver.stopContainer(localContainer.id);
  await localDriver.removeContainer(localContainer.id);
}

compareDriverOperations();
```

### 16. Driver-Specific Resource Limits

```typescript
// Test resource limits across drivers
async function testResourceLimits() {
  const highCpuConfig = createDriverConfig({
    sessionId: 'resource-test-001',
    image: 'nginx:alpine',
    resources: createResourceLimits({
      cpu: 3.0,  // This will work for Docker but fail for Local
      memory: 1024,
      disk: 2048,
      pids: 150
    })
  });

  // Docker driver can handle 3.0 CPU cores
  try {
    const dockerContainer = await dockerDriver.createContainer(highCpuConfig);
    console.log('Docker: High CPU container created successfully');
    console.log('Allocated CPU:', dockerContainer.resources.cpu);
    await dockerDriver.stopContainer(dockerContainer.id);
    await dockerDriver.removeContainer(dockerContainer.id);
  } catch (error) {
    console.log('Docker: High CPU container failed:', error.message);
  }

  // Local driver will fail with 3.0 CPU cores (limit is 2.0)
  try {
    const localContainer = await localDriver.createContainer(highCpuConfig);
    console.log('Local: High CPU container created successfully');
    await localDriver.stopContainer(localContainer.id);
    await localDriver.removeContainer(localContainer.id);
  } catch (error) {
    console.log('Local: High CPU container failed:', error.message);
  }
}

testResourceLimits();
```

## Configuration Examples

### 17. Different Container Configurations

```typescript
// Web server configuration
const webServerConfig = createDriverConfig({
  sessionId: 'web-server-001',
  image: 'nginx:alpine',
  command: ['nginx', '-g', 'daemon off;'],
  env: {
    'NGINX_PORT': '8080'
  },
  labels: {
    'app': 'web-server',
    'tier': 'frontend'
  },
  resources: createResourceLimits({
    cpu: 1.0,
    memory: 512,
    disk: 1024,
    pids: 100
  }),
  security: createSecurityOptions({
    readOnly: true,
    noNewPrivileges: true,
    user: 'nginx',
    capabilities: {
      drop: ['ALL'],
      add: []
    }
  })
});

// Database configuration
const databaseConfig = createDriverConfig({
  sessionId: 'database-001',
  image: 'postgres:15',
  env: {
    'POSTGRES_DB': 'myapp',
    'POSTGRES_USER': 'user',
    'POSTGRES_PASSWORD': 'password'
  },
  volumes: [
    {
      source: 'postgres-data',
      target: '/var/lib/postgresql/data',
      readOnly: false,
      type: 'volume'
    }
  ],
  labels: {
    'app': 'database',
    'tier': 'backend'
  },
  resources: createResourceLimits({
    cpu: 2.0,
    memory: 2048,
    disk: 4096,
    pids: 200
  }),
  security: createSecurityOptions({
    readOnly: false,
    noNewPrivileges: true,
    user: 'postgres',
    capabilities: {
      drop: ['ALL'],
      add: ['NET_BIND_SERVICE']
    }
  })
});

// Application server configuration
const appServerConfig = createDriverConfig({
  sessionId: 'app-server-001',
  image: 'node:18-alpine',
  command: ['node', 'server.js'],
  env: {
    'NODE_ENV': 'production',
    'PORT': '3000'
  },
  volumes: [
    {
      source: '/host/app',
      target: '/app',
      readOnly: false,
      type: 'bind'
    }
  ],
  labels: {
    'app': 'app-server',
    'tier': 'backend'
  },
  resources: createResourceLimits({
    cpu: 1.5,
    memory: 1024,
    disk: 2048,
    pids: 150
  })
});
```

### 18. Complete Workflow Example

```typescript
// Complete workflow: create, start, monitor, stop, and cleanup
async function completeWorkflow() {
  console.log('=== Complete Container Workflow ===');

  // 1. Create configuration
  const config = createDriverConfig({
    sessionId: 'workflow-demo-001',
    image: 'nginx:alpine',
    env: {
      'WORKFLOW': 'demo'
    },
    labels: {
      'demo': 'true',
      'workflow': 'complete'
    },
    resources: createResourceLimits({
      cpu: 0.5,
      memory: 256,
      disk: 512,
      pids: 50
    })
  });

  // 2. Validate configuration
  if (!validateContainerConfig(config)) {
    throw new Error('Invalid container configuration');
  }

  // 3. Create container
  console.log('Creating container...');
  const container = await dockerDriver.createContainer(config);
  console.log('Container created:', container.id);

  // 4. Start container
  console.log('Starting container...');
  await dockerDriver.startContainer(container.id);
  console.log('Container started');

  // 5. Monitor container
  console.log('Monitoring container...');
  let healthChecks = 0;
  const monitorInterval = setInterval(async () => {
    healthChecks++;
    const isHealthy = await dockerDriver.isContainerHealthy(container.id);
    const info = await dockerDriver.getContainer(container.id);

    console.log(`Health check ${healthChecks}:`, {
      healthy: isHealthy,
      status: info?.status,
      state: info?.state
    });

    if (healthChecks >= 3) {
      clearInterval(monitorInterval);
    }
  }, 1000);

  // Wait for monitoring to complete
  await new Promise(resolve => setTimeout(resolve, 4000));

  // 6. Get logs
  console.log('Getting container logs...');
  const logs = await dockerDriver.getContainerLogs(container.id, {
    tail: 10,
    timestamps: true
  });
  console.log('Container logs:', logs);

  // 7. Stop container
  console.log('Stopping container...');
  await dockerDriver.stopContainer(container.id, { timeout: 5000 });
  console.log('Container stopped');

  // 8. Remove container
  console.log('Removing container...');
  await dockerDriver.removeContainer(container.id);
  console.log('Container removed');

  // 9. Verify cleanup
  const removedContainer = await dockerDriver.getContainer(container.id);
  console.log('Container removed successfully:', removedContainer === null);

  console.log('Workflow completed successfully!');
}

// Run the workflow
completeWorkflow().catch(console.error);
```

## Error Handling Examples

### 19. Basic Error Handling

```typescript
// Example of handling common errors
async function demonstrateErrorHandling() {
  console.log('=== Error Handling Examples ===');

  // 1. Handle container not found
  try {
    await dockerDriver.getContainer('non-existent-container');
  } catch (error) {
    console.log('Container not found error:', error.message);
  }

  // 2. Handle invalid configuration
  const invalidConfig = createDriverConfig({
    sessionId: '',
    image: ''
  });

  if (!validateContainerConfig(invalidConfig)) {
    console.log('Invalid configuration detected');
  }

  // 3. Handle resource limits
  const excessiveResources = createDriverConfig({
    sessionId: 'resource-error-001',
    image: 'nginx:alpine',
    resources: createResourceLimits({
      cpu: 10.0,  // Too high for both drivers
      memory: 512,
      disk: 1024,
      pids: 100
    })
  });

  try {
    await dockerDriver.createContainer(excessiveResources);
  } catch (error) {
    console.log('Resource limit error:', error.message);
    console.log('Error code:', error.code);
    console.log('Is retryable:', error.retryable);
  }
}

demonstrateErrorHandling();
```

### 20. Safe Operation Wrapper

```typescript
// Safe wrapper for container operations
async function safeContainerOperation<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T | null> {
  try {
    console.log(`Starting ${operationName}...`);
    const result = await operation();
    console.log(`${operationName} completed successfully`);
    return result;
  } catch (error) {
    console.error(`${operationName} failed:`, error.message);

    if (error.retryable) {
      console.log('Operation is retryable - you may want to retry');
    } else {
      console.log('Operation is not retryable - manual intervention required');
    }

    return null;
  }
}

// Usage example
async function safeContainerExample() {
  const config = createDriverConfig({
    sessionId: 'safe-demo-001',
    image: 'nginx:alpine'
  });

  // Safe container creation
  const container = await safeContainerOperation(
    () => dockerDriver.createContainer(config),
    'Container Creation'
  );

  if (!container) {
    console.log('Container creation failed, aborting');
    return;
  }

  // Safe container start
  const startResult = await safeContainerOperation(
    () => dockerDriver.startContainer(container.id),
    'Container Start'
  );

  if (!startResult) {
    console.log('Container start failed, cleaning up');
    await safeContainerOperation(
      () => dockerDriver.removeContainer(container.id),
      'Container Cleanup'
    );
    return;
  }

  // Continue with operations...
  console.log('Container operations completed successfully');
}

safeContainerExample();
```

## Summary

These basic usage examples demonstrate the fundamental operations of the Driver Interface package:

1. **Driver Initialization**: Simple setup and health checking
2. **Container Lifecycle**: Create, start, stop, and remove containers
3. **Configuration Management**: Resource limits, security options, and validation
4. **Volume Management**: Create volumes and mount them in containers
5. **Network Management**: Create networks and connect containers
6. **Health Monitoring**: Container and driver health checks
7. **Cross-Driver Operations**: Compare behavior between different drivers
8. **Error Handling**: Safe operations and error recovery
9. **Complete Workflows**: End-to-end container management examples

These examples provide a solid foundation for working with the Driver Interface package and can be adapted for specific use cases and requirements.