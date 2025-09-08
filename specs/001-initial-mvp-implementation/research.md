# Research Findings: OpenAgent MVP Implementation

**Date**: 2025-09-08  
**Status**: Complete

## Executive Summary

Based on analysis of the existing codebase and technical requirements, the OpenAgent MVP has a solid foundation with Convex backend, authentication, and data models already implemented. The primary gaps are in the sidecar service, container provisioning, real-time streaming, and UI components for session interaction.

## Existing Implementation Analysis

### ✅ Already Implemented
- **Backend Infrastructure**: Complete Convex schema matching PLAN.md specifications
- **Authentication**: Convex Auth with email/GitHub providers
- **Key Management**: Envelope encryption with rate limiting
- **Session Management**: CRUD operations with registration token system
- **Frontend Foundation**: TanStack Start with routing and auth flow

### 🚧 Implementation Gaps
- Sidecar service (Hono server with OpenCode SDK)
- Container provisioning drivers
- Real-time event streaming
- Terminal integration
- Chat interface and permissions UI

## Technical Decisions

### 1. Sidecar Architecture with Hono + OpenCode SDK

**Decision**: Use Hono framework with OpenCode SDK for sidecar implementation

**Rationale**:
- Hono provides ultra-fast performance with excellent TypeScript support
- OpenCode SDK offers programmatic server control with `createOpencodeServer()`
- Type-safe client generation with hono/client ensures API consistency
- Lightweight footprint suitable for containerized environments

**Alternatives Considered**:
- Express.js - Slower performance, less type safety
- Fastify - Good performance but more complex TypeScript integration
- Raw HTTP server - Too low-level, missing essential features

**Implementation Notes**:
```typescript
// Sidecar server structure
const app = new Hono()
  .post('/internal/register', async (c) => {
    // Handle orchestrator registration
    const { sessionId, regToken, pubKey } = await c.req.json();
    // Validate and establish secure channel
  })
  .get('/internal/ready', (c) => c.json({ ready: true }))
  .post('/control/message', async (c) => {
    // Forward to OpenCode server
  });

// OpenCode server integration
const opencodeServer = await createOpencodeServer({
  hostname: "0.0.0.0", // Container-internal binding
  port: assignedPort,
  config: { model: "anthropic/claude-3-5-sonnet-20241022" }
});
```

### 2. Container Provisioning with Docker SDK

**Decision**: Use dockerode library for Docker container management

**Rationale**:
- Docker Engine API provides full programmatic control
- Dockerode offers excellent Node.js/TypeScript integration
- Volume mounting enables session persistence
- Network isolation ensures security between sessions

**Alternatives Considered**:
- Kubernetes - Overkill for MVP, significantly more complex
- Podman - Less ecosystem support and documentation
- Docker CLI exec - Less reliable, harder error handling

**Implementation Notes**:
```typescript
// Driver interface implementation
class DockerDriver implements ContainerDriver {
  async provision(spec: StartSpec): Promise<ProvisionResult> {
    const container = await docker.createContainer({
      Image: 'openagent/sidecar:latest',
      Env: [`SESSION_ID=${spec.sessionId}`],
      HostConfig: {
        Memory: 1024 * 1024 * 1024, // 1GB
        Mounts: [{
          Target: '/workspace',
          Source: `sessions/${spec.sessionId}`,
          Type: 'volume'
        }],
        PortBindings: {
          [`${spec.listenPort}/tcp`]: [{ HostPort: spec.listenPort.toString() }]
        }
      }
    });
    await container.start();
    return { endpointInternal: '127.0.0.1', containerId: container.id };
  }
}
```

### 3. Real-time Streaming with Convex + SSE

**Decision**: Use Convex real-time subscriptions with Server-Sent Events

**Rationale**:
- Convex provides built-in real-time subscriptions with automatic recovery
- SSE is simpler than WebSockets for unidirectional server-to-client flow
- Automatic handling of backpressure and connection scaling
- Native integration with Convex auth system

**Alternatives Considered**:
- Raw WebSockets - More complex connection management
- Socket.io - Additional dependency and complexity
- Polling - Inefficient and not truly real-time

**Implementation Notes**:
```typescript
// Convex side - event publishing
export const publishEvent = internalMutation({
  args: { sessionId: v.id("sessions"), event: v.object({...}) },
  handler: async (ctx, args) => {
    // Store event for real-time subscribers
    await ctx.db.insert("sessionEvents", {
      sessionId: args.sessionId,
      event: args.event,
      timestamp: Date.now()
    });
  }
});

// Frontend - consuming events
const { data: events } = useQuery(api.sessions.subscribeToEvents, { sessionId });
```

### 4. Secure Key Provisioning

**Decision**: Continue with existing envelope encryption, add ephemeral key exchange

**Rationale**:
- Existing envelope encryption is well-implemented
- Adding X25519 ephemeral keys for sidecar communication
- Zero-knowledge approach - keys never written to disk
- Automatic key rotation on session resume

**Alternatives Considered**:
- HashiCorp Vault - Too complex for MVP
- AWS Secrets Manager - Vendor lock-in
- Plain encryption - Insufficient security

**Implementation Notes**:
```typescript
// Key exchange during registration
const ephemeralKeys = await generateX25519KeyPair();
const sealedKeys = await sealProviderKeys(
  providerKeys,
  sidecarPublicKey,
  orchestratorPrivateKey
);
// Keys injected to OpenCode, then zeroed from memory
```

### 5. Terminal Integration

**Decision**: Use xterm.js with WebSocket proxy through orchestrator

**Rationale**:
- xterm.js is the industry standard for web terminals
- WebSocket provides bidirectional communication for PTY
- Orchestrator proxy ensures authentication and security
- Supports resize, colors, and full terminal features

**Alternatives Considered**:
- Basic textarea - Poor user experience
- SSH.js - Unnecessary complexity
- Direct sidecar connection - Security risk

**Implementation Notes**:
```typescript
// Terminal component
const terminal = new Terminal({
  cursorBlink: true,
  fontSize: 14,
  theme: { background: '#1e1e1e' }
});

// WebSocket connection with auth token
const ws = new WebSocket(`/terminal/${sessionId}?token=${token}`);
terminal.onData(data => ws.send(data));
ws.onmessage = (e) => terminal.write(e.data);
```

### 6. Models.dev Integration

**Decision**: Fetch provider list dynamically from models.dev API

**Rationale**:
- Single source of truth for AI providers
- Automatically stays updated with new models
- Reduces maintenance burden
- Provides model metadata and pricing

**Alternatives Considered**:
- Hard-coded provider list - Requires manual updates
- Custom provider registry - Unnecessary complexity
- Direct provider APIs - Too many integrations

**Implementation Notes**:
```typescript
// Provider fetching
export const fetchProviders = action({
  handler: async () => {
    const response = await fetch('https://api.models.dev/providers');
    const providers = await response.json();
    return providers.map(p => ({
      id: p.id,
      name: p.name,
      models: p.models,
      requiresKey: p.authType === 'api_key'
    }));
  }
});
```

## Architecture Validation

### Security Considerations
- ✅ Envelope encryption for keys (implemented)
- ✅ Session isolation via containers
- ✅ Authentication and authorization (implemented)
- ✅ Ephemeral key exchange for sidecar communication
- ✅ No secrets in environment variables

### Performance Targets
- ✅ <30s session provisioning (achievable with Docker)
- ✅ <100ms streaming latency (Convex real-time)
- ✅ 100+ concurrent sessions (horizontal scaling ready)

### Scalability Path
- ✅ Stateless orchestrator (Convex handles state)
- ✅ Independent sidecar instances
- ✅ Volume-based persistence
- ✅ Ready for Kubernetes migration post-MVP

## Implementation Priority

Based on existing code and dependencies:

1. **Phase 1: Core Sidecar** (Week 1)
   - Hono server setup
   - OpenCode SDK integration
   - Registration handshake
   - Event streaming

2. **Phase 2: Container Management** (Week 1)
   - Docker driver implementation
   - Volume management
   - Network isolation
   - Health checks

3. **Phase 3: UI Components** (Week 2)
   - Chat interface
   - Event display
   - Terminal integration
   - Permissions modal

4. **Phase 4: Integration** (Week 2)
   - End-to-end testing
   - Performance optimization
   - Error handling
   - Documentation

## Risk Mitigation

### Technical Risks
- **OpenCode SDK compatibility**: Tested with v0.6.4, monitoring for breaking changes
- **Container resource limits**: Implementing quotas and monitoring
- **Network latency**: Using regional deployments and CDN
- **Key compromise**: Automatic rotation and audit logging

### Operational Risks
- **Container escape**: Using security profiles and minimal images
- **DoS attacks**: Rate limiting at multiple layers
- **Data loss**: Volume snapshots and session JSON backups

## Conclusion

The OpenAgent MVP has a strong foundation with critical infrastructure already in place. The remaining implementation focuses on:
1. Completing the sidecar service with OpenCode integration
2. Implementing container provisioning
3. Building the session interaction UI
4. Connecting all components with real-time streaming

The architecture decisions leverage existing implementations while filling gaps with proven, production-ready technologies. The modular approach allows for parallel development and future scaling.

## Next Steps

1. Generate contracts and data models (Phase 1)
2. Create implementation tasks based on this research
3. Begin sidecar development with Hono + OpenCode
4. Implement Docker driver in parallel
5. Build UI components incrementally

---
*Research completed: 2025-09-08*