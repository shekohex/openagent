# Implementation Plan: OpenAgent MVP Implementation

**Branch**: `001-initial-mvp-implementation` | **Date**: 2025-09-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-initial-mvp-implementation/spec.md`

## Execution Flow (/plan command scope)

```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
4. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
5. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, or `GEMINI.md` for Gemini CLI).
6. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
7. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
8. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:

- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary

Build a cloud-based AI coding agent platform that allows developers to access AI agents (OpenCode, GitHub Copilot, etc.) through a web interface. Users can type project requirements in a chat box, watch agents work in real-time, and continue sessions across devices. The MVP focuses on authentication, session management, real-time streaming, and containerized agent execution using TanStack Start + React frontend, Convex backend, and OpenCode SDK-based sidecars.

## Technical Context

**Language/Version**: TypeScript 5.x, Bun
**Primary Dependencies**: TanStack Start, React, shadcn/ui, Convex, Hono, OpenCode SDK, xterm.js  
**Storage**: Convex database for metadata, persistent volumes for session data, S3-compatible storage for artifacts  
**Testing**: Vitest for unit/integration tests, Playwright for E2E  
**Target Platform**: Web browsers (Chrome, Firefox, Safari), Docker containers for sidecars
**Project Type**: web - Full-stack application with frontend + backend + sidecar services  
**Performance Goals**: <30s session provisioning, real-time streaming <100ms latency, support 100+ concurrent sessions  
**Constraints**: Secure key handling, container isolation, 15-minute idle timeout, cross-device continuity  
**Scale/Scope**: MVP: 100+ users, 1000+ sessions/day, indefinite session retention

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Simplicity**:

- Projects: 3 (frontend, backend/orchestrator, sidecar)
- Using framework directly? YES (Convex, TanStack, Hono, OpenCode SDK)
- Single data model? YES (Convex schema is source of truth)
- Avoiding patterns? YES (direct Convex mutations/queries, no unnecessary abstractions)

**Architecture**:

- EVERY feature as library? PARTIAL (core features modularized, MVP focuses on integration)
- Libraries listed:
  - auth-lib: Authentication via Convex Auth
  - crypto-lib: Envelope encryption for keys
  - opencode-client: Typed SDK client wrapper
  - driver-interface: Container provisioning abstraction
- CLI per library: PLANNED for post-MVP
- Library docs: llms.txt format PLANNED

**Testing (NON-NEGOTIABLE)**:

- RED-GREEN-Refactor cycle enforced? YES
- Git commits show tests before implementation? YES
- Order: Contract→Integration→E2E→Unit strictly followed? YES
- Real dependencies used? YES (Convex dev, Docker containers)
- Integration tests for: new libraries, contract changes, shared schemas? YES
- FORBIDDEN: Implementation before test, skipping RED phase ✓

**Observability**:

- Structured logging included? YES
- Frontend logs → backend? YES (via Convex)
- Error context sufficient? YES

**Versioning**:

- Version number assigned? 0.1.0 (MVP)
- BUILD increments on every change? YES
- Breaking changes handled? N/A for MVP (first version)

## Project Structure

### Documentation (this feature)

```
specs/001-initial-mvp-implementation/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)

```
# Option 2: Web application (frontend + backend + sidecar)
apps/
├── web/                 # Frontend
│   ├── app/
│   │   ├── routes/
│   │   ├── components/
│   │   └── lib/
│   └── tests/
├── sidecar/            # Sidecar service
│   ├── src/
│   │   ├── server.ts
│   │   ├── auth/
│   │   └── control/
│   └── tests/
│
convex/                 # Backend orchestrator
├── _generated/
├── auth.config.ts
├── schema.ts
├── sessions.ts
├── keys.ts
├── permissions.ts
└── drivers/

packages/               # Shared libraries
├── auth-lib/
├── crypto-lib/
├── opencode-client/
└── driver-interface/

tests/
├── contract/
├── integration/
└── e2e/
```

**Structure Decision**: Option 2 - Web application structure (frontend + backend architecture)

## Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:

   - No NEEDS CLARIFICATION items remaining
   - Key integrations to research: Convex Auth, OpenCode SDK, Hono framework, envelope encryption

2. **Generate and dispatch research agents**:

   ```
   Task: "Research Convex Auth patterns for multi-tenant applications"
   Task: "Find best practices for OpenCode SDK server integration"
   Task: "Research Hono framework for typed API development"
   Task: "Investigate envelope encryption implementation patterns"
   Task: "Research Docker SDK/API for container provisioning"
   Task: "Find SSE/WebSocket patterns with Convex"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all technical decisions documented

## Phase 1: Design & Contracts

_Prerequisites: research.md complete_

1. **Extract entities from feature spec** → `data-model.md`:

   - User, Session, Instance, ProviderKey, Permission, UsageEvent, SessionArtifact
   - Validation rules from requirements
   - State transitions for sessions and instances

2. **Generate API contracts** from functional requirements:

   - Convex functions (queries/mutations/actions)
   - Sidecar REST API endpoints
   - WebSocket protocols for terminal and events
   - Output to `/contracts/`

3. **Generate contract tests** from contracts:

   - One test file per Convex function
   - Sidecar API endpoint tests
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:

   - Authentication flow test
   - Session lifecycle test
   - Permission handling test
   - Export functionality test

5. **Update agent file incrementally** (O(1) operation):
   - Update CLAUDE.md with OpenAgent specifics
   - Add tech stack and patterns
   - Keep under 150 lines

**Output**: data-model.md, /contracts/\*, failing tests, quickstart.md, updated CLAUDE.md

## Phase 2: Task Planning Approach

_This section describes what the /tasks command will do - DO NOT execute during /plan_

**Task Generation Strategy**:

- Load `/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs and existing implementation gaps:

**Category 1: Sidecar Implementation (Priority 1)**
- Task: Create Hono server scaffold with TypeScript
- Task: Implement registration endpoint with X25519 key generation
- Task: Integrate OpenCode SDK server startup
- Task: Implement event bridging from OpenCode to orchestrator
- Task: Add terminal WebSocket with PTY support
- Task: Create health and readiness endpoints
- Task: Implement graceful shutdown handling

**Category 2: Container Provisioning (Priority 1)**
- Task: Create Docker driver interface
- Task: Implement container creation with dockerode
- Task: Add volume mounting for session persistence
- Task: Implement network isolation per session
- Task: Add resource limits and security constraints
- Task: Create container health monitoring

**Category 3: Missing Convex Functions (Priority 2)**
- Task: Implement sessions.provision action
- Task: Create sessions.resume action
- Task: Add internal event publishing mutations
- Task: Implement usage tracking functions
- Task: Create export.zip and export.github actions

**Category 4: Frontend Components (Priority 2)**
- Task: Create session chat interface component
- Task: Implement real-time message streaming UI
- Task: Add permissions modal component
- Task: Create terminal component with xterm.js
- Task: Build session list and management UI
- Task: Add provider key management UI

**Category 5: Integration & Testing (Priority 3)**
- Task: Write Convex function contract tests
- Task: Create sidecar integration tests
- Task: Add end-to-end session lifecycle tests
- Task: Implement performance benchmarks
- Task: Create quickstart validation tests

**Ordering Strategy**:

- TDD order: Tests before implementation
- Dependency order:
  1. Sidecar core (registration, OpenCode integration)
  2. Docker driver (needed for sidecar to run)
  3. Missing Convex backend functions
  4. Frontend components (can develop in parallel)
  5. Integration tests (after components ready)
- Mark [P] for parallel execution where dependencies allow

**Task Prioritization**:
- P0: Sidecar + Docker driver (blocking everything else)
- P1: Core Convex functions for session lifecycle
- P2: Frontend UI components
- P3: Polish, testing, documentation

**Estimated Output**: 35-45 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation

_These phases are beyond the scope of the /plan command_

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking

_No violations requiring justification - proceeding with standard patterns_

## Progress Tracking

_This checklist is updated during execution flow_

**Phase Status**:

- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command - ready to execute)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:

- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented

---

_Based on Constitution v2.1.1 - See `/memory/constitution.md`_