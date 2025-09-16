# Tasks: OpenAgent MVP Implementation

**Input**: Design documents from `/specs/001-initial-mvp-implementation/`
**Prerequisites**: plan.md (✓), research.md (✓), data-model.md (✓), contracts/ (✓)

## Execution Flow (main)

```
1. Load plan.md from feature directory
   → Extract: TypeScript/Bun, TanStack Start, Convex, Hono, OpenCode SDK
2. Load design documents:
   → data-model.md: 7 entities (already in schema.ts)
   → contracts/: convex-api.ts, sidecar-api.ts
   → research.md: Technical decisions for Hono, Docker, SSE
3. Generate tasks by category:
   → Setup: Sidecar project init, Docker config
   → Tests: Contract tests for APIs
   → Core: Sidecar server, Docker driver, missing Convex functions
   → Integration: Event streaming, terminal WebSocket
   → Polish: E2E tests, performance benchmarks
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001-T043)
6. Validate task completeness:
   → All contracts have tests ✓
   → All missing functions identified ✓
   → All UI components planned ✓
9. Return: SUCCESS (43 tasks ready for execution)
```

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions

- **Sidecar**: `apps/sidecar/src/`, `apps/sidecar/tests/`
- **Frontend**: `apps/web/app/`, `apps/web/tests/`
- **Backend**: `convex/`, `packages/backend/convex/`
- **Libraries**: `packages/{lib-name}/src/`
- **Tests**: `tests/contract/`, `tests/integration/`, `tests/e2e/`

## Phase 3.1: Setup

- [x] T001 Create sidecar project structure in apps/sidecar with Hono + TypeScript
- [x] T002 Initialize sidecar dependencies (hono, @opencode-ai/sdk, dockerode)
- [x] T003 [P] Configure Docker build for sidecar container image
- [x] T004 [P] Create driver-interface package structure in packages/driver-interface
- [x] T005 [P] Create crypto-lib package for envelope encryption in packages/crypto-lib

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Contract Tests - Sidecar API

- [x] T006 [P] Contract test POST /internal/register in tests/contract/sidecar-register.test.ts
- [x] T007 [P] Contract test GET /internal/health in tests/contract/sidecar-health.test.ts
- [x] T008 [P] Contract test GET /internal/ready in tests/contract/sidecar-ready.test.ts
- [x] T009 [P] Contract test PUT /internal/update-keys in tests/contract/sidecar-update-keys.test.ts
- [x] T010 [P] Contract test POST /internal/shutdown in tests/contract/sidecar-shutdown.test.ts

### Contract Tests - Convex Functions

- [x] T011 [P] Contract test sessions.provision action in tests/contract/convex-provision.test.ts
- [x] T012 [P] Contract test sessions.resume action in tests/contract/convex-resume.test.ts
- [x] T013 [P] Contract test sessions.export action in tests/contract/convex-export.test.ts
- [x] T014 [P] Contract test events.publish mutation in tests/contract/convex-events.test.ts

### Integration Tests

- [x] T015 [P] Integration test sidecar registration flow in tests/integration/sidecar-registration.test.ts
- [x] T016 [P] Integration test container provisioning in tests/integration/docker-provision.test.ts
- [x] T017 [P] Integration test key encryption/decryption in tests/integration/crypto-flow.test.ts
- [x] T018 [P] Integration test session lifecycle in tests/integration/session-lifecycle.test.ts

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Sidecar Service Implementation

- [ ] T019 Implement Hono server scaffold in apps/sidecar/src/server.ts
- [ ] T020 Implement X25519 key generation in apps/sidecar/src/auth/keys.ts
- [ ] T021 Implement registration endpoint in apps/sidecar/src/routes/internal.ts
- [ ] T022 Integrate OpenCode SDK server in apps/sidecar/src/opencode/server.ts
- [ ] T023 Implement event bridging in apps/sidecar/src/events/bridge.ts
- [ ] T024 Add terminal WebSocket handler in apps/sidecar/src/terminal/websocket.ts
- [ ] T025 Implement health/ready endpoints in apps/sidecar/src/routes/health.ts
- [ ] T026 Add graceful shutdown handler in apps/sidecar/src/lifecycle/shutdown.ts

### Container Driver Implementation

- [x] T027 Define driver interface in packages/driver-interface/src/types.ts
- [ ] T028 Implement Docker driver in convex/drivers/docker.ts
- [ ] T029 Add volume management in convex/drivers/docker-volumes.ts
- [ ] T030 Implement network isolation in convex/drivers/docker-network.ts
- [ ] T031 Add container health monitoring in convex/drivers/docker-health.ts

### Missing Convex Functions

- [ ] T032 Implement sessions.provision action in convex/sessions.ts
- [ ] T033 Implement sessions.resume action in convex/sessions.ts
- [ ] T034 Add internal.events.publish mutation in convex/events.ts
- [ ] T035 Implement usage.track mutation in convex/usage.ts
- [ ] T036 Create export.zip action in convex/export.ts

## Phase 3.4: Frontend Components

- [ ] T037 [P] Create SessionChat component in apps/web/app/components/session/chat.tsx
- [ ] T038 [P] Implement MessageStream component in apps/web/app/components/session/message-stream.tsx
- [ ] T039 [P] Add PermissionsModal component in apps/web/app/components/session/permissions-modal.tsx
- [ ] T040 [P] Create Terminal component with xterm.js in apps/web/app/components/session/terminal.tsx
- [ ] T041 [P] Build SessionList component in apps/web/app/components/dashboard/session-list.tsx
- [ ] T042 [P] Add ProviderKeyManager component in apps/web/app/components/settings/provider-keys.tsx

## Phase 3.5: Polish & E2E Testing

- [ ] T043 End-to-end test complete session flow in tests/e2e/session-flow.test.ts

## Dependencies

- Setup (T001-T005) before all tests
- Tests (T006-T018) before implementation (T019-T042)
- Sidecar core (T019-T026) before Docker driver usage
- Docker driver (T027-T031) required for provisioning
- Convex functions (T032-T036) required for frontend
- All implementation before E2E test (T043)

## Parallel Execution Examples

### Batch 1: Setup Tasks (After T001-T002)

```bash
# Launch T003-T005 together:
Task: "Configure Docker build for sidecar container image"
Task: "Create driver-interface package structure in packages/driver-interface"
Task: "Create crypto-lib package for envelope encryption in packages/crypto-lib"
```

### Batch 2: Contract Tests (After setup complete)

```bash
# Launch T006-T014 together:
Task: "Contract test POST /internal/register in tests/contract/sidecar-register.test.ts"
Task: "Contract test GET /internal/health in tests/contract/sidecar-health.test.ts"
Task: "Contract test GET /internal/ready in tests/contract/sidecar-ready.test.ts"
Task: "Contract test PUT /internal/update-keys in tests/contract/sidecar-update-keys.test.ts"
Task: "Contract test POST /internal/shutdown in tests/contract/sidecar-shutdown.test.ts"
Task: "Contract test sessions.provision action in tests/contract/convex-provision.test.ts"
Task: "Contract test sessions.resume action in tests/contract/convex-resume.test.ts"
Task: "Contract test sessions.export action in tests/contract/convex-export.test.ts"
Task: "Contract test events.publish mutation in tests/contract/convex-events.test.ts"
```

### Batch 3: Integration Tests

```bash
# Launch T015-T018 together:
Task: "Integration test sidecar registration flow in tests/integration/sidecar-registration.test.ts"
Task: "Integration test container provisioning in tests/integration/docker-provision.test.ts"
Task: "Integration test key encryption/decryption in tests/integration/crypto-flow.test.ts"
Task: "Integration test session lifecycle in tests/integration/session-lifecycle.test.ts"
```

### Batch 4: Frontend Components (After T032-T036)

```bash
# Launch T037-T042 together:
Task: "Create SessionChat component in apps/web/app/components/session/chat.tsx"
Task: "Implement MessageStream component in apps/web/app/components/session/message-stream.tsx"
Task: "Add PermissionsModal component in apps/web/app/components/session/permissions-modal.tsx"
Task: "Create Terminal component with xterm.js in apps/web/app/components/session/terminal.tsx"
Task: "Build SessionList component in apps/web/app/components/dashboard/session-list.tsx"
Task: "Add ProviderKeyManager component in apps/web/app/components/settings/provider-keys.tsx"
```

## Notes

- [P] tasks = different files, no dependencies
- Verify tests fail before implementing
- Commit after each task using conventional commits
- Sidecar implementation is highest priority (blocking)
- Frontend components can develop in parallel once backend ready

## Task Generation Rules Applied

1. **From Contracts**:
   - sidecar-api.ts → 5 contract tests (T006-T010)
   - convex-api.ts → 4 contract tests (T011-T014)
   - Each endpoint → implementation task
2. **From Data Model**:
   - Schema already implemented (no model tasks needed)
   - Missing Convex functions identified → T032-T036
3. **From Quickstart Scenarios**:

   - Registration flow → T015
   - Container provisioning → T016
   - Session lifecycle → T018
   - E2E validation → T043

4. **Ordering**:
   - Setup → Tests → Sidecar → Docker → Convex → Frontend → E2E
   - Dependencies clearly marked

## Validation Checklist

- [x] All contracts have corresponding tests
- [x] All missing implementations identified
- [x] All tests come before implementation
- [x] Parallel tasks truly independent
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task

---

_Tasks generated: 2025-09-08 | Total: 43 tasks_
