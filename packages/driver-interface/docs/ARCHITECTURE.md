# Driver Interface Package Architecture

## Overview

The Driver Interface package provides a unified TypeScript interface for container management across different containerization technologies. It serves as an abstraction layer that enables OpenAgent to work with various container backends while maintaining consistent behavior and error handling patterns.

## Core Architecture

### Design Principles

1. **Interface Abstraction**: All container operations are defined through TypeScript interfaces, ensuring consistent contracts across implementations.
2. **Type Safety**: Comprehensive TypeScript definitions with Zod schema validation for runtime type checking.
3. **Error Handling**: Structured error hierarchy with retryable vs non-retryable error classification.
4. **Mock Implementation**: Reference implementations for testing and development.
5. **Extensibility**: Plugin-based architecture allowing new driver implementations.

### Package Structure

```
packages/driver-interface/
├── src/
│   ├── index.ts                 # Main exports and utility functions
│   ├── types.ts                 # All type definitions and interfaces
│   └── errors.ts                # Error classes and handling
├── tests/
│   ├── mocks/
│   │   ├── mock-docker-driver.ts
│   │   └── mock-local-driver.ts
│   ├── demo/
│   │   ├── interface-usage.test.ts
│   │   ├── driver-comparison.test.ts
│   │   ├── advanced-patterns.test.ts
│   │   └── error-handling.test.ts
│   ├── errors.test.ts          # Error class tests
│   └── types.test.ts           # Type validation tests
└── docs/
    └── ARCHITECTURE.md          # This document
```

## Core Components

### 1. Interfaces (`src/types.ts`)

The foundation of the package is the `ContainerDriver` interface, which defines all operations that drivers must implement:

```typescript
interface ContainerDriver {
  readonly name: string;
  readonly version: string;

  // Container lifecycle
  createContainer(config: ContainerConfig): Promise<ContainerInstance>;
  startContainer(id: string): Promise<void>;
  stopContainer(id: string, options?: StopOptions): Promise<void>;
  removeContainer(id: string): Promise<void>;

  // Container queries
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
}
```

### 2. Type System (`src/types.ts`)

The type system is consolidated in a single file with comprehensive type definitions:

- **Container Types**: `ContainerInstance`, `ContainerConfig`, `ContainerFilter`
- **Resource Types**: `ResourceLimits`, `SecurityOptions`
- **Volume Types**: `Volume`, `VolumeConfig`
- **Network Types**: `Network`, `NetworkConfig`
- **Health Types**: `DriverHealth`, `ContainerStatus`
- **Validation Schemas**: Zod schemas for runtime validation

### 3. Configuration System (`src/index.ts`)

Configuration builders and utility functions provided in the main index:

```typescript
const config = createDriverConfig({
  sessionId: "my-session",
  image: "nginx:alpine",
  env: { PORT: "8080" },
  resources: createResourceLimits({ cpu: 1.0, memory: 512 }),
  security: createSecurityOptions({ readOnly: true })
});
```

### 4. Error Hierarchy (`src/errors.ts`)

Structured error system with specific error types:

- **Base Error**: `DriverError` with `code` and `retryable` properties
- **Container Errors**: `ContainerNotFoundError`, `ContainerCreationError`, etc.
- **Resource Errors**: `ResourceLimitError`
- **System Errors**: `NetworkError`, `FileSystemError`, `TimeoutError`
- **Authentication**: `AuthenticationError`, `AuthorizationError`

### 5. Validation (`src/types.ts`)

Zod schema validation for all configuration objects embedded in the types file:

```typescript
const ContainerConfigSchema = z.object({
  sessionId: z.string().min(1),
  image: z.string().min(1),
  env: z.record(z.string()),
  labels: z.record(z.string()),
  resources: ResourceLimitsSchema,
  security: SecurityOptionsSchema
});
```

## Mock Implementations

### Mock Docker Driver (`tests/mocks/mock-docker-driver.ts`)

Simulates Docker-like behavior with:
- Realistic timing delays (100-200ms per operation)
- Resource limits (CPU: 4.0 cores max)
- Network and volume management
- Proper error handling

### Mock Local Driver (`tests/mocks/mock-local-driver.ts`)

Simulates local container runtime with:
- Slower operations (200-300ms per operation)
- Stricter resource limits (CPU: 2.0 cores max)
- Different timeout behavior
- Alternative implementation patterns

## Testing Strategy

### Test Categories

1. **Unit Tests**: Error classes, type validation, utility functions
2. **Interface Usage Tests**: Basic driver operations and lifecycle
3. **Driver Comparison Tests**: Cross-driver behavior comparison
4. **Advanced Pattern Tests**: Complex usage scenarios
5. **Error Handling Tests**: Comprehensive error scenarios

### Test Coverage

The test suite covers:
- All interface methods and properties
- Error conditions and edge cases
- Configuration validation
- Cross-driver consistency
- Performance characteristics
- Resource management
- State transitions

## Integration Points

### With OpenAgent

The Driver Interface integrates with OpenAgent's architecture:

1. **Session Management**: Container lifecycle tied to user sessions
2. **Resource Allocation**: Coordinating with OpenAgent's resource manager
3. **Monitoring**: Health checks and metrics collection
4. **Error Recovery**: Integration with OpenAgent's retry mechanisms

### With Other Packages

- **Backend**: Uses the driver interface for container operations
- **Sidecar**: Implements container-specific sidecar services
- **Logger**: Structured logging for container operations
- **Crypto**: Security and authentication for container access

## Extensibility

### Adding New Drivers

To implement a new driver:

1. Implement the `ContainerDriver` interface
2. Follow the error handling patterns
3. Provide proper type implementations
4. Add comprehensive tests
5. Update documentation

### Configuration Extension

The configuration system supports:
- Driver-specific options
- Custom resource types
- Extended security policies
- Environment-specific settings

## Performance Considerations

### Mock Performance

- **Docker Driver**: 100-200ms per operation
- **Local Driver**: 200-300ms per operation
- **Concurrent Operations**: Parallel execution support
- **Resource Limits**: Enforced at driver level

### Real-world Considerations

For production drivers:
- Connection pooling
- Caching strategies
- Batch operations
- Rate limiting
- Circuit breakers

## Security Model

### Container Security

- **Capability Management**: Fine-grained Linux capabilities
- **Resource Isolation**: CPU, memory, and disk limits
- **Network Isolation**: Dedicated networks per session
- **Filesystem Protection**: Read-only filesystems by default

### Authentication

- **Driver Authentication**: Credential-based access
- **Session Isolation**: Containers scoped to sessions
- **Authorization**: Role-based access control

## Future Enhancements

### Planned Features

1. **Kubernetes Driver**: Full K8s integration
2. **Podman Support**: Alternative to Docker
3. **Windows Containers**: Cross-platform support
4. **GPU Acceleration**: GPU resource management
5. **Storage Plugins**: Custom volume drivers

### Architecture Improvements

1. **Event Streaming**: Real-time container events
2. **Metrics Collection**: Comprehensive monitoring
3. **Auto-scaling**: Dynamic resource allocation
4. **Health Monitoring**: Advanced health checks
5. **Backup/Restore**: Container state persistence