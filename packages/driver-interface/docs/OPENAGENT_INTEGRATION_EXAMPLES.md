# OpenAgent Integration Examples

This document provides comprehensive examples of how the Container Driver Interface integrates with the broader OpenAgent ecosystem.

## Table of Contents
- [Agent Session Management](#agent-session-management)
- [Code Execution Environment](#code-execution-environment)
- [Resource Pooling and Scaling](#resource-pooling-and-scaling)
- [Event-Driven Architecture](#event-driven-architecture)
- [Monitoring and Observability](#monitoring-and-observability)
- [Security and Isolation](#security-and-isolation)
- [Multi-Agent Coordination](#multi-agent-coordination)
- [Configuration Management](#configuration-management)

## Agent Session Management

### Session-Based Container Lifecycle

```typescript
import {
  type ContainerDriver,
  type ContainerConfig,
  type ContainerInstance,
  createDriverConfig
} from '@openagent/driver-interface';
import { AgentSession } from '@openagent/core';

class AgentSessionManager {
  private sessions = new Map<string, AgentSession>();
  private containers = new Map<string, ContainerInstance>();

  constructor(
    private driver: ContainerDriver,
    private maxSessionDuration = 3600000 // 1 hour
  ) {}

  async createAgentSession(
    sessionId: string,
    agentConfig: ContainerConfig,
    sessionMetadata: any
  ): Promise<AgentSession> {
    // Create container for agent session
    const container = await this.driver.createContainer({
      ...agentConfig,
      env: {
        ...agentConfig.env,
        SESSION_ID: sessionId,
        AGENT_TYPE: 'code-executor',
        MAX_DURATION: this.maxSessionDuration.toString()
      },
      labels: {
        'openagent.session.id': sessionId,
        'openagent.session.type': 'agent-execution',
        'openagent.session.created': new Date().toISOString(),
        ...agentConfig.labels
      }
    });

    // Start the container
    await this.driver.startContainer(container.id);

    // Create session object
    const session: AgentSession = {
      id: sessionId,
      containerId: container.id,
      startTime: new Date(),
      metadata: sessionMetadata,
      status: 'active',
      resourceUsage: {
        cpu: 0,
        memory: 0,
        disk: 0
      }
    };

    this.sessions.set(sessionId, session);
    this.containers.set(container.id, container);

    return session;
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Stop and remove container
    await this.driver.stopContainer(session.containerId);
    await this.driver.removeContainer(session.containerId);

    // Update session status
    session.status = 'completed';
    session.endTime = new Date();

    // Clean up references
    this.sessions.delete(sessionId);
    this.containers.delete(session.containerId);
  }

  async getSessionMetrics(sessionId: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const container = this.containers.get(session.containerId);
    if (!container) {
      throw new Error(`Container for session ${sessionId} not found`);
    }

    // Get container metrics
    const stats = await this.driver.getContainerStats(container.id);
    const logs = await this.driver.getContainerLogs(container.id, { tail: 100 });

    return {
      session,
      container: {
        id: container.id,
        status: container.status,
        stats,
        logs: logs.slice(-50) // Last 50 lines
      }
    };
  }
}

// Usage example
const sessionManager = new AgentSessionManager(mockDockerDriver);

async function runAgentSession() {
  const sessionId = `agent-${Date.now()}`;

  const agentConfig: ContainerConfig = {
    image: 'openagent/code-executor:latest',
    resources: {
      cpu: 2,
      memory: '4GB',
      disk: '10GB'
    },
    env: {
      PYTHON_VERSION: '3.11',
      NODE_VERSION: '18'
    },
    volumes: [
      {
        source: '/workspace',
        destination: '/workspace',
        mode: 'rw'
      }
    ]
  };

  const session = await sessionManager.createAgentSession(
    sessionId,
    agentConfig,
    {
      userId: 'user-123',
      project: 'data-analysis',
      language: 'python'
    }
  );

  console.log(`Created agent session: ${session.id}`);

  // Use the session...
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Get session metrics
  const metrics = await sessionManager.getSessionMetrics(sessionId);
  console.log('Session metrics:', metrics);

  // End session
  await sessionManager.endSession(sessionId);
  console.log(`Ended agent session: ${sessionId}`);
}
```

## Code Execution Environment

### Dynamic Code Execution with Container Isolation

```typescript
import { ContainerDriver, ContainerConfig, ExecConfig } from '@openagent/driver-interface';

interface CodeExecutionRequest {
  sessionId: string;
  code: string;
  language: 'python' | 'node' | 'typescript' | 'bash';
  timeout?: number;
  resources?: {
    cpu?: number;
    memory?: string;
  };
}

interface CodeExecutionResult {
  output: string;
  error?: string;
  exitCode: number;
  executionTime: number;
  resources: {
    cpuUsed: number;
    memoryUsed: string;
  };
}

class CodeExecutionService {
  constructor(
    private driver: ContainerDriver,
    private baseImage = 'openagent/code-executor:latest'
  ) {}

  async executeCode(request: CodeExecutionRequest): Promise<CodeExecutionResult> {
    const startTime = Date.now();

    // Create execution container
    const executionConfig: ContainerConfig = {
      image: this.baseImage,
      resources: {
        cpu: request.resources?.cpu || 1,
        memory: request.resources?.memory || '2GB',
        disk: '5GB'
      },
      env: {
        EXECUTION_LANGUAGE: request.language,
        TIMEOUT_MS: (request.timeout || 30000).toString(),
        SESSION_ID: request.sessionId
      },
      labels: {
        'openagent.type': 'code-execution',
        'openagent.session.id': request.sessionId,
        'openagent.language': request.language
      }
    };

    const container = await this.driver.createContainer(executionConfig);
    await this.driver.startContainer(container.id);

    try {
      // Write code to file in container
      const codeFile = `/tmp/execution.${this.getFileExtension(request.language)}`;
      await this.driver.execCommand(container.id, {
        command: `echo ${this.escapeShellString(request.code)} > ${codeFile}`,
        timeout: 5000
      });

      // Execute code with timeout
      const execResult = await this.driver.execCommand(container.id, {
        command: this.getExecutionCommand(request.language, codeFile),
        timeout: request.timeout || 30000,
        captureOutput: true
      });

      // Get resource usage
      const stats = await this.driver.getContainerStats(container.id);

      return {
        output: execResult.stdout || '',
        error: execResult.stderr,
        exitCode: execResult.exitCode || 0,
        executionTime: Date.now() - startTime,
        resources: {
          cpuUsed: stats.cpuUsage || 0,
          memoryUsed: stats.memoryUsage || '0MB'
        }
      };
    } finally {
      // Cleanup container
      await this.driver.stopContainer(container.id);
      await this.driver.removeContainer(container.id);
    }
  }

  private getFileExtension(language: string): string {
    const extensions = {
      python: 'py',
      node: 'js',
      typescript: 'ts',
      bash: 'sh'
    };
    return extensions[language as keyof typeof extensions] || 'txt';
  }

  private getExecutionCommand(language: string, codeFile: string): string {
    const commands = {
      python: `python3 ${codeFile}`,
      node: `node ${codeFile}`,
      typescript: `npx ts-node ${codeFile}`,
      bash: `bash ${codeFile}`
    };
    return commands[language as keyof typeof commands] || `cat ${codeFile}`;
  }

  private escapeShellString(str: string): string {
    return str.replace(/'/g, "'\\''").replace(/\n/g, '\\n');
  }
}

// Usage example
const codeExecutor = new CodeExecutionService(mockDockerDriver);

async function executeUserCode() {
  const request: CodeExecutionRequest = {
    sessionId: 'session-123',
    code: `
def analyze_data(data):
    """Sample data analysis function"""
    import pandas as pd
    import json

    # Process data
    result = {
        'count': len(data),
        'average': sum(data) / len(data) if data else 0,
        'max': max(data) if data else 0,
        'min': min(data) if data else 0
    }

    return result

# Execute analysis
sample_data = [1, 2, 3, 4, 5, 10, 15, 20]
result = analyze_data(sample_data)
print(json.dumps(result, indent=2))
    `,
    language: 'python',
    timeout: 30000,
    resources: {
      cpu: 1,
      memory: '1GB'
    }
  };

  const result = await codeExecutor.executeCode(request);
  console.log('Execution result:', result);
}
```

## Resource Pooling and Scaling

### Dynamic Resource Management

```typescript
import { ContainerDriver, ContainerConfig } from '@openagent/driver-interface';

interface ResourcePool {
  id: string;
  driver: ContainerDriver;
  containers: ContainerInstance[];
  maxContainers: number;
  availableContainers: number;
  resourceQuota: {
    totalCPU: number;
    totalMemory: string;
    availableCPU: number;
    availableMemory: string;
  };
}

class ResourceManager {
  private pools = new Map<string, ResourcePool>();

  createPool(
    poolId: string,
    driver: ContainerDriver,
    config: {
      maxContainers: number;
      totalCPU: number;
      totalMemory: string;
      baseImage?: string;
    }
  ): ResourcePool {
    const pool: ResourcePool = {
      id: poolId,
      driver,
      containers: [],
      maxContainers: config.maxContainers,
      availableContainers: config.maxContainers,
      resourceQuota: {
        totalCPU: config.totalCPU,
        totalMemory: config.totalMemory,
        availableCPU: config.totalCPU,
        availableMemory: config.totalMemory
      }
    };

    this.pools.set(poolId, pool);
    return pool;
  }

  async allocateResource(
    poolId: string,
    requirements: {
      cpu: number;
      memory: string;
      image?: string;
      env?: Record<string, string>;
    }
  ): Promise<ContainerInstance> {
    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error(`Resource pool ${poolId} not found`);
    }

    // Check resource availability
    if (pool.availableContainers <= 0) {
      throw new Error('No available containers in pool');
    }

    if (pool.resourceQuota.availableCPU < requirements.cpu) {
      throw new Error('Insufficient CPU resources');
    }

    const requiredMemoryMB = this.parseMemory(requirements.memory);
    const availableMemoryMB = this.parseMemory(pool.resourceQuota.availableMemory);

    if (availableMemoryMB < requiredMemoryMB) {
      throw new Error('Insufficient memory resources');
    }

    // Create container
    const containerConfig: ContainerConfig = {
      image: requirements.image || 'openagent/base:latest',
      resources: {
        cpu: requirements.cpu,
        memory: requirements.memory,
        disk: '1GB'
      },
      env: {
        ...requirements.env,
        RESOURCE_POOL_ID: poolId,
        ALLOCATION_TIME: new Date().toISOString()
      },
      labels: {
        'openagent.resource.pool': poolId,
        'openagent.resource.type': 'dynamic-allocation'
      }
    };

    const container = await pool.driver.createContainer(containerConfig);
    await pool.driver.startContainer(container.id);

    // Update pool state
    pool.containers.push(container);
    pool.availableContainers--;
    pool.resourceQuota.availableCPU -= requirements.cpu;
    pool.resourceQuota.availableMemory = `${availableMemoryMB - requiredMemoryMB}MB`;

    return container;
  }

  async releaseResource(poolId: string, containerId: string): Promise<void> {
    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error(`Resource pool ${poolId} not found`);
    }

    const containerIndex = pool.containers.findIndex(c => c.id === containerId);
    if (containerIndex === -1) {
      throw new Error(`Container ${containerId} not found in pool ${poolId}`);
    }

    const container = pool.containers[containerIndex];

    // Get container resource usage before cleanup
    const stats = await pool.driver.getContainerStats(containerId);
    const cpuUsed = stats.cpuUsage || 0;
    const memoryUsed = this.parseMemory(stats.memoryUsage || '0MB');

    // Stop and remove container
    await pool.driver.stopContainer(containerId);
    await pool.driver.removeContainer(containerId);

    // Update pool state
    pool.containers.splice(containerIndex, 1);
    pool.availableContainers++;
    pool.resourceQuota.availableCPU += cpuUsed;

    const currentAvailableMemory = this.parseMemory(pool.resourceQuota.availableMemory);
    pool.resourceQuota.availableMemory = `${currentAvailableMemory + memoryUsed}MB`;
  }

  async scalePool(poolId: string, newMaxContainers: number): Promise<void> {
    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error(`Resource pool ${poolId} not found`);
    }

    if (newMaxContainers < pool.containers.length) {
      throw new Error('Cannot scale below current container count');
    }

    pool.maxContainers = newMaxContainers;
    pool.availableContainers = newMaxContainers - pool.containers.length;
  }

  private parseMemory(memory: string): number {
    const match = memory.match(/(\d+(?:\.\d+)?)(MB|GB)/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    return unit === 'GB' ? value * 1024 : value;
  }
}

// Usage example
const resourceManager = new ResourceManager();

async function setupResourcePools() {
  // Create development pool
  const devPool = resourceManager.createPool('development', mockDockerDriver, {
    maxContainers: 10,
    totalCPU: 20,
    totalMemory: '40GB',
    baseImage: 'openagent/dev:latest'
  });

  // Create production pool
  const prodPool = resourceManager.createPool('production', mockDockerDriver, {
    maxContainers: 50,
    totalCPU: 100,
    totalMemory: '200GB',
    baseImage: 'openagent/prod:latest'
  });

  console.log('Resource pools created:', { devPool, prodPool });

  // Allocate resources
  const container = await resourceManager.allocateResource('development', {
    cpu: 2,
    memory: '4GB',
    env: {
      ENVIRONMENT: 'development',
      DEBUG: 'true'
    }
  });

  console.log('Allocated container:', container.id);

  // Use container...
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Release resource
  await resourceManager.releaseResource('development', container.id);
  console.log('Released container:', container.id);
}
```

## Event-Driven Architecture

### Container Event Handling and Orchestration

```typescript
import { ContainerDriver, ContainerInstance } from '@openagent/driver-interface';
import { EventEmitter } from 'events';

interface ContainerEvent {
  type: 'created' | 'started' | 'stopped' | 'removed' | 'error' | 'health_check';
  containerId: string;
  timestamp: Date;
  data: any;
  sessionId?: string;
  userId?: string;
}

interface EventSubscription {
  id: string;
  eventType: string;
  filter?: (event: ContainerEvent) => boolean;
  callback: (event: ContainerEvent) => void;
}

class ContainerEventSystem extends EventEmitter {
  private subscriptions = new Map<string, EventSubscription>();

  constructor(private driver: ContainerDriver) {
    super();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen to container lifecycle events
    this.driver.on('containerCreated', (container: ContainerInstance) => {
      this.emitEvent({
        type: 'created',
        containerId: container.id,
        timestamp: new Date(),
        data: container
      });
    });

    this.driver.on('containerStarted', (containerId: string) => {
      this.emitEvent({
        type: 'started',
        containerId,
        timestamp: new Date(),
        data: { status: 'running' }
      });
    });

    this.driver.on('containerStopped', (containerId: string, exitCode: number) => {
      this.emitEvent({
        type: 'stopped',
        containerId,
        timestamp: new Date(),
        data: { exitCode }
      });
    });

    this.driver.on('containerError', (containerId: string, error: Error) => {
      this.emitEvent({
        type: 'error',
        containerId,
        timestamp: new Date(),
        data: { error: error.message, stack: error.stack }
      });
    });
  }

  subscribe(
    eventType: string,
    callback: (event: ContainerEvent) => void,
    filter?: (event: ContainerEvent) => boolean
  ): string {
    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      eventType,
      callback,
      filter
    });

    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
  }

  private emitEvent(event: ContainerEvent): void {
    // Emit to global listeners
    this.emit('containerEvent', event);

    // Notify specific subscribers
    for (const [subscriptionId, subscription] of this.subscriptions) {
      if (subscription.eventType === event.type || subscription.eventType === '*') {
        if (!subscription.filter || subscription.filter(event)) {
          try {
            subscription.callback(event);
          } catch (error) {
            console.error(`Error in subscription ${subscriptionId}:`, error);
          }
        }
      }
    }
  }
}

// Event-driven container orchestrator
class EventDrivenOrchestrator {
  private eventSystem: ContainerEventSystem;
  private activeContainers = new Map<string, ContainerInstance>();

  constructor(driver: ContainerDriver) {
    this.eventSystem = new ContainerEventSystem(driver);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle container errors
    this.eventSystem.subscribe('error', async (event) => {
      console.error(`Container error: ${event.containerId}`, event.data);

      // Attempt auto-recovery
      await this.attemptRecovery(event.containerId);
    });

    // Handle container stops
    this.eventSystem.subscribe('stopped', async (event) => {
      const container = this.activeContainers.get(event.containerId);
      if (container && event.data.exitCode !== 0) {
        console.warn(`Container ${event.containerId} stopped with exit code ${event.data.exitCode}`);

        // Restart container if it failed
        if (this.shouldRestart(container)) {
          await this.restartContainer(container);
        }
      }
    });

    // Monitor container health
    this.eventSystem.subscribe('health_check', async (event) => {
      if (event.data.status === 'unhealthy') {
        console.warn(`Container ${event.containerId} is unhealthy`);

        // Take remedial action
        await this.handleUnhealthyContainer(event.containerId);
      }
    });
  }

  async deployService(
    serviceName: string,
    config: ContainerConfig,
    healthCheck?: {
      path: string;
      interval: number;
      timeout: number;
      retries: number;
    }
  ): Promise<ContainerInstance> {
    const container = await this.eventSystem.driver.createContainer({
      ...config,
      labels: {
        ...config.labels,
        'openagent.service.name': serviceName,
        'openagent.service.deployed': new Date().toISOString()
      }
    });

    await this.eventSystem.driver.startContainer(container.id);
    this.activeContainers.set(container.id, container);

    // Setup health checks if provided
    if (healthCheck) {
      this.startHealthChecks(container.id, healthCheck);
    }

    return container;
  }

  private async attemptRecovery(containerId: string): Promise<void> {
    const container = this.activeContainers.get(containerId);
    if (!container) return;

    try {
      console.log(`Attempting recovery for container ${containerId}`);

      // Try to restart the container
      await this.restartContainer(container);

      console.log(`Recovery successful for container ${containerId}`);
    } catch (error) {
      console.error(`Recovery failed for container ${containerId}:`, error);

      // Remove and recreate container
      await this.eventSystem.driver.removeContainer(containerId);
      this.activeContainers.delete(containerId);

      // Recreate container if needed
      await this.recreateContainer(container);
    }
  }

  private async restartContainer(container: ContainerInstance): Promise<void> {
    await this.eventSystem.driver.stopContainer(container.id);
    await this.eventSystem.driver.startContainer(container.id);
  }

  private async recreateContainer(originalContainer: ContainerInstance): Promise<void> {
    // This would involve recreating the container with the same configuration
    // Implementation depends on storing original config
    console.log(`Recreating container ${originalContainer.id}`);
  }

  private shouldRestart(container: ContainerInstance): boolean {
    // Business logic for determining if a container should be restarted
    const labels = container.labels || {};
    return labels['openagent.restart.policy'] !== 'never';
  }

  private startHealthChecks(
    containerId: string,
    healthCheck: { path: string; interval: number; timeout: number; retries: number }
  ): void {
    const interval = setInterval(async () => {
      try {
        // Perform health check
        const result = await this.eventSystem.driver.execCommand(containerId, {
          command: `curl -f ${healthCheck.path} || exit 1`,
          timeout: healthCheck.timeout
        });

        this.eventSystem.emitEvent({
          type: 'health_check',
          containerId,
          timestamp: new Date(),
          data: {
            status: result.exitCode === 0 ? 'healthy' : 'unhealthy',
            lastCheck: new Date()
          }
        });
      } catch (error) {
        this.eventSystem.emitEvent({
          type: 'health_check',
          containerId,
          timestamp: new Date(),
          data: {
            status: 'unhealthy',
            lastCheck: new Date(),
            error: error.message
          }
        });
      }
    }, healthCheck.interval);

    // Store interval for cleanup
    this.activeContainers.get(containerId)!.healthCheckInterval = interval;
  }

  private async handleUnhealthyContainer(containerId: string): Promise<void> {
    const container = this.activeContainers.get(containerId);
    if (!container) return;

    // Clear health check interval
    if (container.healthCheckInterval) {
      clearInterval(container.healthCheckInterval);
    }

    // Attempt recovery
    await this.attemptRecovery(containerId);
  }
}

// Usage example
const orchestrator = new EventDrivenOrchestrator(mockDockerDriver);

async function setupEventDrivenServices() {
  // Subscribe to events
  const errorSubscription = orchestrator['eventSystem'].subscribe('error', (event) => {
    console.error('Container error occurred:', event);
  });

  // Deploy a service
  const serviceConfig: ContainerConfig = {
    image: 'openagent/web-service:latest',
    resources: {
      cpu: 1,
      memory: '2GB',
      disk: '5GB'
    },
    env: {
      NODE_ENV: 'production',
      PORT: '8080'
    },
    labels: {
      'openagent.restart.policy': 'always'
    }
  };

  const container = await orchestrator.deployService(
    'web-service',
    serviceConfig,
    {
      path: 'http://localhost:8080/health',
      interval: 30000,
      timeout: 5000,
      retries: 3
    }
  );

  console.log('Deployed service container:', container.id);

  // Let it run for a bit
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Cleanup
  orchestrator['eventSystem'].unsubscribe(errorSubscription);
}
```

## Monitoring and Observability

### Comprehensive Container Monitoring

```typescript
import { ContainerDriver, ContainerInstance } from '@openagent/driver-interface';

interface ContainerMetrics {
  containerId: string;
  timestamp: Date;
  cpu: {
    usage: number;
    limit: number;
    percentage: number;
  };
  memory: {
    usage: string;
    limit: string;
    percentage: number;
  };
  disk: {
    usage: string;
    limit: string;
    percentage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
  health: {
    status: 'healthy' | 'unhealthy' | 'unknown';
    lastCheck: Date;
    consecutiveFailures: number;
  };
}

interface AlertRule {
  id: string;
  name: string;
  condition: (metrics: ContainerMetrics) => boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actions: AlertAction[];
  cooldown: number;
}

interface AlertAction {
  type: 'log' | 'webhook' | 'email' | 'restart' | 'scale';
  config: any;
}

interface Alert {
  id: string;
  ruleId: string;
  containerId: string;
  severity: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

class ContainerMonitor {
  private metrics = new Map<string, ContainerMetrics[]>();
  private alertRules = new Map<string, AlertRule>();
  private activeAlerts = new Map<string, Alert>();
  private monitoringIntervals = new Map<string, NodeJS.Timeout>();

  constructor(
    private driver: ContainerDriver,
    private metricsRetentionPeriod = 3600000 // 1 hour
  ) {}

  startMonitoring(container: ContainerInstance, interval = 5000): void {
    const monitorInterval = setInterval(async () => {
      await this.collectMetrics(container);
      await this.evaluateAlerts(container);
    }, interval);

    this.monitoringIntervals.set(container.id, monitorInterval);
  }

  stopMonitoring(containerId: string): void {
    const interval = this.monitoringIntervals.get(containerId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(containerId);
    }
  }

  private async collectMetrics(container: ContainerInstance): Promise<void> {
    try {
      // Get container stats
      const stats = await this.driver.getContainerStats(container.id);

      // Get container info
      const containerInfo = await this.driver.getContainer(container.id);

      // Get recent logs
      const logs = await this.driver.getContainerLogs(container.id, { tail: 10 });

      // Parse metrics
      const metrics: ContainerMetrics = {
        containerId: container.id,
        timestamp: new Date(),
        cpu: {
          usage: stats.cpuUsage || 0,
          limit: containerInfo?.config?.resources?.cpu || 1,
          percentage: ((stats.cpuUsage || 0) / (containerInfo?.config?.resources?.cpu || 1)) * 100
        },
        memory: {
          usage: stats.memoryUsage || '0MB',
          limit: containerInfo?.config?.resources?.memory || '1GB',
          percentage: this.calculateMemoryPercentage(
            stats.memoryUsage || '0MB',
            containerInfo?.config?.resources?.memory || '1GB'
          )
        },
        disk: {
          usage: stats.diskUsage || '0MB',
          limit: containerInfo?.config?.resources?.disk || '5GB',
          percentage: this.calculateMemoryPercentage(
            stats.diskUsage || '0MB',
            containerInfo?.config?.resources?.disk || '5GB'
          )
        },
        network: {
          bytesIn: stats.networkBytesIn || 0,
          bytesOut: stats.networkBytesOut || 0,
          packetsIn: stats.networkPacketsIn || 0,
          packetsOut: stats.networkPacketsOut || 0
        },
        health: {
          status: this.determineHealthStatus(logs),
          lastCheck: new Date(),
          consecutiveFailures: this.countConsecutiveFailures(container.id)
        }
      };

      // Store metrics
      if (!this.metrics.has(container.id)) {
        this.metrics.set(container.id, []);
      }

      const containerMetrics = this.metrics.get(container.id)!;
      containerMetrics.push(metrics);

      // Clean up old metrics
      this.cleanupOldMetrics(container.id);

    } catch (error) {
      console.error(`Error collecting metrics for container ${container.id}:`, error);
    }
  }

  private async evaluateAlerts(container: ContainerInstance): Promise<void> {
    const currentMetrics = this.metrics.get(container.id);
    if (!currentMetrics || currentMetrics.length === 0) return;

    const latestMetrics = currentMetrics[currentMetrics.length - 1];

    for (const [ruleId, rule] of this.alertRules) {
      try {
        if (rule.condition(latestMetrics)) {
          await this.triggerAlert(rule, latestMetrics);
        } else {
          await this.resolveAlert(ruleId, container.id);
        }
      } catch (error) {
        console.error(`Error evaluating alert rule ${ruleId}:`, error);
      }
    }
  }

  private async triggerAlert(rule: AlertRule, metrics: ContainerMetrics): Promise<void> {
    const alertId = `${rule.id}-${metrics.containerId}`;
    const existingAlert = this.activeAlerts.get(alertId);

    // Check cooldown
    if (existingAlert && Date.now() - existingAlert.timestamp.getTime() < rule.cooldown) {
      return;
    }

    const alert: Alert = {
      id: alertId,
      ruleId: rule.id,
      containerId: metrics.containerId,
      severity: rule.severity,
      message: `Alert triggered: ${rule.name}`,
      timestamp: new Date(),
      resolved: false
    };

    this.activeAlerts.set(alertId, alert);

    // Execute alert actions
    for (const action of rule.actions) {
      await this.executeAlertAction(action, alert, metrics);
    }

    console.log(`Alert triggered: ${alert.message}`);
  }

  private async resolveAlert(ruleId: string, containerId: string): Promise<void> {
    const alertId = `${ruleId}-${containerId}`;
    const alert = this.activeAlerts.get(alertId);

    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      console.log(`Alert resolved: ${alert.message}`);
    }
  }

  private async executeAlertAction(action: AlertAction, alert: Alert, metrics: ContainerMetrics): Promise<void> {
    switch (action.type) {
      case 'log':
        console.log(`[${alert.severity.toUpperCase()}] ${alert.message}`);
        break;

      case 'webhook':
        await this.sendWebhook(action.config, alert, metrics);
        break;

      case 'email':
        await this.sendEmail(action.config, alert, metrics);
        break;

      case 'restart':
        await this.restartContainer(alert.containerId);
        break;

      case 'scale':
        await this.scaleContainer(alert.containerId, action.config);
        break;
    }
  }

  private async sendWebhook(config: any, alert: Alert, metrics: ContainerMetrics): Promise<void> {
    try {
      const payload = {
        alert,
        metrics,
        timestamp: new Date().toISOString()
      };

      // In a real implementation, this would send an HTTP request
      console.log(`Webhook sent to ${config.url}:`, payload);
    } catch (error) {
      console.error('Failed to send webhook:', error);
    }
  }

  private async sendEmail(config: any, alert: Alert, metrics: ContainerMetrics): Promise<void> {
    try {
      // In a real implementation, this would send an email
      console.log(`Email sent to ${config.to}: ${alert.message}`);
    } catch (error) {
      console.error('Failed to send email:', error);
    }
  }

  private async restartContainer(containerId: string): Promise<void> {
    try {
      await this.driver.stopContainer(containerId);
      await this.driver.startContainer(containerId);
      console.log(`Restarted container ${containerId}`);
    } catch (error) {
      console.error(`Failed to restart container ${containerId}:`, error);
    }
  }

  private async scaleContainer(containerId: string, config: any): Promise<void> {
    try {
      // In a real implementation, this would scale the container resources
      console.log(`Scaling container ${containerId} with config:`, config);
    } catch (error) {
      console.error(`Failed to scale container ${containerId}:`, error);
    }
  }

  private cleanupOldMetrics(containerId: string): void {
    const containerMetrics = this.metrics.get(containerId);
    if (!containerMetrics) return;

    const cutoffTime = Date.now() - this.metricsRetentionPeriod;
    const filteredMetrics = containerMetrics.filter(
      m => m.timestamp.getTime() > cutoffTime
    );

    this.metrics.set(containerId, filteredMetrics);
  }

  private calculateMemoryPercentage(usage: string, limit: string): number {
    const usageMB = this.parseMemory(usage);
    const limitMB = this.parseMemory(limit);
    return (usageMB / limitMB) * 100;
  }

  private parseMemory(memory: string): number {
    const match = memory.match(/(\d+(?:\.\d+)?)(MB|GB)/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    return unit === 'GB' ? value * 1024 : value;
  }

  private determineHealthStatus(logs: string[]): 'healthy' | 'unhealthy' | 'unknown' {
    if (logs.length === 0) return 'unknown';

    // Simple health check based on log content
    const recentLogs = logs.slice(-5).join('\n').toLowerCase();

    if (recentLogs.includes('error') || recentLogs.includes('exception')) {
      return 'unhealthy';
    }

    if (recentLogs.includes('ready') || recentLogs.includes('healthy')) {
      return 'healthy';
    }

    return 'unknown';
  }

  private countConsecutiveFailures(containerId: string): number {
    const containerMetrics = this.metrics.get(containerId);
    if (!containerMetrics || containerMetrics.length === 0) return 0;

    let consecutiveFailures = 0;
    for (let i = containerMetrics.length - 1; i >= 0; i--) {
      if (containerMetrics[i].health.status === 'unhealthy') {
        consecutiveFailures++;
      } else {
        break;
      }
    }

    return consecutiveFailures;
  }

  // Public methods for alert management
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
  }

  removeAlertRule(ruleId: string): void {
    this.alertRules.delete(ruleId);
  }

  getMetrics(containerId: string, timeRange?: { start: Date; end: Date }): ContainerMetrics[] {
    const containerMetrics = this.metrics.get(containerId) || [];

    if (!timeRange) {
      return containerMetrics;
    }

    return containerMetrics.filter(m =>
      m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
    );
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(a => !a.resolved);
  }
}

// Usage example
const monitor = new ContainerMonitor(mockDockerDriver);

// Define alert rules
const cpuAlertRule: AlertRule = {
  id: 'cpu-high-usage',
  name: 'High CPU Usage',
  condition: (metrics) => metrics.cpu.percentage > 80,
  severity: 'high',
  actions: [
    {
      type: 'log',
      config: {}
    },
    {
      type: 'webhook',
      config: { url: 'https://hooks.example.com/alerts' }
    }
  ],
  cooldown: 300000 // 5 minutes
};

const memoryAlertRule: AlertRule = {
  id: 'memory-high-usage',
  name: 'High Memory Usage',
  condition: (metrics) => metrics.memory.percentage > 90,
  severity: 'critical',
  actions: [
    {
      type: 'log',
      config: {}
    },
    {
      type: 'restart',
      config: {}
    }
  ],
  cooldown: 600000 // 10 minutes
};

async function setupMonitoring() {
  // Add alert rules
  monitor.addAlertRule(cpuAlertRule);
  monitor.addAlertRule(memoryAlertRule);

  // Create and monitor a container
  const container = await mockDockerDriver.createContainer({
    image: 'openagent/app:latest',
    resources: {
      cpu: 2,
      memory: '4GB',
      disk: '10GB'
    }
  });

  await mockDockerDriver.startContainer(container.id);

  // Start monitoring
  monitor.startMonitoring(container);

  console.log(`Started monitoring container ${container.id}`);

  // Let it run for monitoring
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Stop monitoring
  monitor.stopMonitoring(container.id);
  console.log(`Stopped monitoring container ${container.id}`);
}
```

## Security and Isolation

### Security-Focused Container Management

```typescript
import { ContainerDriver, ContainerConfig, ContainerInstance } from '@openagent/driver-interface';

interface SecurityConfig {
  readonly: boolean;
  nonRoot: boolean;
  noNewPrivileges: boolean;
  capabilities: {
    drop: string[];
    add: string[];
  };
  seccompProfile: string;
  apparmorProfile: string;
  runAsUser: number;
  runAsGroup: number;
  fsGroup: number;
}

interface SecurityPolicy {
  id: string;
  name: string;
  rules: SecurityRule[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: 'allow' | 'deny' | 'quarantine';
}

interface SecurityRule {
  type: 'image' | 'capability' | 'network' | 'volume' | 'env' | 'resource';
  condition: (config: ContainerConfig) => boolean;
  message: string;
}

interface SecurityScan {
  containerId: string;
  timestamp: Date;
  scanType: 'vulnerability' | 'configuration' | 'runtime';
  results: {
    vulnerabilities: Vulnerability[];
    configurationIssues: ConfigurationIssue[];
    compliance: ComplianceStatus;
  };
  score: number; // 0-100
}

interface Vulnerability {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  package: string;
  version: string;
  fixedVersion?: string;
  description: string;
}

interface ConfigurationIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
}

interface ComplianceStatus {
  compliant: boolean;
  standards: {
    name: string;
    version: string;
    compliant: boolean;
    issues: string[];
  }[];
}

class SecurityManager {
  private policies = new Map<string, SecurityPolicy>();
  private scans = new Map<string, SecurityScan[]>();
  private quarantinedContainers = new Set<string>();

  constructor(private driver: ContainerDriver) {}

  async createSecureContainer(
    baseConfig: ContainerConfig,
    securityConfig: Partial<SecurityConfig> = {}
  ): Promise<ContainerInstance> {
    // Apply security policies
    const evaluatedConfig = await this.evaluateSecurityPolicies(baseConfig);

    // Apply security hardening
    const secureConfig = this.applySecurityHardening(evaluatedConfig, securityConfig);

    // Create container with security settings
    const container = await this.driver.createContainer(secureConfig);

    // Perform initial security scan
    await this.performSecurityScan(container, 'vulnerability');

    return container;
  }

  private async evaluateSecurityPolicies(config: ContainerConfig): Promise<ContainerConfig> {
    const violations: string[] = [];

    for (const [policyId, policy] of this.policies) {
      for (const rule of policy.rules) {
        if (rule.condition(config)) {
          violations.push(`[${policy.severity.toUpperCase()}] ${policy.name}: ${rule.message}`);

          if (policy.action === 'deny') {
            throw new SecurityError(`Security policy violation: ${rule.message}`);
          }
        }
      }
    }

    if (violations.length > 0) {
      console.warn('Security policy violations detected:');
      violations.forEach(violation => console.warn(`  - ${violation}`));
    }

    return config;
  }

  private applySecurityHardening(
    config: ContainerConfig,
    additionalSecurity: Partial<SecurityConfig>
  ): ContainerConfig {
    const defaultSecurity: SecurityConfig = {
      readonly: true,
      nonRoot: true,
      noNewPrivileges: true,
      capabilities: {
        drop: ['ALL'],
        add: []
      },
      seccompProfile: 'runtime/default',
      apparmorProfile: 'docker-default',
      runAsUser: 1000,
      runAsGroup: 1000,
      fsGroup: 1000
    };

    const securityConfig = { ...defaultSecurity, ...additionalSecurity };

    return {
      ...config,
      securityOpts: [
        `no-new-privileges:${securityConfig.noNewPrivileges}`,
        `seccomp=${securityConfig.seccompProfile}`,
        `apparmor=${securityConfig.apparmorProfile}`
      ],
      capabilities: {
        drop: securityConfig.capabilities.drop,
        add: securityConfig.capabilities.add
      },
      user: `${securityConfig.runAsUser}:${securityConfig.runAsGroup}`,
      readonlyRootfs: securityConfig.readonly,
      labels: {
        ...config.labels,
        'security.hardened': 'true',
        'security.nonRoot': securityConfig.nonRoot.toString(),
        'security.scanRequired': 'true'
      }
    };
  }

  async performSecurityScan(
    container: ContainerInstance,
    scanType: 'vulnerability' | 'configuration' | 'runtime'
  ): Promise<SecurityScan> {
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    let results: SecurityScan['results'];
    let score = 100;

    switch (scanType) {
      case 'vulnerability':
        results = await this.scanVulnerabilities(container);
        break;
      case 'configuration':
        results = await this.scanConfiguration(container);
        break;
      case 'runtime':
        results = await this.scanRuntime(container);
        break;
    }

    // Calculate security score
    score = this.calculateSecurityScore(results);

    const scan: SecurityScan = {
      containerId: container.id,
      timestamp: new Date(),
      scanType,
      results,
      score
    };

    // Store scan results
    if (!this.scans.has(container.id)) {
      this.scans.set(container.id, []);
    }
    this.scans.get(container.id)!.push(scan);

    // Take action based on scan results
    await this.handleScanResults(scan);

    return scan;
  }

  private async scanVulnerabilities(container: ContainerInstance): Promise<SecurityScan['results']> {
    // Simulate vulnerability scan
    const vulnerabilities: Vulnerability[] = [
      {
        id: 'CVE-2023-1234',
        severity: 'high',
        package: 'openssl',
        version: '1.1.1',
        fixedVersion: '1.1.1t',
        description: 'OpenSSL vulnerability allows remote code execution'
      },
      {
        id: 'CVE-2023-5678',
        severity: 'medium',
        package: 'node',
        version: '18.0.0',
        fixedVersion: '18.17.0',
        description: 'Node.js prototype pollution vulnerability'
      }
    ];

    const configurationIssues: ConfigurationIssue[] = [];
    const compliance: ComplianceStatus = {
      compliant: false,
      standards: [
        {
          name: 'CIS Docker Benchmark',
          version: '1.3.1',
          compliant: false,
          issues: ['Container running as root', 'No seccomp profile applied']
        }
      ]
    };

    return { vulnerabilities, configurationIssues, compliance };
  }

  private async scanConfiguration(container: ContainerInstance): Promise<SecurityScan['results']> {
    const issues: ConfigurationIssue[] = [];

    // Check container configuration
    if (!container.labels?.['security.hardened']) {
      issues.push({
        type: 'security_hardening',
        severity: 'high',
        description: 'Container is not security hardened',
        recommendation: 'Apply security hardening settings'
      });
    }

    // Check for privileged mode
    if (container.labels?.['privileged'] === 'true') {
      issues.push({
        type: 'privileged_mode',
        severity: 'critical',
        description: 'Container running in privileged mode',
        recommendation: 'Remove privileged mode and use specific capabilities'
      });
    }

    return {
      vulnerabilities: [],
      configurationIssues: issues,
      compliance: {
        compliant: issues.length === 0,
        standards: [
          {
            name: 'Security Configuration',
            version: '1.0',
            compliant: issues.length === 0,
            issues: issues.map(i => i.description)
          }
        ]
      }
    };
  }

  private async scanRuntime(container: ContainerInstance): Promise<SecurityScan['results']> {
    // Simulate runtime security scan
    const stats = await this.driver.getContainerStats(container.id);
    const logs = await this.driver.getContainerLogs(container.id, { tail: 100 });

    const issues: ConfigurationIssue[] = [];

    // Check for suspicious processes
    if (stats.processCount > 50) {
      issues.push({
        type: 'process_count',
        severity: 'medium',
        description: 'High number of processes detected',
        recommendation: 'Investigate process activity'
      });
    }

    // Check for suspicious log entries
    const suspiciousLogEntries = logs.filter(log =>
      log.includes('unauthorized') ||
      log.includes('permission denied') ||
      log.includes('access denied')
    );

    if (suspiciousLogEntries.length > 0) {
      issues.push({
        type: 'suspicious_activity',
        severity: 'high',
        description: 'Suspicious activity detected in logs',
        recommendation: 'Review logs and investigate'
      });
    }

    return {
      vulnerabilities: [],
      configurationIssues: issues,
      compliance: {
        compliant: issues.length === 0,
        standards: [
          {
            name: 'Runtime Security',
            version: '1.0',
            compliant: issues.length === 0,
            issues: issues.map(i => i.description)
          }
        ]
      }
    };
  }

  private calculateSecurityScore(results: SecurityScan['results']): number {
    let score = 100;

    // Deduct points for vulnerabilities
    results.vulnerabilities.forEach(vuln => {
      switch (vuln.severity) {
        case 'critical':
          score -= 25;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 8;
          break;
        case 'low':
          score -= 3;
          break;
      }
    });

    // Deduct points for configuration issues
    results.configurationIssues.forEach(issue => {
      switch (issue.severity) {
        case 'critical':
          score -= 20;
          break;
        case 'high':
          score -= 12;
          break;
        case 'medium':
          score -= 6;
          break;
        case 'low':
          score -= 2;
          break;
      }
    });

    return Math.max(0, score);
  }

  private async handleScanResults(scan: SecurityScan): Promise<void> {
    // If score is too low, quarantine the container
    if (scan.score < 50) {
      await this.quarantineContainer(scan.containerId);
    }

    // If critical vulnerabilities found, stop the container
    const criticalVulns = scan.results.vulnerabilities.filter(v => v.severity === 'critical');
    if (criticalVulns.length > 0) {
      await this.driver.stopContainer(scan.containerId);
      console.log(`Stopped container ${scan.containerId} due to critical vulnerabilities`);
    }
  }

  private async quarantineContainer(containerId: string): Promise<void> {
    try {
      // Stop container
      await this.driver.stopContainer(containerId);

      // Add to quarantine
      this.quarantinedContainers.add(containerId);

      console.log(`Quarantined container ${containerId}`);
    } catch (error) {
      console.error(`Failed to quarantine container ${containerId}:`, error);
    }
  }

  async releaseFromQuarantine(containerId: string): Promise<void> {
    if (!this.quarantinedContainers.has(containerId)) {
      throw new Error(`Container ${containerId} is not quarantined`);
    }

    // Perform security scan before release
    const container = await this.driver.getContainer(containerId);
    if (container) {
      await this.performSecurityScan(container, 'vulnerability');
    }

    this.quarantinedContainers.delete(containerId);
    console.log(`Released container ${containerId} from quarantine`);
  }

  // Public methods for security management
  addSecurityPolicy(policy: SecurityPolicy): void {
    this.policies.set(policy.id, policy);
  }

  removeSecurityPolicy(policyId: string): void {
    this.policies.delete(policyId);
  }

  getSecurityScans(containerId: string): SecurityScan[] {
    return this.scans.get(containerId) || [];
  }

  getQuarantinedContainers(): string[] {
    return Array.from(this.quarantinedContainers);
  }
}

class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

// Usage example
const securityManager = new SecurityManager(mockDockerDriver);

// Define security policies
const securityPolicies: SecurityPolicy[] = [
  {
    id: 'no-privileged',
    name: 'No Privileged Containers',
    rules: [
      {
        type: 'image',
        condition: (config) => config.labels?.['privileged'] === 'true',
        message: 'Privileged containers are not allowed'
      }
    ],
    severity: 'critical',
    action: 'deny'
  },
  {
    id: 'trusted-images',
    name: 'Trusted Images Only',
    rules: [
      {
        type: 'image',
        condition: (config) => !config.image.startsWith('openagent/'),
        message: 'Only trusted openagent images are allowed'
      }
    ],
    severity: 'high',
    action: 'deny'
  }
];

async function setupSecurity() {
  // Add security policies
  securityPolicies.forEach(policy => securityManager.addSecurityPolicy(policy));

  // Create secure container
  const containerConfig: ContainerConfig = {
    image: 'openagent/app:latest',
    resources: {
      cpu: 1,
      memory: '2GB',
      disk: '5GB'
    },
    labels: {
      'environment': 'production'
    }
  };

  const securityConfig: Partial<SecurityConfig> = {
    readonly: true,
    nonRoot: true,
    noNewPrivileges: true,
    capabilities: {
      drop: ['ALL'],
      add: ['NET_BIND_SERVICE']
    }
  };

  const container = await securityManager.createSecureContainer(containerConfig, securityConfig);
  console.log('Created secure container:', container.id);

  // Start container
  await mockDockerDriver.startContainer(container.id);

  // Perform security scans
  const vulnScan = await securityManager.performSecurityScan(container, 'vulnerability');
  console.log('Vulnerability scan score:', vulnScan.score);

  const configScan = await securityManager.performSecurityScan(container, 'configuration');
  console.log('Configuration scan score:', configScan.score);

  // Runtime monitoring
  setInterval(async () => {
    const runtimeScan = await securityManager.performSecurityScan(container, 'runtime');
    console.log('Runtime scan score:', runtimeScan.score);
  }, 30000);
}
```

## Multi-Agent Coordination

### Agent-to-Agent Communication and Orchestration

```typescript
import { ContainerDriver, ContainerConfig, ContainerInstance } from '@openagent/driver-interface';

interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'broadcast' | 'heartbeat';
  content: any;
  timestamp: Date;
  correlationId?: string;
}

interface AgentCapability {
  name: string;
  version: string;
  description: string;
  inputSchema: any;
  outputSchema: any;
}

interface AgentRegistry {
  [agentId: string]: {
    containerId: string;
    capabilities: AgentCapability[];
    status: 'active' | 'inactive' | 'busy';
    lastSeen: Date;
    metadata: any;
  };
}

class AgentCoordinator {
  private registry: AgentRegistry = {};
  private messageQueue = new Map<string, AgentMessage[]>();
  private activeTasks = new Map<string, Promise<any>>();
  private heartbeatIntervals = new Map<string, NodeJS.Timeout>();

  constructor(
    private driver: ContainerDriver,
    private heartbeatInterval = 30000
  ) {}

  async registerAgent(
    agentId: string,
    containerId: string,
    capabilities: AgentCapability[],
    metadata: any = {}
  ): Promise<void> {
    this.registry[agentId] = {
      containerId,
      capabilities,
      status: 'active',
      lastSeen: new Date(),
      metadata
    };

    // Setup heartbeat monitoring
    this.setupHeartbeat(agentId);

    // Initialize message queue
    this.messageQueue.set(agentId, []);

    console.log(`Agent ${agentId} registered with capabilities:`, capabilities.map(c => c.name));
  }

  async unregisterAgent(agentId: string): Promise<void> {
    delete this.registry[agentId];
    this.messageQueue.delete(agentId);

    // Clear heartbeat
    const heartbeatInterval = this.heartbeatIntervals.get(agentId);
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      this.heartbeatIntervals.delete(agentId);
    }

    console.log(`Agent ${agentId} unregistered`);
  }

  async sendMessage(
    from: string,
    to: string,
    content: any,
    type: 'request' | 'response' | 'broadcast' = 'request',
    correlationId?: string
  ): Promise<AgentMessage> {
    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      from,
      to,
      type,
      content,
      timestamp: new Date(),
      correlationId
    };

    // Validate recipient
    if (!this.registry[to]) {
      throw new Error(`Agent ${to} not found in registry`);
    }

    // Add to recipient's queue
    const queue = this.messageQueue.get(to);
    if (queue) {
      queue.push(message);
    }

    // If it's a request, wait for response
    if (type === 'request') {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Request timeout for message ${message.id}`));
        }, 30000);

        const checkResponse = setInterval(() => {
          const response = this.findResponse(message.id);
          if (response) {
            clearTimeout(timeout);
            clearInterval(checkResponse);
            resolve(response);
          }
        }, 100);
      });
    }

    return message;
  }

  async broadcastMessage(
    from: string,
    content: any,
    filter?: (agentId: string, agent: AgentRegistry[string]) => boolean
  ): Promise<AgentMessage[]> {
    const recipients = Object.keys(this.registry).filter(agentId => {
      if (agentId === from) return false;
      if (filter) return filter(agentId, this.registry[agentId]);
      return true;
    });

    const messages: AgentMessage[] = [];

    for (const recipient of recipients) {
      const message = await this.sendMessage(from, recipient, content, 'broadcast');
      messages.push(message);
    }

    return messages;
  }

  async coordinateTask(
    taskId: string,
    task: any,
    requiredCapabilities: string[],
    timeout = 60000
  ): Promise<any> {
    // Find suitable agents
    const suitableAgents = this.findAgentsWithCapabilities(requiredCapabilities);

    if (suitableAgents.length === 0) {
      throw new Error(`No agents found with required capabilities: ${requiredCapabilities.join(', ')}`);
    }

    // Select the best available agent
    const selectedAgent = this.selectBestAgent(suitableAgents);

    // Mark agent as busy
    this.registry[selectedAgent].status = 'busy';

    try {
      // Send task to agent
      const taskMessage = await this.sendMessage('coordinator', selectedAgent, {
        type: 'task',
        taskId,
        task,
        requiredCapabilities
      });

      // Wait for completion
      const result = await Promise.race([
        this.waitForTaskCompletion(taskMessage.id),
        this.createTimeout(timeout)
      ]);

      return result;
    } finally {
      // Mark agent as active again
      if (this.registry[selectedAgent]) {
        this.registry[selectedAgent].status = 'active';
      }
    }
  }

  async processMessages(agentId: string): Promise<AgentMessage[]> {
    const queue = this.messageQueue.get(agentId);
    if (!queue || queue.length === 0) return [];

    const messages = [...queue];
    queue.length = 0;

    // Process messages
    const responses: AgentMessage[] = [];

    for (const message of messages) {
      try {
        const response = await this.handleMessage(agentId, message);
        if (response) {
          responses.push(response);
        }
      } catch (error) {
        console.error(`Error processing message ${message.id} for agent ${agentId}:`, error);
      }
    }

    return responses;
  }

  private async handleMessage(agentId: string, message: AgentMessage): Promise<AgentMessage | null> {
    const agent = this.registry[agentId];
    if (!agent) return null;

    // Update last seen
    agent.lastSeen = new Date();

    switch (message.type) {
      case 'request':
        // Execute request in container
        return await this.executeRequest(agent.containerId, message);

      case 'heartbeat':
        // Heartbeat response
        return null;

      case 'broadcast':
        // Handle broadcast
        return null;

      default:
        console.warn(`Unknown message type: ${message.type}`);
        return null;
    }
  }

  private async executeRequest(containerId: string, message: AgentMessage): Promise<AgentMessage> {
    try {
      // Execute command in container
      const result = await this.driver.execCommand(containerId, {
        command: `node -e "const handler = require('./handler'); handler.handleRequest(${JSON.stringify(message.content)})"`,
        timeout: 30000,
        captureOutput: true
      });

      return {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        from: containerId,
        to: message.from,
        type: 'response',
        content: {
          success: result.exitCode === 0,
          output: result.stdout,
          error: result.stderr,
          exitCode: result.exitCode
        },
        timestamp: new Date(),
        correlationId: message.id
      };
    } catch (error) {
      return {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        from: containerId,
        to: message.from,
        type: 'response',
        content: {
          success: false,
          error: error.message
        },
        timestamp: new Date(),
        correlationId: message.id
      };
    }
  }

  private setupHeartbeat(agentId: string): void {
    const interval = setInterval(async () => {
      try {
        await this.driver.execCommand(this.registry[agentId].containerId, {
          command: 'echo "heartbeat"',
          timeout: 5000
        });

        // Update heartbeat
        this.registry[agentId].lastSeen = new Date();
      } catch (error) {
        console.warn(`Heartbeat failed for agent ${agentId}:`, error);

        // Mark as inactive
        this.registry[agentId].status = 'inactive';
      }
    }, this.heartbeatInterval);

    this.heartbeatIntervals.set(agentId, interval);
  }

  private findAgentsWithCapabilities(requiredCapabilities: string[]): string[] {
    return Object.keys(this.registry).filter(agentId => {
      const agent = this.registry[agentId];
      if (agent.status !== 'active') return false;

      return requiredCapabilities.every(capability =>
        agent.capabilities.some(agentCap => agentCap.name === capability)
      );
    });
  }

  private selectBestAgent(agents: string[]): string {
    // Simple selection strategy: least recently used
    return agents.reduce((best, current) => {
      const bestAgent = this.registry[best];
      const currentAgent = this.registry[current];

      return currentAgent.lastSeen < bestAgent.lastSeen ? current : best;
    });
  }

  private findResponse(correlationId: string): AgentMessage | undefined {
    for (const [agentId, queue] of this.messageQueue) {
      const response = queue.find(msg => msg.correlationId === correlationId);
      if (response) {
        // Remove from queue
        const index = queue.indexOf(response);
        queue.splice(index, 1);
        return response;
      }
    }
    return undefined;
  }

  private async waitForTaskCompletion(messageId: string): Promise<any> {
    return new Promise((resolve) => {
      const checkCompletion = setInterval(() => {
        const response = this.findResponse(messageId);
        if (response) {
          clearInterval(checkCompletion);
          resolve(response.content);
        }
      }, 100);
    });
  }

  private createTimeout(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Task timeout')), timeout);
    });
  }

  // Public methods for coordination
  getActiveAgents(): string[] {
    return Object.keys(this.registry).filter(agentId =>
      this.registry[agentId].status === 'active'
    );
  }

  getAgentCapabilities(agentId: string): AgentCapability[] {
    return this.registry[agentId]?.capabilities || [];
  }

  getRegistryStatus(): any {
    return {
      totalAgents: Object.keys(this.registry).length,
      activeAgents: this.getActiveAgents().length,
      busyAgents: Object.keys(this.registry).filter(agentId =>
        this.registry[agentId].status === 'busy'
      ).length,
      agents: this.registry
    };
  }
}

// Usage example
const coordinator = new AgentCoordinator(mockDockerDriver);

async function setupAgentCoordination() {
  // Create agent containers
  const dataProcessorConfig: ContainerConfig = {
    image: 'openagent/data-processor:latest',
    resources: {
      cpu: 2,
      memory: '4GB',
      disk: '10GB'
    }
  };

  const mlModelConfig: ContainerConfig = {
    image: 'openagent/ml-model:latest',
    resources: {
      cpu: 4,
      memory: '8GB',
      disk: '20GB'
    }
  };

  const dataProcessor = await mockDockerDriver.createContainer(dataProcessorConfig);
  const mlModel = await mockDockerDriver.createContainer(mlModelConfig);

  await mockDockerDriver.startContainer(dataProcessor.id);
  await mockDockerDriver.startContainer(mlModel.id);

  // Register agents
  await coordinator.registerAgent('data-processor', dataProcessor.id, [
    {
      name: 'data-cleaning',
      version: '1.0.0',
      description: 'Clean and preprocess data',
      inputSchema: { type: 'object', properties: { data: { type: 'array' } } },
      outputSchema: { type: 'object', properties: { cleanedData: { type: 'array' } } }
    },
    {
      name: 'data-transformation',
      version: '1.0.0',
      description: 'Transform data into required format',
      inputSchema: { type: 'object', properties: { data: { type: 'array' } } },
      outputSchema: { type: 'object', properties: { transformedData: { type: 'array' } } }
    }
  ]);

  await coordinator.registerAgent('ml-model', mlModel.id, [
    {
      name: 'model-training',
      version: '1.0.0',
      description: 'Train machine learning models',
      inputSchema: { type: 'object', properties: { trainingData: { type: 'array' } } },
      outputSchema: { type: 'object', properties: { model: { type: 'string' } } }
    },
    {
      name: 'prediction',
      version: '1.0.0',
      description: 'Make predictions using trained models',
      inputSchema: { type: 'object', properties: { model: { type: 'string' }, data: { type: 'array' } } },
      outputSchema: { type: 'object', properties: { predictions: { type: 'array' } } }
    }
  ]);

  console.log('Agents registered successfully');

  // Coordinate a task
  try {
    const result = await coordinator.coordinateTask('ml-pipeline', {
      steps: [
        { agent: 'data-processor', capability: 'data-cleaning' },
        { agent: 'data-processor', capability: 'data-transformation' },
        { agent: 'ml-model', capability: 'model-training' },
        { agent: 'ml-model', capability: 'prediction' }
      ],
      inputData: [1, 2, 3, 4, 5]
    }, ['data-cleaning', 'data-transformation', 'model-training', 'prediction']);

    console.log('Task completed:', result);
  } catch (error) {
    console.error('Task failed:', error);
  }

  // Get registry status
  console.log('Registry status:', coordinator.getRegistryStatus());
}
```

## Configuration Management

### Dynamic Configuration and Deployment Management

```typescript
import { ContainerDriver, ContainerConfig, ContainerInstance } from '@openagent/driver-interface';

interface ConfigurationTemplate {
  id: string;
  name: string;
  version: string;
  description: string;
  baseConfig: ContainerConfig;
  environmentOverrides: Record<string, Partial<ContainerConfig>>;
  parameters: ConfigParameter[];
  validationRules: ValidationRule[];
}

interface ConfigParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  defaultValue?: any;
  validation?: ValidationRule[];
}

interface ValidationRule {
  type: 'min' | 'max' | 'enum' | 'regex' | 'custom';
  value: any;
  message: string;
}

interface DeploymentConfig {
  templateId: string;
  environment: string;
  parameters: Record<string, any>;
  overrides: Partial<ContainerConfig>;
  scaling: {
    minInstances: number;
    maxInstances: number;
    targetCPU?: number;
    targetMemory?: number;
  };
  healthCheck?: {
    path: string;
    interval: number;
    timeout: number;
    retries: number;
  };
}

class ConfigurationManager {
  private templates = new Map<string, ConfigurationTemplate>();
  private deployments = new Map<string, DeploymentConfig>();
  private activeConfigs = new Map<string, ContainerConfig[]>();

  constructor(private driver: ContainerDriver) {}

  async createTemplate(template: ConfigurationTemplate): Promise<void> {
    // Validate template
    this.validateTemplate(template);

    this.templates.set(template.id, template);
    console.log(`Created configuration template: ${template.name} (${template.id})`);
  }

  async deployConfiguration(
    deploymentId: string,
    config: DeploymentConfig
  ): Promise<ContainerInstance[]> {
    const template = this.templates.get(config.templateId);
    if (!template) {
      throw new Error(`Template ${config.templateId} not found`);
    }

    // Validate deployment configuration
    this.validateDeployment(config, template);

    // Generate container configurations
    const containerConfigs = await this.generateContainerConfigs(config, template);

    // Store deployment
    this.deployments.set(deploymentId, config);

    // Deploy containers
    const containers: ContainerInstance[] = [];

    for (let i = 0; i < config.scaling.minInstances; i++) {
      const containerConfig = containerConfigs[i];
      const container = await this.driver.createContainer(containerConfig);
      await this.driver.startContainer(container.id);
      containers.push(container);
    }

    // Store active configurations
    this.activeConfigs.set(deploymentId, containerConfigs);

    console.log(`Deployed configuration ${deploymentId} with ${containers.length} containers`);

    return containers;
  }

  async updateDeployment(
    deploymentId: string,
    updates: Partial<DeploymentConfig>
  ): Promise<ContainerInstance[]> {
    const existingDeployment = this.deployments.get(deploymentId);
    if (!existingDeployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    // Merge updates
    const updatedConfig = { ...existingDeployment, ...updates };

    // Validate updated configuration
    const template = this.templates.get(updatedConfig.templateId);
    if (!template) {
      throw new Error(`Template ${updatedConfig.templateId} not found`);
    }

    this.validateDeployment(updatedConfig, template);

    // Generate new configurations
    const newConfigs = await this.generateContainerConfigs(updatedConfig, template);

    // Perform rolling update
    const containers = await this.performRollingUpdate(deploymentId, newConfigs);

    // Update deployment
    this.deployments.set(deploymentId, updatedConfig);
    this.activeConfigs.set(deploymentId, newConfigs);

    console.log(`Updated deployment ${deploymentId} with rolling update`);

    return containers;
  }

  async scaleDeployment(
    deploymentId: string,
    targetInstances: number
  ): Promise<ContainerInstance[]> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    const template = this.templates.get(deployment.templateId);
    if (!template) {
      throw new Error(`Template ${deployment.templateId} not found`);
    }

    // Validate scaling
    if (targetInstances < deployment.scaling.minInstances ||
        targetInstances > deployment.scaling.maxInstances) {
      throw new Error(`Target instances must be between ${deployment.scaling.minInstances} and ${deployment.scaling.maxInstances}`);
    }

    // Get current containers
    const currentConfigs = this.activeConfigs.get(deploymentId) || [];
    const currentCount = currentConfigs.length;

    if (targetInstances > currentCount) {
      // Scale up
      const newConfigs = await this.generateContainerConfigs(deployment, template);
      const newContainers: ContainerInstance[] = [];

      for (let i = currentCount; i < targetInstances; i++) {
        const containerConfig = newConfigs[i % newConfigs.length];
        const container = await this.driver.createContainer(containerConfig);
        await this.driver.startContainer(container.id);
        newContainers.push(container);
      }

      // Update active configs
      const updatedConfigs = [...currentConfigs, ...newConfigs.slice(0, targetInstances - currentCount)];
      this.activeConfigs.set(deploymentId, updatedConfigs);

      console.log(`Scaled up deployment ${deploymentId} to ${targetInstances} instances`);

      return newContainers;
    } else if (targetInstances < currentCount) {
      // Scale down
      const containersToRemove = currentCount - targetInstances;
      const configs = this.activeConfigs.get(deploymentId) || [];

      // Remove containers (gracefully)
      for (let i = 0; i < containersToRemove; i++) {
        const configIndex = configs.length - 1 - i;
        if (configIndex >= 0) {
          const config = configs[configIndex];

          // In a real implementation, we'd need to track actual container IDs
          // For now, we'll just remove the config
          configs.splice(configIndex, 1);
        }
      }

      this.activeConfigs.set(deploymentId, configs);
      console.log(`Scaled down deployment ${deploymentId} to ${targetInstances} instances`);
    }

    return [];
  }

  private async generateContainerConfigs(
    deployment: DeploymentConfig,
    template: ConfigurationTemplate
  ): Promise<ContainerConfig[]> {
    const configs: ContainerConfig[] = [];

    // Apply environment overrides
    const baseConfig = this.mergeConfig(
      template.baseConfig,
      template.environmentOverrides[deployment.environment] || {}
    );

    // Apply parameters
    const configWithParams = this.applyParameters(baseConfig, deployment.parameters);

    // Apply deployment overrides
    const finalConfig = this.mergeConfig(configWithParams, deployment.overrides);

    // Generate configurations for scaling
    for (let i = 0; i < deployment.scaling.maxInstances; i++) {
      const instanceConfig: ContainerConfig = {
        ...finalConfig,
        labels: {
          ...finalConfig.labels,
          'openagent.deployment.id': deployment.templateId,
          'openagent.deployment.environment': deployment.environment,
          'openagent.instance.index': i.toString(),
          'openagent.instance.name': `${deployment.templateId}-${i}`
        },
        env: {
          ...finalConfig.env,
          INSTANCE_ID: i.toString(),
          INSTANCE_NAME: `${deployment.templateId}-${i}`
        }
      };

      configs.push(instanceConfig);
    }

    return configs;
  }

  private mergeConfig(base: ContainerConfig, override: Partial<ContainerConfig>): ContainerConfig {
    return {
      image: override.image || base.image,
      resources: {
        cpu: override.resources?.cpu || base.resources?.cpu || 1,
        memory: override.resources?.memory || base.resources?.memory || '1GB',
        disk: override.resources?.disk || base.resources?.disk || '5GB'
      },
      env: {
        ...base.env,
        ...override.env
      },
      volumes: [
        ...(base.volumes || []),
        ...(override.volumes || [])
      ],
      ports: [
        ...(base.ports || []),
        ...(override.ports || [])
      ],
      labels: {
        ...base.labels,
        ...override.labels
      },
      securityOpts: override.securityOpts || base.securityOpts,
      capabilities: override.capabilities || base.capabilities,
      user: override.user || base.user,
      readonlyRootfs: override.readonlyRootfs !== undefined ? override.readonlyRootfs : base.readonlyRootfs
    };
  }

  private applyParameters(config: ContainerConfig, parameters: Record<string, any>): ContainerConfig {
    const result = JSON.parse(JSON.stringify(config)); // Deep clone

    // Apply parameters to environment variables
    if (result.env) {
      for (const [key, value] of Object.entries(parameters)) {
        result.env[key] = String(value);
      }
    }

    // Apply parameters to labels
    if (result.labels) {
      for (const [key, value] of Object.entries(parameters)) {
        result.labels[key] = String(value);
      }
    }

    return result;
  }

  private async performRollingUpdate(
    deploymentId: string,
    newConfigs: ContainerConfig[]
  ): Promise<ContainerInstance[]> {
    const currentConfigs = this.activeConfigs.get(deploymentId) || [];
    const newContainers: ContainerInstance[] = [];

    // In a real implementation, this would:
    // 1. Create new containers with new configuration
    // 2. Wait for them to be healthy
    // 3. Remove old containers one by one
    // 4. Ensure service continuity

    for (let i = 0; i < newConfigs.length; i++) {
      const newConfig = newConfigs[i];
      const container = await this.driver.createContainer(newConfig);
      await this.driver.startContainer(container.id);
      newContainers.push(container);

      // Wait a bit between container updates
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return newContainers;
  }

  private validateTemplate(template: ConfigurationTemplate): void {
    // Basic validation
    if (!template.id || !template.name || !template.baseConfig) {
      throw new Error('Template must have id, name, and baseConfig');
    }

    // Validate parameters
    for (const param of template.parameters) {
      if (!param.name || !param.type) {
        throw new Error(`Parameter must have name and type: ${JSON.stringify(param)}`);
      }
    }
  }

  private validateDeployment(deployment: DeploymentConfig, template: ConfigurationTemplate): void {
    // Validate required parameters
    for (const param of template.parameters) {
      if (param.required && !(param.name in deployment.parameters)) {
        throw new Error(`Required parameter missing: ${param.name}`);
      }
    }

    // Validate parameter values
    for (const [paramName, paramValue] of Object.entries(deployment.parameters)) {
      const param = template.parameters.find(p => p.name === paramName);
      if (param && param.validation) {
        for (const rule of param.validation) {
          if (!this.validateParameter(paramValue, rule)) {
            throw new Error(`Parameter validation failed for ${paramName}: ${rule.message}`);
          }
        }
      }
    }
  }

  private validateParameter(value: any, rule: ValidationRule): boolean {
    switch (rule.type) {
      case 'min':
        return typeof value === 'number' && value >= rule.value;
      case 'max':
        return typeof value === 'number' && value <= rule.value;
      case 'enum':
        return rule.value.includes(value);
      case 'regex':
        return new RegExp(rule.value).test(String(value));
      case 'custom':
        return rule.value(value);
      default:
        return true;
    }
  }

  // Public methods for configuration management
  getTemplate(templateId: string): ConfigurationTemplate | undefined {
    return this.templates.get(templateId);
  }

  getDeployment(deploymentId: string): DeploymentConfig | undefined {
    return this.deployments.get(deploymentId);
  }

  getActiveConfigs(deploymentId: string): ContainerConfig[] | undefined {
    return this.activeConfigs.get(deploymentId);
  }

  listTemplates(): ConfigurationTemplate[] {
    return Array.from(this.templates.values());
  }

  listDeployments(): { deploymentId: string; deployment: DeploymentConfig }[] {
    return Array.from(this.deployments.entries()).map(([deploymentId, deployment]) => ({
      deploymentId,
      deployment
    }));
  }
}

// Usage example
const configManager = new ConfigurationManager(mockDockerDriver);

async function setupConfigurationManagement() {
  // Create configuration template
  const webAppTemplate: ConfigurationTemplate = {
    id: 'webapp-v1',
    name: 'Web Application',
    version: '1.0.0',
    description: 'Standard web application configuration',
    baseConfig: {
      image: 'openagent/webapp:latest',
      resources: {
        cpu: 1,
        memory: '2GB',
        disk: '5GB'
      },
      env: {
        NODE_ENV: 'production',
        PORT: '3000'
      },
      ports: [
        {
          containerPort: 3000,
          hostPort: 3000
        }
      ],
      labels: {
        'openagent.template': 'webapp-v1'
      }
    },
    environmentOverrides: {
      development: {
        env: {
          NODE_ENV: 'development',
          DEBUG: 'true'
        },
        resources: {
          cpu: 0.5,
          memory: '1GB'
        }
      },
      production: {
        env: {
          NODE_ENV: 'production',
          DEBUG: 'false'
        },
        resources: {
          cpu: 2,
          memory: '4GB'
        }
      }
    },
    parameters: [
      {
        name: 'LOG_LEVEL',
        type: 'string',
        description: 'Logging level',
        required: false,
        defaultValue: 'info',
        validation: [
          {
            type: 'enum',
            value: ['debug', 'info', 'warn', 'error'],
            message: 'Log level must be one of: debug, info, warn, error'
          }
        ]
      },
      {
        name: 'MAX_WORKERS',
        type: 'number',
        description: 'Maximum number of worker processes',
        required: false,
        defaultValue: 4,
        validation: [
          {
            type: 'min',
            value: 1,
            message: 'Max workers must be at least 1'
          },
          {
            type: 'max',
            value: 16,
            message: 'Max workers cannot exceed 16'
          }
        ]
      }
    ],
    validationRules: []
  };

  // Create template
  await configManager.createTemplate(webAppTemplate);

  // Deploy configuration
  const deploymentConfig: DeploymentConfig = {
    templateId: 'webapp-v1',
    environment: 'production',
    parameters: {
      LOG_LEVEL: 'warn',
      MAX_WORKERS: 8
    },
    overrides: {
      env: {
        CUSTOM_SETTING: 'enabled'
      }
    },
    scaling: {
      minInstances: 2,
      maxInstances: 10,
      targetCPU: 70
    },
    healthCheck: {
      path: '/health',
      interval: 30000,
      timeout: 5000,
      retries: 3
    }
  };

  const containers = await configManager.deployConfiguration('webapp-prod', deploymentConfig);
  console.log('Deployed containers:', containers.length);

  // Scale deployment
  await configManager.scaleDeployment('webapp-prod', 4);
  console.log('Scaled deployment to 4 instances');

  // Update deployment
  await configManager.updateDeployment('webapp-prod', {
    parameters: {
      LOG_LEVEL: 'info'
    }
  });
  console.log('Updated deployment configuration');
}
```

These examples demonstrate comprehensive integration patterns between the Container Driver Interface and the broader OpenAgent ecosystem, including:

1. **Agent Session Management** - Lifecycle management for agent execution environments
2. **Code Execution Environment** - Secure, isolated code execution with resource management
3. **Resource Pooling and Scaling** - Dynamic resource allocation and scaling
4. **Event-Driven Architecture** - Container event handling and orchestration
5. **Monitoring and Observability** - Comprehensive container monitoring and alerting
6. **Security and Isolation** - Security-focused container management with policies
7. **Multi-Agent Coordination** - Agent-to-agent communication and task coordination
8. **Configuration Management** - Dynamic configuration and deployment management

Each example provides practical, production-ready implementations that can be adapted to specific use cases within the OpenAgent ecosystem.