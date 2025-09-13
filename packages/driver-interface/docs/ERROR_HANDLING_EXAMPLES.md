# Error Handling Examples

## Overview

This document provides comprehensive error handling examples for the Driver Interface package, demonstrating various error scenarios, recovery strategies, and best practices for robust container management.

## Basic Error Handling Patterns

### 1. Simple Try-Catch Error Handling

```typescript
import {
  createDriverConfig,
  createResourceLimits,
  ContainerCreationError,
  ResourceLimitError,
  ContainerNotFoundError,
  DriverError,
  isDriverError,
  isRetryableError,
  getErrorCode,
  getErrorMessage
} from '@openagent/driver-interface';

async function basicErrorHandlingExample() {
  // Note: In production, use actual driver implementations
  // const driver = new DockerDriver();
  // For this example, we'll assume a driver exists

  try {
    const config = createDriverConfig({
      sessionId: 'error-demo-001',
      image: 'nginx:alpine',
      resources: createResourceLimits({
        cpu: 5.0,  // This will exceed Docker's 4.0 limit
        memory: 512,
        disk: 1024,
        pids: 100
      })
    });

    const container = await driver.createContainer(config);
    console.log('Container created:', container.id);

  } catch (error) {
    console.error('Container creation failed:', error.message);

    if (isDriverError(error)) {
      console.log('Error code:', getErrorCode(error));
      console.log('Is retryable:', isRetryableError(error));

      if (error instanceof ResourceLimitError) {
        console.log('Resource limit exceeded:', error.resource);
        console.log('Available limit:', error.limit);
        console.log('Requested amount:', error.requested);
      }

      // Handle specific error types
      switch (error.code) {
        case 'RESOURCE_LIMIT_EXCEEDED':
          console.log('Action: Reduce resource requirements');
          break;
        case 'CONTAINER_CREATION_FAILED':
          console.log('Action: Check configuration and retry');
          break;
        default:
          console.log('Action: Unknown error, investigate further');
      }
    } else {
      console.log('Non-driver error occurred:', error.message);
    }
  }
}
```

### 2. Error Recovery with Retry Logic

```typescript
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

class RetryHandler {
  private config: RetryConfig;

  constructor(config: RetryConfig) {
    this.config = config;
  }

  async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`${operationName} - Attempt ${attempt}/${this.config.maxRetries}`);
        const result = await operation();
        console.log(`${operationName} - Succeeded on attempt ${attempt}`);
        return result;
      } catch (error) {
        lastError = error as Error;

        if (!isRetryableError(error) || attempt === this.config.maxRetries) {
          console.log(`${operationName} - Failed permanently: ${error.message}`);
          throw error;
        }

        const delay = this.calculateDelay(attempt);
        console.log(`${operationName} - Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private calculateDelay(attempt: number): number {
    const delay = Math.min(
      this.config.baseDelay * Math.pow(this.config.backoffFactor, attempt - 1),
      this.config.maxDelay
    );
    return delay + Math.random() * 100; // Add jitter
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage example
async function retryWithExponentialBackoff() {
  // const driver = new DockerDriver(); // Production driver
  const retryHandler = new RetryHandler({
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2
  });

  const config = createDriverConfig({
    sessionId: 'retry-demo-001',
    image: 'nginx:alpine',
    resources: createResourceLimits({
      cpu: 1.0,
      memory: 512,
      disk: 1024,
      pids: 100
    })
  });

  try {
    const container = await retryHandler.withRetry(
      () => driver.createContainer(config),
      'Container Creation'
    );

    console.log('Container successfully created after retries:', container.id);

  } catch (error) {
    console.error('All retry attempts failed:', error.message);

    if (isDriverError(error)) {
      console.log('Final error code:', getErrorCode(error));
      console.log('Error type:', error.constructor.name);
    }
  }
}
```

### 3. Circuit Breaker Pattern

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  private failures: number;
  private lastFailureTime: number;
  private nextAttemptTime: number;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN - blocking requests');
      } else {
        this.state = 'HALF_OPEN';
        console.log('Circuit breaker moving to HALF_OPEN state');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
    console.log('Circuit breaker reset to CLOSED state');
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.config.resetTimeout;
      console.log(`Circuit breaker opened. Will retry at ${new Date(this.nextAttemptTime).toISOString()}`);
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }
}

// Usage example
async function circuitBreakerExample() {
  // const driver = new DockerDriver(); // Production driver
  const circuitBreaker = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 30000,  // 30 seconds
    monitoringPeriod: 60000  // 1 minute
  });

  const config = createDriverConfig({
    sessionId: 'circuit-demo-001',
    image: 'nginx:alpine'
  });

  try {
    // Simulate multiple requests, some will fail
    for (let i = 0; i < 5; i++) {
      try {
        const container = await circuitBreaker.execute(
          () => driver.createContainer(config)
        );

        console.log(`Request ${i + 1}: Success - ${container.id}`);

        // Simulate failure by using invalid config
        const badConfig = createDriverConfig({
          sessionId: '',
          image: ''
        });

        await circuitBreaker.execute(
          () => driver.createContainer(badConfig)
        );

      } catch (error) {
        console.log(`Request ${i + 1}: ${error.message}`);
      }
    }

    console.log('Circuit breaker state:', circuitBreaker.getState());

  } finally {
    // Cleanup would go here
  }
}
```

## Advanced Error Handling Strategies

### 4. Error Aggregation and Reporting

```typescript
interface ErrorReport {
  timestamp: number;
  operation: string;
  errorType: string;
  errorCode: string;
  errorMessage: string;
  context: any;
  retryable: boolean;
  resolution?: string;
}

class ErrorAggregator {
  private errors: ErrorReport[] = [];
  private thresholds: {
    errorRate: number;
    consecutiveErrors: number;
    timeWindow: number;
  };

  constructor(thresholds: { errorRate: number; consecutiveErrors: number; timeWindow: number }) {
    this.thresholds = thresholds;
  }

  async trackError<T>(
    operation: string,
    context: any,
    fn: () => Promise<T>
  ): Promise<T> {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      const report: ErrorReport = {
        timestamp: Date.now(),
        operation,
        errorType: error.constructor.name,
        errorCode: isDriverError(error) ? getErrorCode(error) : 'UNKNOWN',
        errorMessage: getErrorMessage(error),
        context,
        retryable: isDriverError(error) ? isRetryableError(error) : false
      };

      this.errors.push(report);
      await this.analyzeErrorPattern(report);

      throw error;
    }
  }

  private async analyzeErrorPattern(report: ErrorReport) {
    const recentErrors = this.errors.filter(
      e => e.timestamp > Date.now() - this.thresholds.timeWindow
    );

    // Check error rate
    const errorRate = recentErrors.length / (this.thresholds.timeWindow / 1000);
    if (errorRate > this.thresholds.errorRate) {
      console.warn(`High error rate detected: ${errorRate.toFixed(2)} errors/second`);
      await this.triggerAlert('HIGH_ERROR_RATE', { errorRate, recentErrors });
    }

    // Check consecutive errors
    const consecutiveErrors = this.countConsecutiveErrors(recentErrors);
    if (consecutiveErrors >= this.thresholds.consecutiveErrors) {
      console.warn(`Consecutive errors detected: ${consecutiveErrors}`);
      await this.triggerAlert('CONSECUTIVE_ERRORS', { consecutiveErrors, recentErrors });
    }

    // Check for specific error patterns
    const resourceErrors = recentErrors.filter(e => e.errorCode === 'RESOURCE_LIMIT_EXCEEDED');
    if (resourceErrors.length > 2) {
      console.warn('Multiple resource limit errors detected');
      await this.triggerAlert('RESOURCE_LIMITS_EXCEEDED', { resourceErrors });
    }
  }

  private countConsecutiveErrors(errors: ErrorReport[]): number {
    let count = 0;
    for (let i = errors.length - 1; i >= 0; i--) {
      if (i === errors.length - 1 || errors[i].errorCode === errors[i + 1].errorCode) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  private async triggerAlert(type: string, data: any) {
    console.log(`🚨 Alert triggered: ${type}`, data);
    // In a real implementation, this would send to monitoring systems
  }

  getErrorSummary() {
    const recentErrors = this.errors.filter(
      e => e.timestamp > Date.now() - this.thresholds.timeWindow
    );

    return {
      totalErrors: this.errors.length,
      recentErrors: recentErrors.length,
      errorTypes: [...new Set(recentErrors.map(e => e.errorType))],
      errorCodes: [...new Set(recentErrors.map(e => e.errorCode))],
      errorRate: recentErrors.length / (this.thresholds.timeWindow / 1000)
    };
  }
}

// Usage example
async function errorAggregationExample() {
  // const driver = new DockerDriver(); // Production driver
  const errorAggregator = new ErrorAggregator({
    errorRate: 0.1,      // 0.1 errors per second
    consecutiveErrors: 3,
    timeWindow: 60000    // 1 minute
  });

  try {
    // Simulate various operations with potential errors
    for (let i = 0; i < 10; i++) {
      try {
        await errorAggregator.trackError(
          'create_container',
          { attempt: i + 1 },
          async () => {
            const config = createDriverConfig({
              sessionId: `error-aggregate-${i}`,
              image: i % 3 === 0 ? '' : 'nginx:alpine', // Some invalid configs
              resources: createResourceLimits({
                cpu: i % 2 === 0 ? 5.0 : 1.0, // Some will exceed limits
                memory: 512,
                disk: 1024,
                pids: 100
              })
            });

            return await driver.createContainer(config);
          }
        );
      } catch (error) {
        console.log(`Operation ${i + 1} failed as expected:`, error.message);
      }
    }

    // Get error summary
    const summary = errorAggregator.getErrorSummary();
    console.log('Error summary:', summary);

  } finally {
    // Cleanup
    const containers = await driver.listContainers({
      sessionId: /^error-aggregate-/
    });

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

### 5. Graceful Degradation and Fallback Strategies

```typescript
interface FallbackStrategy {
  name: string;
  condition: (error: DriverError) => boolean;
  action: (error: DriverError, context: any) => Promise<any>;
}

class GracefulDegradationManager {
  private fallbackStrategies: FallbackStrategy[] = [];
  private fallbackLog: Array<{
    timestamp: number;
    strategy: string;
    error: string;
    success: boolean;
  }> = [];

  constructor() {
    this.setupDefaultStrategies();
  }

  private setupDefaultStrategies() {
    // Resource limit fallback
    this.addFallbackStrategy({
      name: 'reduce_resources',
      condition: (error) => error.code === 'RESOURCE_LIMIT_EXCEEDED',
      action: async (error, context) => {
        console.log('Attempting resource reduction fallback...');

        const reducedConfig = createDriverConfig({
          ...context.config,
          resources: createResourceLimits({
            cpu: Math.max(0.5, context.config.resources.cpu * 0.5),
            memory: Math.max(256, context.config.resources.memory * 0.5),
            disk: Math.max(512, context.config.resources.disk * 0.5),
            pids: Math.max(50, context.config.resources.pids * 0.5)
          })
        });

        return await context.driver.createContainer(reducedConfig);
      }
    });

    // Image fallback
    this.addFallbackStrategy({
      name: 'fallback_image',
      condition: (error) => error.code === 'CONTAINER_CREATION_FAILED',
      action: async (error, context) => {
        console.log('Attempting fallback image...');

        const fallbackConfig = createDriverConfig({
          ...context.config,
          image: 'nginx:alpine' // Fallback to a known working image
        });

        return await context.driver.createContainer(fallbackConfig);
      }
    });

    // Local driver fallback
    this.addFallbackStrategy({
      name: 'switch_driver',
      condition: (error) => error.code === 'DRIVER_HEALTH_ERROR',
      action: async (error, context) => {
        console.log('Attempting driver fallback...');

        // const localDriver = new LocalDriver(); // Production driver
        return await localDriver.createContainer(context.config);
      }
    });
  }

  addFallbackStrategy(strategy: FallbackStrategy) {
    this.fallbackStrategies.push(strategy);
  }

  async executeWithFallback<T>(
    operation: () => Promise<T>,
    context: any
  ): Promise<{ result: T; fallbackUsed: string | null }> {
    try {
      const result = await operation();
      return { result, fallbackUsed: null };
    } catch (error) {
      if (!isDriverError(error)) {
        throw error;
      }

      console.log(`Primary operation failed: ${error.message}`);
      console.log('Attempting fallback strategies...');

      for (const strategy of this.fallbackStrategies) {
        if (strategy.condition(error)) {
          try {
            console.log(`Trying fallback strategy: ${strategy.name}`);
            const result = await strategy.action(error, context);

            this.fallbackLog.push({
              timestamp: Date.now(),
              strategy: strategy.name,
              error: error.message,
              success: true
            });

            return { result, fallbackUsed: strategy.name };
          } catch (fallbackError) {
            console.log(`Fallback strategy ${strategy.name} failed:`, fallbackError.message);

            this.fallbackLog.push({
              timestamp: Date.now(),
              strategy: strategy.name,
              error: fallbackError.message,
              success: false
            });
          }
        }
      }

      throw error;
    }
  }

  getFallbackStats() {
    const totalAttempts = this.fallbackLog.length;
    const successfulAttempts = this.fallbackLog.filter(e => e.success).length;
    const strategyUsage = {} as Record<string, { total: number; success: number }>;

    this.fallbackLog.forEach(log => {
      if (!strategyUsage[log.strategy]) {
        strategyUsage[log.strategy] = { total: 0, success: 0 };
      }
      strategyUsage[log.strategy].total++;
      if (log.success) {
        strategyUsage[log.strategy].success++;
      }
    });

    return {
      totalAttempts,
      successfulAttempts,
      successRate: totalAttempts > 0 ? successfulAttempts / totalAttempts : 0,
      strategyUsage
    };
  }
}

// Usage example
async function gracefulDegradationExample() {
  // const driver = new DockerDriver(); // Production driver
  const degradationManager = new GracefulDegradationManager();

  try {
    // Add custom fallback strategy
    degradationManager.addFallbackStrategy({
      name: 'delayed_retry',
      condition: (error) => isRetryableError(error),
      action: async (error, context) => {
        console.log('Attempting delayed retry fallback...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return await context.driver.createContainer(context.config);
      }
    });

    const config = createDriverConfig({
      sessionId: 'graceful-demo-001',
      image: 'nginx:alpine',
      resources: createResourceLimits({
        cpu: 5.0,  // Will trigger resource reduction fallback
        memory: 1024,
        disk: 2048,
        pids: 200
      })
    });

    const context = {
      driver,
      config
    };

    const { result, fallbackUsed } = await degradationManager.executeWithFallback(
      () => driver.createContainer(config),
      context
    );

    console.log('Operation completed with fallback:', fallbackUsed);
    console.log('Container created:', result.id);

    // Check fallback statistics
    const stats = degradationManager.getFallbackStats();
    console.log('Fallback statistics:', stats);

  } catch (error) {
    console.error('All fallback strategies failed:', error.message);
  }
}
```

### 6. Error Context and Recovery Workflow

```typescript
interface ErrorContext {
  operation: string;
  sessionId: string;
  containerId?: string;
  config?: any;
  timestamp: number;
  attempts: number;
  previousErrors: string[];
}

class ErrorRecoveryWorkflow {
  private recoverySteps: Map<string, (error: DriverError, context: ErrorContext) => Promise<boolean>> = new Map();

  constructor() {
    this.setupRecoverySteps();
  }

  private setupRecoverySteps() {
    // Container not found recovery
    this.recoverySteps.set('CONTAINER_NOT_FOUND', async (error, context) => {
      console.log('Container not found - attempting recreation...');

      if (!context.config) {
        return false;
      }

      try {
        const newContainer = await context.driver.createContainer(context.config);
        context.containerId = newContainer.id;
        return true;
      } catch (recreateError) {
        console.log('Container recreation failed:', recreateError.message);
        return false;
      }
    });

    // Resource limit recovery
    this.recoverySteps.set('RESOURCE_LIMIT_EXCEEDED', async (error, context) => {
      console.log('Resource limit exceeded - attempting optimization...');

      if (!context.config) {
        return false;
      }

      try {
        // Try with reduced resources
        const optimizedConfig = createDriverConfig({
          ...context.config,
          resources: createResourceLimits({
            cpu: Math.max(0.5, context.config.resources.cpu * 0.7),
            memory: Math.max(256, context.config.resources.memory * 0.7),
            disk: Math.max(512, context.config.resources.disk * 0.7),
            pids: Math.max(50, context.config.resources.pids * 0.7)
          })
        });

        const container = await context.driver.createContainer(optimizedConfig);
        context.containerId = container.id;
        return true;
      } catch (optimizeError) {
        console.log('Resource optimization failed:', optimizeError.message);
        return false;
      }
    });

    // Timeout error recovery
    this.recoverySteps.set('TIMEOUT_ERROR', async (error, context) => {
      console.log('Timeout error - attempting with increased timeout...');

      if (!context.containerId) {
        return false;
      }

      try {
        // Retry with longer timeout
        await new Promise(resolve => setTimeout(resolve, 5000));
        const isHealthy = await context.driver.isContainerHealthy(context.containerId);
        return isHealthy;
      } catch (timeoutError) {
        console.log('Timeout recovery failed:', timeoutError.message);
        return false;
      }
    });
  }

  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    context: Partial<ErrorContext>
  ): Promise<{ result: T; recoverySteps: string[] }> {
    const fullContext: ErrorContext = {
      operation: context.operation || 'unknown',
      sessionId: context.sessionId || 'unknown',
      containerId: context.containerId,
      config: context.config,
      timestamp: Date.now(),
      attempts: 0,
      previousErrors: []
    };

    const recoverySteps: string[] = [];

    const attemptOperation = async (): Promise<T> => {
      fullContext.attempts++;

      try {
        return await operation();
      } catch (error) {
        if (!isDriverError(error)) {
          throw error;
        }

        fullContext.previousErrors.push(error.message);
        console.log(`Attempt ${fullContext.attempts} failed: ${error.message}`);

        // Check if we have a recovery step for this error
        const recoveryStep = this.recoverySteps.get(error.code);
        if (recoveryStep) {
          try {
            const recoverySuccess = await recoveryStep(error, fullContext);
            if (recoverySuccess) {
              recoverySteps.push(error.code);
              console.log(`Recovery step ${error.code} succeeded, retrying operation...`);
              return attemptOperation(); // Retry the original operation
            } else {
              console.log(`Recovery step ${error.code} failed`);
            }
          } catch (recoveryError) {
            console.log(`Recovery step ${error.code} threw error:`, recoveryError.message);
          }
        }

        throw error;
      }
    };

    try {
      const result = await attemptOperation();
      return { result, recoverySteps };
    } catch (finalError) {
      console.log('All recovery attempts failed');
      throw finalError;
    }
  }
}

// Usage example
async function errorRecoveryWorkflowExample() {
  // const driver = new DockerDriver(); // Production driver
  const recoveryWorkflow = new ErrorRecoveryWorkflow();

  try {
    const config = createDriverConfig({
      sessionId: 'recovery-demo-001',
      image: 'nginx:alpine',
      resources: createResourceLimits({
        cpu: 5.0,  // Will trigger resource limit recovery
        memory: 1024,
        disk: 2048,
        pids: 200
      })
    });

    const context = {
      operation: 'create_container',
      sessionId: 'recovery-demo-001',
      config,
      driver
    };

    const { result, recoverySteps } = await recoveryWorkflow.executeWithRecovery(
      () => driver.createContainer(config),
      context
    );

    console.log('Operation completed with recovery steps:', recoverySteps);
    console.log('Container created:', result.id);

  } catch (error) {
    console.error('Recovery workflow failed:', error.message);
  }
}
```

## Comprehensive Error Handling Example

### 7. Complete Error Handling System

```typescript
class ComprehensiveErrorHandler {
  private retryHandler: RetryHandler;
  private circuitBreaker: CircuitBreaker;
  private errorAggregator: ErrorAggregator;
  private degradationManager: GracefulDegradationManager;
  private recoveryWorkflow: ErrorRecoveryWorkflow;

  constructor(driver: ContainerDriver) {
    this.retryHandler = new RetryHandler({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffFactor: 2
    });

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoringPeriod: 120000
    });

    this.errorAggregator = new ErrorAggregator({
      errorRate: 0.2,
      consecutiveErrors: 4,
      timeWindow: 300000
    });

    this.degradationManager = new GracefulDegradationManager();
    this.recoveryWorkflow = new ErrorRecoveryWorkflow();
  }

  async executeOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    context: any
  ): Promise<{ result: T; handlingApplied: string[] }> {
    const handlingApplied: string[] = [];

    try {
      // Start with circuit breaker
      const result = await this.circuitBreaker.execute(async () => {
        // Apply error aggregation
        return await this.errorAggregator.trackError(
          operationName,
          context,
          async () => {
            // Apply retry logic
            return await this.retryHandler.withRetry(
              operation,
              operationName
            );
          }
        );
      });

      return { result, handlingApplied };

    } catch (error) {
      console.log(`${operationName} failed with standard handling, attempting advanced recovery...`);

      // Try graceful degradation
      try {
        const { result, fallbackUsed } = await this.degradationManager.executeWithFallback(
          () => operation(),
          context
        );

        if (fallbackUsed) {
          handlingApplied.push(`fallback_${fallbackUsed}`);
        }

        return { result, handlingApplied };

      } catch (degradationError) {
        console.log('Graceful degradation failed, attempting recovery workflow...');

        // Try recovery workflow
        try {
          const { result, recoverySteps } = await this.recoveryWorkflow.executeWithRecovery(
            operation,
            context
          );

          handlingApplied.push(...recoverySteps.map(step => `recovery_${step}`));
          return { result, handlingApplied };

        } catch (recoveryError) {
          handlingApplied.push('failed_all_recovery');
          throw recoveryError;
        }
      }
    }
  }

  getSystemHealth() {
    return {
      circuitBreaker: this.circuitBreaker.getState(),
      errorAggregator: this.errorAggregator.getErrorSummary(),
      degradationManager: this.degradationManager.getFallbackStats()
    };
  }
}

// Usage example
async function comprehensiveErrorHandlingExample() {
  // const driver = new DockerDriver(); // Production driver
  const errorHandler = new ComprehensiveErrorHandler(driver);

  try {
    const config = createDriverConfig({
      sessionId: 'comprehensive-demo-001',
      image: 'nginx:alpine',
      resources: createResourceLimits({
        cpu: 5.0,  // Will trigger multiple error handling mechanisms
        memory: 1024,
        disk: 2048,
        pids: 200
      })
    });

    const context = {
      driver,
      config,
      operation: 'create_container'
    };

    console.log('Executing operation with comprehensive error handling...');

    const { result, handlingApplied } = await errorHandler.executeOperation(
      'create_container',
      () => driver.createContainer(config),
      context
    );

    console.log('Operation completed successfully');
    console.log('Error handling mechanisms applied:', handlingApplied);
    console.log('Container created:', result.id);

    // Check system health
    const health = errorHandler.getSystemHealth();
    console.log('System health:', health);

  } catch (error) {
    console.error('Comprehensive error handling failed:', error.message);

    const health = errorHandler.getSystemHealth();
    console.log('Final system health:', health);
  }
}

// Run the example
comprehensiveErrorHandlingExample().catch(console.error);
```

## Summary

These error handling examples demonstrate comprehensive strategies for robust container management:

1. **Basic Error Handling**: Simple try-catch with error type detection and classification
2. **Retry Logic**: Exponential backoff with jitter and configurable retry strategies
3. **Circuit Breaker**: Prevents cascading failures with automatic recovery
4. **Error Aggregation**: Tracks error patterns and triggers alerts based on thresholds
5. **Graceful Degradation**: Multiple fallback strategies for different error types
6. **Recovery Workflows**: Context-aware recovery steps for specific error scenarios
7. **Comprehensive System**: Combines multiple error handling mechanisms for maximum resilience

These patterns ensure that container operations remain robust and can handle various failure scenarios while providing detailed monitoring and recovery capabilities.