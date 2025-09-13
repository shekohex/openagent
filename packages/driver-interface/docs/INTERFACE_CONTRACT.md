# Interface Contract Documentation

## Overview

The Driver Interface Package provides a comprehensive TypeScript interface contract for container management operations. This document details the complete interface specification, type definitions, validation schemas, and usage contracts.

## Core Interface: ContainerDriver

The `ContainerDriver` interface defines the contract that all container management drivers must implement.

### Interface Definition

```typescript
export type ContainerDriver = {
  readonly name: string;
  readonly version: string;

  // Container lifecycle management
  createContainer(config: ContainerConfig): Promise<ContainerInstance>;
  startContainer(id: string): Promise<void>;
  stopContainer(id: string, options?: StopOptions): Promise<void>;
  removeContainer(id: string): Promise<void>;

  // Container queries and operations
  getContainer(id: string): Promise<ContainerInstance | null>;
  listContainers(filter?: ContainerFilter): Promise<ContainerInstance[]>;
  getContainerLogs(id: string, options?: LogOptions): Promise<string>;

  // Health monitoring
  healthCheck(): Promise<DriverHealth>;
  isContainerHealthy(id: string): Promise<boolean>;

  // Volume management
  createVolume(config: VolumeConfig): Promise<Volume>;
  removeVolume(id: string): Promise<void>;

  // Network management
  createNetwork(config: NetworkConfig): Promise<Network>;
  removeNetwork(id: string): Promise<void>;
};
```

### Required Properties

- **`name`** (string, readonly): Unique identifier for the driver implementation
- **`version`** (string, readonly): Semantic version of the driver

### Required Methods

#### Container Lifecycle Methods

##### `createContainer(config: ContainerConfig): Promise<ContainerInstance>`
- **Purpose**: Creates a new container instance with the specified configuration
- **Input**: Complete container configuration object
- **Output**: Container instance with assigned ID and metadata
- **Error Conditions**:
  - `ContainerCreationError`: If container creation fails
  - `ResourceLimitError`: If resource limits are exceeded
  - `ConfigurationError`: If configuration is invalid

##### `startContainer(id: string): Promise<void>`
- **Purpose**: Starts a created container
- **Input**: Container identifier
- **Output**: Resolves when container is successfully started
- **Error Conditions**:
  - `ContainerNotFoundError`: If container doesn't exist
  - `ContainerStartError`: If container fails to start
  - `TimeoutError`: If operation times out

##### `stopContainer(id: string, options?: StopOptions): Promise<void>`
- **Purpose**: Stops a running container
- **Input**: Container identifier and optional stop configuration
- **Output**: Resolves when container is successfully stopped
- **Error Conditions**:
  - `ContainerNotFoundError`: If container doesn't exist
  - `ContainerStopError`: If container fails to stop gracefully
  - `TimeoutError`: If graceful stop timeout expires

##### `removeContainer(id: string): Promise<void>`
- **Purpose**: Removes a container permanently
- **Input**: Container identifier
- **Output**: Resolves when container is successfully removed
- **Error Conditions**:
  - `ContainerNotFoundError`: If container doesn't exist
  - `ContainerRemoveError`: If container is in use or locked

#### Container Query Methods

##### `getContainer(id: string): Promise<ContainerInstance | null>`
- **Purpose**: Retrieves detailed information about a specific container
- **Input**: Container identifier
- **Output**: Container instance or null if not found
- **Error Conditions**: Should not throw for non-existent containers

##### `listContainers(filter?: ContainerFilter): Promise<ContainerInstance[]>`
- **Purpose**: Lists containers matching specified criteria
- **Input**: Optional filter object for refining results
- **Output**: Array of matching container instances
- **Error Conditions**: Should handle invalid filters gracefully

##### `getContainerLogs(id: string, options?: LogOptions): Promise<string>`
- **Purpose**: Retrieves container logs with optional filtering
- **Input**: Container identifier and log retrieval options
- **Output**: Container log content as string
- **Error Conditions**:
  - `ContainerNotFoundError`: If container doesn't exist
  - `TimeoutError`: If log retrieval times out

#### Health Monitoring Methods

##### `healthCheck(): Promise<DriverHealth>`
- **Purpose**: Checks overall driver health and status
- **Input**: None
- **Output**: Comprehensive health status object
- **Error Conditions**:
  - `DriverHealthError`: If health check fails

##### `isContainerHealthy(id: string): Promise<boolean>`
- **Purpose**: Checks if a specific container is healthy
- **Input**: Container identifier
- **Output**: Boolean indicating container health status
- **Error Conditions**:
  - `ContainerNotFoundError`: If container doesn't exist

#### Volume Management Methods

##### `createVolume(config: VolumeConfig): Promise<Volume>`
- **Purpose**: Creates a new volume for persistent storage
- **Input**: Volume configuration
- **Output**: Volume instance with assigned ID
- **Error Conditions**:
  - `VolumeCreationError`: If volume creation fails
  - `ConfigurationError`: If configuration is invalid

##### `removeVolume(id: string): Promise<void>`
- **Purpose**: Removes a volume permanently
- **Input**: Volume identifier
- **Output**: Resolves when volume is successfully removed
- **Error Conditions**:
  - `VolumeNotFoundError`: If volume doesn't exist
  - `VolumeRemoveError`: If volume is in use

#### Network Management Methods

##### `createNetwork(config: NetworkConfig): Promise<Network>`
- **Purpose**: Creates a new network for container communication
- **Input**: Network configuration
- **Output**: Network instance with assigned ID
- **Error Conditions**:
  - `NetworkCreationError`: If network creation fails
  - `ConfigurationError`: If configuration is invalid

##### `removeNetwork(id: string): Promise<void>`
- **Purpose**: Removes a network permanently
- **Input**: Network identifier
- **Output**: Resolves when network is successfully removed
- **Error Conditions**:
  - `NetworkNotFoundError`: If network doesn't exist
  - `NetworkRemoveError`: If network is in use

## Type Definitions

### Container Configuration Types

#### ContainerConfig
```typescript
export type ContainerConfig = {
  sessionId: string;           // Unique session identifier
  image: string;               // Container image reference
  command?: string[];         // Override default command
  env: Record<string, string>; // Environment variables
  labels: Record<string, string>; // Container labels
  resources: ResourceLimits;   // Resource constraints
  volumes: VolumeMount[];      // Volume mounts
  network: string;             // Network name
  security: SecurityOptions;  // Security settings
};
```

#### ResourceLimits
```typescript
export type ResourceLimits = {
  cpu: number;     // CPU cores (0.0+)
  memory: number;  // Memory in MB (1+)
  disk: number;    // Disk space in MB (1+)
  pids: number;    // Process count limit (1+)
};
```

#### SecurityOptions
```typescript
export type SecurityOptions = {
  readOnly: boolean;           // Read-only filesystem
  noNewPrivileges: boolean;    // Disable privilege escalation
  user: string;                // Run as specific user
  capabilities: {              // Linux capabilities
    drop: string[];            // Capabilities to drop
    add: string[];            // Capabilities to add
  };
};
```

#### VolumeMount
```typescript
export type VolumeMount = {
  source: string;       // Source path/volume name
  target: string;       // Target path in container
  readOnly?: boolean;   // Mount as read-only
  type?: "bind" | "volume"; // Mount type
};
```

### Container Instance Types

#### ContainerInstance
```typescript
export type ContainerInstance = {
  id: string;                    // Unique container identifier
  name: string;                  // Human-readable name
  sessionId: string;             // Associated session
  image: string;                 // Container image
  status: ContainerStatus;       // Current status
  state: ContainerState;         // Runtime state
  endpoint: string;              // Access endpoint
  createdAt: number;             // Creation timestamp
  startedAt?: number;            // Start timestamp (if running)
  labels: Record<string, string>; // Container labels
  resources: ResourceLimits;     // Actual resource allocation
};
```

#### ContainerStatus
```typescript
export type ContainerStatus =
  | "created"   // Container created but not started
  | "running"   // Container is running
  | "paused"    // Container is paused
  | "stopped"   // Container is stopped
  | "removing"  // Container is being removed
  | "exited"    // Container has exited
  | "dead";     // Container is in error state
```

#### ContainerState
```typescript
export type ContainerState =
  | "running"     // Container is actively running
  | "terminated"  // Container has stopped normally
  | "error";      // Container is in error state
```

### Operation Options Types

#### ContainerFilter
```typescript
export type ContainerFilter = {
  sessionId?: string;              // Filter by session ID
  status?: ContainerStatus;       // Filter by status
  state?: ContainerState;         // Filter by state
  label?: Record<string, string>;  // Filter by labels
};
```

#### StopOptions
```typescript
export type StopOptions = {
  timeout?: number;  // Graceful stop timeout in ms
  force?: boolean;   // Force immediate stop
};
```

#### LogOptions
```typescript
export type LogOptions = {
  follow?: boolean;     // Follow log output
  tail?: number;        // Number of lines from end
  since?: number;       // Timestamp to start from
  timestamps?: boolean; // Include timestamps
};
```

### Health Monitoring Types

#### DriverHealth
```typescript
export type DriverHealth = {
  status: "healthy" | "unhealthy";  // Overall health status
  version: string;                  // Driver version
  uptime: number;                   // Uptime in milliseconds
  containers: {                     // Container statistics
    total: number;                  // Total containers
    running: number;                // Running containers
    stopped: number;                // Stopped containers
  };
  error?: string;                   // Error message if unhealthy
};
```

### Resource Management Types

#### VolumeConfig / Volume
```typescript
export type VolumeConfig = {
  name: string;                      // Volume name
  driver?: string;                   // Storage driver
  labels?: Record<string, string>;   // Volume labels
};

export type Volume = {
  id: string;                        // Unique volume identifier
  name: string;                      // Volume name
  driver: string;                     // Storage driver
  mountpoint: string;                // Mount point
  createdAt: number;                 // Creation timestamp
  labels: Record<string, string>;    // Volume labels
};
```

#### NetworkConfig / Network
```typescript
export type NetworkConfig = {
  name: string;                      // Network name
  driver?: string;                   // Network driver
  labels?: Record<string, string>;   // Network labels
  options?: Record<string, string>;   // Network options
};

export type Network = {
  id: string;                        // Unique network identifier
  name: string;                      // Network name
  driver: string;                    // Network driver
  createdAt: number;                 // Creation timestamp
  labels: Record<string, string>;    // Network labels
};
```

## Validation Schemas

### ContainerConfigSchema
```typescript
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
```

### ResourceLimitsSchema
```typescript
export const ResourceLimitsSchema = z.object({
  cpu: z.number().min(0),
  memory: z.number().min(1),
  disk: z.number().min(1),
  pids: z.number().min(1),
});
```

### SecurityOptionsSchema
```typescript
export const SecurityOptionsSchema = z.object({
  readOnly: z.boolean(),
  noNewPrivileges: z.boolean(),
  user: z.string(),
  capabilities: z.object({
    drop: z.array(z.string()),
    add: z.array(z.string()),
  }),
});
```

## Error Handling Contracts

### Error Hierarchy

All driver implementations must use the standardized error types from the error hierarchy:

1. **DriverError** (Base class)
   - Properties: `code`, `message`, `retryable`

2. **Container Errors**
   - `ContainerNotFoundError` (non-retryable)
   - `ContainerCreationError` (retryable)
   - `ContainerStartError` (retryable)
   - `ContainerStopError` (retryable)
   - `ContainerRemoveError` (non-retryable)

3. **Resource Errors**
   - `ResourceLimitError` (non-retryable)

4. **Volume Errors**
   - `VolumeCreationError` (retryable)
   - `VolumeNotFoundError` (non-retryable)
   - `VolumeRemoveError` (non-retryable)

5. **Network Errors**
   - `NetworkCreationError` (retryable)
   - `NetworkNotFoundError` (non-retryable)
   - `NetworkRemoveError` (non-retryable)

6. **System Errors**
   - `DriverHealthError` (non-retryable)
   - `TimeoutError` (retryable)
   - `NetworkError` (retryable)
   - `FileSystemError` (non-retryable)

7. **Security Errors**
   - `AuthenticationError` (non-retryable)
   - `AuthorizationError` (non-retryable)

### Error Handling Requirements

1. **Error Identification**: All errors must extend `DriverError`
2. **Error Codes**: Each error type must have a unique error code
3. **Retry Logic**: Errors must be marked as retryable or non-retryable
4. **Error Messages**: Messages must be descriptive and actionable
5. **Error Context**: Errors should include relevant context information

## Configuration Helpers

The package provides helper functions for creating and validating configurations:

### createDriverConfig(config: Partial<ContainerConfig>): ContainerConfig
Creates a complete container configuration with sensible defaults.

### createResourceLimits(limits: Partial<ResourceLimits>): ResourceLimits
Creates resource limits with default values.

### createSecurityOptions(options: Partial<SecurityOptions>): SecurityOptions
Creates security options with secure defaults.

### Validation Functions
- `validateContainerConfig(config: ContainerConfig): boolean`
- `validateResourceLimits(limits: ResourceLimits): boolean`
- `validateSecurityOptions(options: SecurityOptions): boolean`

## Implementation Requirements

### Driver Versioning
- All drivers must implement semantic versioning
- Version must be accessible via the `version` property
- Breaking changes require major version increments

### Performance Expectations
- Container operations should complete within reasonable timeframes
- Health checks should be lightweight and fast
- Error handling should not cause performance degradation

### Resource Management
- Drivers must respect resource limits
- Resource usage should be accurately reported
- Cleanup operations must be reliable

### Security Considerations
- Default configurations must be secure
- User input must be validated
- Privilege escalation must be controlled
- Sensitive data must be protected

### Error Recovery
- Retry logic should be implemented for retryable errors
- Circuit breakers should prevent cascading failures
- Error states should be clearly communicated
- Recovery should be automatic where possible

## Testing Requirements

### Unit Tests
- All interface methods must have unit tests
- Error conditions must be thoroughly tested
- Edge cases should be covered
- Performance characteristics should be verified

### Integration Tests
- Cross-driver compatibility must be tested
- End-to-end workflows should be validated
- Resource management should be stress-tested
- Error scenarios should be simulated

### Contract Tests
- Interface compliance must be verified
- Type safety must be enforced
- Schema validation must be comprehensive
- Error contracts must be honored

## Migration and Compatibility

### Version Compatibility
- Minor versions should maintain backward compatibility
- Patch versions should only include bug fixes
- Deprecation notices should be provided for breaking changes

### Interface Evolution
- New methods should be optional where possible
- Existing method signatures should remain stable
- Type definitions should be backward compatible
- Configuration schemas should be extensible