# OpenAgent MVP Quickstart Guide

**Version**: 0.1.0 (MVP)  
**Date**: 2025-09-08

## Prerequisites

- Node.js 20+ and Bun installed
- Docker Desktop running (for container provisioning)
- Convex account (free tier works)
- At least one AI provider API key (OpenAI, Anthropic, etc.)

## Quick Setup

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/openagent.git
cd openagent
bun install
```

### 2. Configure Environment

```bash
# Copy environment template
cp apps/web/.env.example apps/web/.env
cp packages/backend/.env.example packages/backend/.env.local

# Edit packages/backend/.env.local
CONVEX_DEPLOYMENT=your-deployment
OPENAGENT_MASTER_KEY=generate-random-32-byte-hex

# Edit apps/web/.env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

### 3. Setup Convex

```bash
# Setup Convex project
bun dev:setup

# This will:
# - Create Convex project
# - Deploy schema
# - Setup auth tables
```

### 4. Start Development Environment

```bash
# Terminal 1: Start all services
bun dev

# This starts:
# - Convex backend (port 8000)
# - Web frontend (port 3001)
# - Watching for changes
```

## Testing the MVP

### Test 1: Authentication Flow

1. **Navigate to** http://localhost:3001
2. **Expected**: Redirected to login page
3. **Action**: Sign up with email or GitHub
4. **Verify**: 
   - User created in Convex dashboard
   - Redirected to dashboard
   - Session cookie set

```typescript
// Test via SDK
const user = await convexClient.query(api.users.current);
assert(user.email === 'test@example.com');
```

### Test 2: Provider Key Management

1. **Navigate to** settings/keys
2. **Action**: Add OpenAI API key
3. **Verify**:
   - Key encrypted in database
   - Key version incremented
   - Success toast shown

```typescript
// Test encryption
const hasKey = await convexClient.query(api.providerKeys.hasProviderKey, {
  provider: "openai"
});
assert(hasKey === true);
```

### Test 3: Session Creation

1. **Navigate to** dashboard
2. **Click** "New Session"
3. **Enter** session title
4. **Verify**:
   - Session created with status "creating"
   - Registration token generated
   - Container provisioning started

```typescript
// Test session creation
const { sessionId, registrationToken } = await convexClient.mutation(
  api.sessions.create,
  { title: "Test Session" }
);
assert(sessionId && registrationToken);
```

### Test 4: Sidecar Registration

```bash
# Start sidecar locally for testing
cd packages/sidecar
bun run dev --session-id=<sessionId> --token=<registrationToken>
```

**Verify**:
- Sidecar registers with orchestrator
- OpenCode server starts on assigned port
- Keys provisioned successfully
- Ready event received

### Test 5: Message Streaming

1. **In session view**, type: "Create a hello world Python script"
2. **Press** Enter
3. **Verify**:
   - Message appears immediately
   - Streaming response starts
   - Code blocks rendered
   - Token counter updates

```typescript
// Test via OpenCode SDK
const client = createOpencodeClient({ 
  baseUrl: `http://localhost:${opencodePort}` 
});

const result = await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: "text", text: "Hello" }],
    model: { 
      providerID: "anthropic", 
      modelID: "claude-3-5-sonnet-20241022" 
    }
  }
});
```

### Test 6: Permission Handling

1. **Send prompt**: "Delete all files in /tmp"
2. **Expected**: Permission modal appears
3. **Action**: Click "Deny"
4. **Verify**:
   - Permission denied in response
   - No files deleted
   - Event logged

### Test 7: Terminal Access

1. **Click** Terminal tab
2. **Type**: `ls -la`
3. **Verify**:
   - Command executes
   - Output displayed
   - Colors rendered correctly
   - Resize works

### Test 8: Export Functionality

1. **Click** Export → Download ZIP
2. **Verify**:
   - ZIP downloads
   - Contains workspace files
   - Preserves directory structure

```bash
# Test ZIP contents
unzip -l session-export.zip
```

### Test 9: Session Resume

1. **Stop** session (click Stop button)
2. **Wait** 5 seconds
3. **Click** Resume
4. **Verify**:
   - Session restores state
   - Messages preserved
   - Can continue conversation

### Test 10: Cross-Device Session

1. **Open** session on Device A
2. **Login** on Device B with same account
3. **Open** same session
4. **Verify**:
   - Real-time sync of messages
   - Both can interact
   - Permissions shared

## Performance Benchmarks

Run the performance test suite:

```bash
bun test:perf
```

Expected results:
- Session creation: <30s
- Message latency: <100ms
- Event streaming: <50ms
- Container provision: <20s
- Key encryption: <10ms

## Integration Tests

```bash
# Run full integration test suite
bun test:integration

# Expected output:
# ✓ Authentication flow (5 tests)
# ✓ Session lifecycle (8 tests)
# ✓ Key management (4 tests)
# ✓ Message streaming (6 tests)
# ✓ Permission system (3 tests)
# ✓ Export functionality (2 tests)
```

## Common Issues

### Issue: Container fails to start
```bash
# Check Docker is running
docker ps

# Check logs
docker logs openagent-session-<id>

# Solution: Restart Docker Desktop
```

### Issue: Keys not decrypting
```bash
# Verify master key is set
echo $OPENAGENT_MASTER_KEY

# Check key version
convex run providerKeys:checkVersion
```

### Issue: Events not streaming
```bash
# Check SSE connection
curl -N http://localhost:4096/event

# Verify Convex subscriptions
convex dashboard → Functions → Check subscriptions
```

## Production Deployment

### 1. Build for Production

```bash
# Build all packages
bun build

# Output:
# - apps/web/.output/
# - packages/sidecar/dist/
```

### 2. Deploy Convex

```bash
# Deploy to production
bun convex deploy --prod

# Run migrations if needed
bun convex run migrations:latest --prod
```

### 3. Deploy Web App

```bash
# Deploy to Vercel/Netlify
cd apps/web
vercel --prod
```

### 4. Deploy Sidecar

```bash
# Build Docker image
docker build -t openagent/sidecar:latest packages/sidecar

# Push to registry
docker push openagent/sidecar:latest
```

## Monitoring

### Key Metrics to Track

1. **Session Metrics**
   - Active sessions
   - Session duration
   - Messages per session

2. **Performance Metrics**
   - API latency (p50, p95, p99)
   - Streaming latency
   - Container startup time

3. **Error Rates**
   - Failed provisions
   - Key decryption errors
   - Permission denials

4. **Usage Metrics**
   - Tokens consumed
   - Storage used
   - Concurrent users

### Health Checks

```bash
# Orchestrator health
curl http://localhost:8000/health

# Sidecar health
curl http://localhost:4096/internal/health

# OpenCode health
curl http://localhost:4096/config
```

## Next Steps

1. **Enable GitHub Export**: Configure GitHub app for repository push
2. **Add More Providers**: Integrate models from models.dev
3. **Setup Monitoring**: Deploy Grafana/Prometheus
4. **Configure Backups**: Enable session artifact backups to S3
5. **Scale Testing**: Load test with 100+ concurrent sessions

---

## Support

- Documentation: https://openagent.dev/docs
- Issues: https://github.com/yourusername/openagent/issues
- Discord: https://discord.gg/openagent