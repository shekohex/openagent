# Interface Relationships Diagram

## Overview

This document details the relationships between interfaces, types, and implementations in the Driver Interface package. It provides a comprehensive view of how components interact and depend on each other.

## Core Interface Hierarchy

### Primary Interface: ContainerDriver

```mermaid
graph TB
    CD[ContainerDriver Interface] --> PROPS[Properties]
    CD --> METHODS[Methods]

    PROPS --> NAME[name: string]
    PROPS --> VERSION[version: string]

    METHODS --> LIFECYCLE[Container Lifecycle]
    METHODS --> QUERIES[Container Queries]
    METHODS --> HEALTH[Health Monitoring]
    METHODS --> VOLUMES[Volume Management]
    METHODS --> NETWORKS[Network Management]

    LIFECYCLE --> CREATE[createContainer]
    LIFECYCLE --> START[startContainer]
    LIFECYCLE --> STOP[stopContainer]
    LIFECYCLE --> REMOVE[removeContainer]

    QUERIES --> GET[getContainer]
    QUERIES --> LIST[listContainers]
    QUERIES --> LOGS[getContainerLogs]

    HEALTH --> HC[healthCheck]
    HEALTH --> ICH[isContainerHealthy]

    VOLUMES --> CV[createVolume]
    VOLUMES --> RV[removeVolume]

    NETWORKS --> CN[createNetwork]
    NETWORKS --> RN[removeNetwork]
```

## Type Dependencies

### Configuration Types Hierarchy

```mermaid
graph TB
    CC[ContainerConfig] --> RESOURCES[ResourceLimits]
    CC --> SECURITY[SecurityOptions]
    CC --> VOLUMES[VolumeMount[]]
    CC --> NETWORK[string]
    CC --> ENV[Record<string, string>]
    CC --> LABELS[Record<string, string>]

    RESOURCES --> CPU[number]
    RESOURCES --> MEMORY[number]
    RESOURCES --> DISK[number]
    RESOURCES --> PIDS[number]

    SECURITY --> RO[readOnly: boolean]
    SECURITY --> NNP[noNewPrivileges: boolean]
    SECURITY --> USER[user: string]
    SECURITY --> CAPS[capabilities]

    CAPS --> DROP[string[]]
    CAPS --> ADD[string[]]

    VOLUMES --> SOURCE[string]
    VOLUMES --> TARGET[string]
    VOLUMES --> RO[readOnly?: boolean]
    VOLUMES --> TYPE[type?: string]
```

### Container Instance Types

```mermaid
graph TB
    CI[ContainerInstance] --> ID[id: string]
    CI --> NAME[name: string]
    CI --> SESSIONID[sessionId: string]
    CI --> IMAGE[image: string]
    CI --> STATUS[status: ContainerStatus]
    CI --> STATE[state: ContainerState]
    CI --> ENDPOINT[endpoint: string]
    CI --> CREATEDAT[createdAt: number]
    CI --> STARTEDAT[startedAt?: number]
    CI --> LABELS[labels: Record<string, string>]
    CI --> RESOURCES[resources: ResourceLimits]

    STATUS --> CREATED[created]
    STATUS --> RUNNING[running]
    STATUS --> PAUSED[paused]
    STATUS --> STOPPED[stopped]
    STATUS --> REMOVING[removing]
    STATUS --> EXITED[exited]
    STATUS --> DEAD[dead]

    STATE --> RUNNING[running]
    STATE --> TERMINATED[terminated]
    STATE --> ERROR[error]
```

### Resource Management Types

```mermaid
graph TB
    VOLCONFIG[VolumeConfig] --> NAME[name: string]
    VOLCONFIG --> DRIVER[driver?: string]
    VOLCONFIG --> LABELS[labels?: Record<string, string>]

    VOLUME[Volume] --> ID[id: string]
    VOLUME --> NAME[name: string]
    VOLUME --> DRIVER[driver: string]
    VOLUME --> MOUNTPOINT[mountpoint: string]
    VOLUME --> CREATEDAT[createdAt: number]
    VOLUME --> LABELS[labels: Record<string, string>]

    NETCONFIG[NetworkConfig] --> NAME[name: string]
    NETCONFIG --> DRIVER[driver?: string]
    NETCONFIG --> LABELS[labels?: Record<string, string>]
    NETCONFIG --> OPTIONS[options?: Record<string, string>]

    NETWORK[Network] --> ID[id: string]
    NETWORK --> NAME[name: string]
    NETWORK --> DRIVER[driver: string]
    NETWORK --> CREATEDAT[createdAt: number]
    NETWORK --> LABELS[labels: Record<string, string>]
```

### Operation Options Types

```mermaid
graph TB
    CF[ContainerFilter] --> SESSIONID[sessionId?: string]
    CF --> STATUS[status?: ContainerStatus]
    CF --> STATE[state?: ContainerState]
    CF --> LABEL[label?: Record<string, string>]

    SO[StopOptions] --> TIMEOUT[timeout?: number]
    SO --> FORCE[force?: boolean]

    LO[LogOptions] --> FOLLOW[follow?: boolean]
    LO --> TAIL[tail?: number]
    LO --> SINCE[since?: number]
    LO --> TIMESTAMPS[timestamps?: boolean]

    DH[DriverHealth] --> STATUS[status: 'healthy' | 'unhealthy']
    DH --> VERSION[version: string]
    DH --> UPTIME[uptime: number]
    DH --> CONTAINERS[containers]
    DH --> ERROR[error?: string]

    CONTAINERS --> TOTAL[total: number]
    CONTAINERS --> RUNNING[running: number]
    CONTAINERS --> STOPPED[stopped: number]
```

## Schema Validation Relationships

### Zod Schema Dependencies

```mermaid
graph LR
    CCS[ContainerConfigSchema] --> RLS[ResourceLimitsSchema]
    CCS --> SOS[SecurityOptionsSchema]
    CCS --> VSZ[VolumeMountSchema]

    RLS --> CPUZ[z.number().min(0)]
    RLS --> MEMZ[z.number().min(1)]
    RLS --> DISKZ[z.number().min(1)]
    RLS --> PIDSZ[z.number().min(1)]

    SOS --> ROZ[z.boolean()]
    SOS --> NNPZ[z.boolean()]
    SOS --> USERZ[z.string()]
    SOS --> CAPSZ[CapabilitiesSchema]

    CAPSZ --> DROPZ[z.array(z.string())]
    CAPSZ --> ADDZ[z.array(z.string())]

    VSZ --> SOURCEZ[z.string()]
    VSZ --> TARGETZ[z.string()]
    VSZ --> ROZ[z.boolean().optional()]
    VSZ --> TYPEZ[z.enum(['bind', 'volume']).optional()]
```

## Error Hierarchy Relationships

### Error Type Inheritance

```mermaid
graph TB
    DE[DriverError] --> CE[Container Errors]
    DE --> RE[Resource Errors]
    DE --> VE[Volume Errors]
    DE --> NE[Network Errors]
    DE --> SE[System Errors]
    DE --> AE[Authentication Errors]

    CE --> CNFE[ContainerNotFoundError]
    CE --> CCrE[ContainerCreationError]
    CE --> CSE[ContainerStartError]
    CE --> CStE[ContainerStopError]
    CE --> CReE[ContainerRemoveError]

    RE --> RLE[ResourceLimitError]

    VE --> VCrE[VolumeCreationError]
    VE --> VNFE[VolumeNotFoundError]
    VE --> VReE[VolumeRemoveError]

    NE --> NCrE[NetworkCreationError]
    NE --> NNFE[NetworkNotFoundError]
    NE --> NReE[NetworkRemoveError]

    SE --> DHE[DriverHealthError]
    SE --> TE[TimeoutError]
    SE --> NE[NetworkError]
    SE --> FSE[FileSystemError]
    SE --> CfgE[ConfigurationError]

    AE --> AuthE[AuthenticationError]
    AE --> AuthzE[AuthorizationError]
```

### Error Properties and Relationships

```mermaid
graph TB
    DE[DriverError] --> extends[extends Error]
    DE --> CODE[code: string]
    DE --> RETRYABLE[retryable: boolean]
    DE --> CONTEXT[context?: any]

    CNFE --> CONTAINERID[containerId: string]
    CCrE --> DETAILS[details?: any]
    CSE --> CONTAINERID[containerId: string]
    CSE --> REASON[reason: string]
    CStE --> CONTAINERID[containerId: string]
    CStE --> REASON[reason: string]
    CReE --> CONTAINERID[containerId: string]
    CReE --> REASON[reason: string]

    VCrE --> VOLUMENAME[volumeName: string]
    VCrE --> REASON[reason: string]
    VNFE --> VOLUMEID[volumeId: string]
    VReE --> VOLUMEID[volumeId: string]
    VReE --> REASON[reason: string]

    NCrE --> NETWORKNAME[networkName: string]
    NCrE --> REASON[reason: string]
    NNFE --> NETWORKID[networkId: string]
    NReE --> NETWORKID[networkId: string]
    NReE --> REASON[reason: string]

    RLE --> RESOURCE[resource: string]
    RLE --> LIMIT[limit: number]
    RLE --> REQUESTED[requested: number]

    TE --> OPERATION[operation: string]
    TE --> TIMEOUT[timeout: number]
```

## Configuration Helper Relationships

### Helper Function Dependencies

```mermaid
graph TB
    CDC[createDriverConfig] --> CONFIG[Partial<ContainerConfig>]
    CDC --> DEFAULTS[Default Values]

    DEFAULTS --> DEF_SESSIONID[sessionId: ""]
    DEFAULTS --> DEF_IMAGE[image: ""]
    DEFAULTS --> DEF_COMMAND[command: []]
    DEFAULTS --> DEF_ENV[env: {}]
    DEFAULTS --> DEF_LABELS[labels: {}]
    DEFAULTS --> DEF_RESOURCES[resources: ResourceLimits]
    DEFAULTS --> DEF_VOLUMES[volumes: []]
    DEFAULTS --> DEF_NETWORK[network: string]
    DEFAULTS --> DEF_SECURITY[security: SecurityOptions]

    CRL[createResourceLimits] --> LIMITS[Partial<ResourceLimits>]
    CRL --> RL_DEFAULTS[Resource Defaults]

    RL_DEFAULTS --> DEF_CPU[cpu: 0.5]
    RL_DEFAULTS --> DEF_MEMORY[memory: 512]
    RL_DEFAULTS --> DEF_DISK[disk: 1024]
    RL_DEFAULTS --> DEF_PIDS[pids: 100]

    CSO[createSecurityOptions] --> OPTS[Partial<SecurityOptions>]
    CSO --> SO_DEFAULTS[Security Defaults]

    SO_DEFAULTS --> DEF_READONLY[readOnly: true]
    SO_DEFAULTS --> DEF_NNP[noNewPrivileges: true]
    SO_DEFAULTS --> DEF_USER[user: "openagent"]
    SO_DEFAULTS --> DEF_CAPS[capabilities]

    DEF_CAPS --> DEF_DROP[drop: ["ALL"]]
    DEF_CAPS --> DEF_ADD[add: []]
```

### Validation Function Relationships

```mermaid
graph TB
    VCC[validateContainerConfig] --> CONFIG[ContainerConfig]
    VCC --> CCS[ContainerConfigSchema]
    VCC --> RESULT[boolean]

    VRL[validateResourceLimits] --> LIMITS[ResourceLimits]
    VRL --> RLS[ResourceLimitsSchema]
    VRL --> RESULT[boolean]

    VSO[validateSecurityOptions] --> OPTS[SecurityOptions]
    VSO --> SOS[SecurityOptionsSchema]
    VSO --> RESULT[boolean]
```

## Mock Implementation Relationships

### Driver Implementation Hierarchy

```mermaid
graph TB
    CD[ContainerDriver Interface] --> MD[MockDockerDriver]
    CD --> ML[MockLocalDriver]

    MD --> extends[implements ContainerDriver]
    MD --> NAME[name: "mock-docker"]
    MD --> VERSION[version: "1.0.0"]
    MD --> DOCKER_SPECIFIC[Docker-specific behavior]

    ML --> extends[implements ContainerDriver]
    ML --> NAME[name: "mock-local"]
    ML --> VERSION[version: "1.0.0"]
    ML --> LOCAL_SPECIFIC[Local-specific behavior]

    DOCKER_SPECIFIC --> LIMITS[CPU: 4.0 max]
    DOCKER_SPECIFIC --> TIMING[100-200ms operations]
    DOCKER_SPECIFIC --> ENDPOINTS[Docker-like endpoints]

    LOCAL_SPECIFIC --> LIMITS[CPU: 2.0 max]
    LOCAL_SPECIFIC --> TIMING[200-300ms operations]
    LOCAL_SPECIFIC --> ENDPOINTS[Local-like endpoints]
```

### Mock Driver Internal Relationships

```mermaid
graph TB
    MOCK[Mock Driver] --> CONTAINERS[containers: Map]
    MOCK --> VOLUMES[volumes: Map]
    MOCK --> NETWORKS[networks: Map]
    MOCK --> STATE[state management]

    CONTAINERS --> CREATION[container creation logic]
    CONTAINERS --> TRACKING[container state tracking]
    CONTAINERS --> CLEANUP[container cleanup]

    VOLUMES --> VOL_CREATION[volume creation]
    VOLUMES --> VOL_TRACKING[volume management]
    VOLUMES --> VOL_CLEANUP[volume cleanup]

    NETWORKS --> NET_CREATION[network creation]
    NETWORKS --> NET_TRACKING[network management]
    NETWORKS --> NET_CLEANUP[network cleanup]

    STATE --> VALIDATION[state validation]
    STATE --> TRANSITIONS[state transitions]
    STATE --> CONSISTENCY[state consistency]
```

## Interface Usage Flow

### Typical Usage Pattern

```mermaid
sequenceDiagram
    participant U as User
    participant D as Driver
    participant C as Container
    participant R as Runtime

    U->>D: new Driver(config)
    U->>D: createContainer(config)
    D->>R: Create container
    R-->>D: Container created
    D-->>U: ContainerInstance
    U->>D: startContainer(id)
    D->>C: Start container
    C-->>D: Container started
    D-->>U: Success
    U->>D: getContainer(id)
    D->>C: Get container info
    C-->>D: Container info
    D-->>U: ContainerInstance
    U->>D: stopContainer(id)
    D->>C: Stop container
    C-->>D: Container stopped
    D-->>U: Success
    U->>D: removeContainer(id)
    D->>C: Remove container
    C-->>D: Container removed
    D-->>U: Success
```

### Error Handling Flow

```mermaid
sequenceDiagram
    participant U as User
    participant D as Driver
    participant E as Error Handler
    participant R as Runtime

    U->>D: createContainer(invalidConfig)
    D->>E: validateConfig(config)
    E-->>D: ValidationError
    D->>E: transformError(error)
    E-->>D: ContainerCreationError
    D-->>U: throw ContainerCreationError
    U->>E: isRetryableError(error)
    E-->>U: false (non-retryable)
    U->>E: getErrorCode(error)
    E-->>U: "CONTAINER_CREATION_FAILED"
    U->>E: getErrorMessage(error)
    E-->>U: Descriptive message
```

### Resource Management Flow

```mermaid
sequenceDiagram
    participant U as User
    participant D as Driver
    participant RM as Resource Manager
    participant C as Container

    U->>D: createContainer(config)
    D->>RM: validateResources(config.resources)
    RM-->>D: Resources valid
    D->>RM: allocateResources(config.resources)
    RM-->>D: Resources allocated
    D->>C: createWithResources(config)
    C-->>D: Container created
    D-->>U: ContainerInstance
    Note over D, RM: Track resource usage
    U->>D: removeContainer(id)
    D->>RM: deallocateResources(container.resources)
    RM-->>D: Resources deallocated
    D->>C: removeContainer(id)
    C-->>D: Container removed
    D-->>U: Success
```

## Cross-Driver Relationships

### Driver Comparison Patterns

```mermaid
graph TB
    CD[ContainerDriver Interface] --> MD[MockDockerDriver]
    CD --> ML[MockLocalDriver]

    MD --> METHODS[All Methods]
    ML --> METHODS[All Methods]

    METHODS --> createContainer
    METHODS --> startContainer
    METHODS --> stopContainer
    METHODS --> removeContainer
    METHODS --> getContainer
    METHODS --> listContainers
    METHODS --> getContainerLogs
    METHODS --> healthCheck
    METHODS --> isContainerHealthy
    METHODS --> createVolume
    METHODS --> removeVolume
    METHODS --> createNetwork
    METHODS --> removeNetwork

    MD --> DIFFS[Docker-specific differences]
    ML --> DIFFS[Local-specific differences]

    DIFFS --> RESOURCE_LIMITS[Resource limits]
    DIFFS --> TIMING[Operation timing]
    DIFFS --> ERROR_PATTERNS[Error patterns]
    DIFFS --> ENDPOINTS[Endpoint patterns]
```

### Interface Compliance Verification

```mermaid
graph TB
    TEST[Test Suite] --> INTERFACE_CHECKS[Interface Compliance]
    TEST --> BEHAVIOR_CHECKS[Behavior Consistency]
    TEST --> ERROR_CHECKS[Error Handling]

    INTERFACE_CHECKS --> METHOD_SIGNATURES[Method Signatures]
    INTERFACE_CHECKS --> PROPERTY_TYPES[Property Types]
    INTERFACE_CHECKS --> RETURN_TYPES[Return Types]

    BEHAVIOR_CHECKS --> LIFECYCLE[Container Lifecycle]
    BEHAVIOR_CHECKS --> STATE_MANAGEMENT[State Management]
    BEHAVIOR_CHECKS --> RESOURCE_MANAGEMENT[Resource Management]

    ERROR_CHECKS --> ERROR_TYPES[Error Types]
    ERROR_CHECKS --> RETRY_LOGIC[Retry Logic]
    ERROR_CHECKS --> RECOVERY_PATTERNS[Recovery Patterns]
```

## Integration Relationships

### Package Dependencies

```mermaid
graph TB
    DRIVER_INTERFACE[Driver Interface Package] --> EXTERNAL_DEPS[External Dependencies]
    DRIVER_INTERFACE --> INTERNAL_DEPS[Internal Dependencies]

    EXTERNAL_DEPS --> ZOD[zod]
    EXTERNAL_DEPS --> TYPESCRIPT[TypeScript]
    EXTERNAL_DEPS --> NODE_TYPES[@types/node]

    INTERNAL_DEPS --> SOURCE[source/]
    INTERNAL_DEPS --> TESTS[tests/]

    SOURCE --> INDEX[index.ts]
    SOURCE --> TYPES[types.ts]
    SOURCE --> ERRORS[errors.ts]

    TESTS --> MOCKS[mocks/]
    TESTS --> DEMO[demo/]

    MOCKS --> SOURCE
    DEMO --> SOURCE
    DEMO --> MOCKS
```

### Runtime Dependencies

```mermaid
graph TB
    APPLICATION[Application Code] --> DRIVER_INTERFACE
    DRIVER_INTERFACE --> RUNTIME[Container Runtime]

    APPLICATION --> CONFIG[Configuration]
    CONFIG --> VALIDATION[Schema Validation]
    VALIDATION --> ZOD

    APPLICATION --> OPERATIONS[Operations]
    OPERATIONS --> DRIVER_INTERFACE

    DRIVER_INTERFACE --> ERROR_HANDLING[Error Handling]
    ERROR_HANDLING --> ERROR_TYPES[Error Types]

    DRIVER_INTERFACE --> MONITORING[Health Monitoring]
    MONITORING --> RUNTIME
```

## Summary

The Driver Interface package demonstrates a well-structured type system with:

1. **Hierarchical Interface Design**: Clear separation between core interface, types, and implementations
2. **Comprehensive Type Safety**: Strong typing with runtime validation through Zod schemas
3. **Extensible Error Handling**: Hierarchical error system with retry logic
4. **Configuration Management**: Fluent configuration builders with validation
5. **Mock Implementations**: Realistic mock drivers for testing and demonstration
6. **Clear Separation of Concerns**: Types, errors, and implementations properly separated
7. **Testing Infrastructure**: Comprehensive test coverage with cross-driver comparison

This relationship structure ensures maintainability, type safety, and extensibility while providing a solid foundation for container management operations.