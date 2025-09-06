# OpenAgent™ Plan (MVP + Roadmap)

Last updated: 2025-09-06

## 1) Goals & Scope

- Goal: Background coding agent that runs remotely in sandboxed containers/VMs using opencode as backbone.
- MVP components: Web UI, Orchestrator API, Sidecar per session (embedding opencode server + SDK).
- Core flows: Auth → onboarding (BYOK or managed) → start session → stream output → run shell/file ops → permissions → export code → stop/resume.

## 2) Architecture

- Frontend (Web UI): TanStack Start + React + shadcn/ui, xterm.js terminal, streaming session view, provider/model switcher, slash commands, subagents UI, permissions prompts.
- Orchestrator (Backend): Bun.serve. Multi-tenant API (users only for MVP), Drizzle ORM + Postgres with RLS, drivers (Docker dev/prod-ready), secure key provisioning, event fanout (SSE/WS), usage collection.
- Sidecar (Per-session): Bun.serve. Starts opencode server (SDK), handles secure key injection, bridges events, exposes Agent Control API, PTY terminal server, maintains opencode session JSON persistence.

## 3) Key Decisions

- Session identity: Orchestrator session ID equals opencode session ID (1:1).
- Resume source: Persist only opencode session JSON (no workspace FS). Users export code via GitHub push or ZIP.
- Users only: No organizations in MVP; RLS keyed by `user_id`.
- Token/context: Rely on opencode for usage and context; display in UI.
- Model/provider switching: Change provider/model per message; keys injected on demand.
- Opencode features: Support slash commands, subagents, and stream all opencode events to UI.

## 4) Data Model (Drizzle + Postgres)

- users: id (uuid pk), email (unique), created_at
- sessions: id (uuid pk = opencode id), user_id, title, status (creating|active|idle|stopped|error), current_instance_id?, last_activity_at, created_at, updated_at
- instances: id (uuid), session_id, driver (docker|k8s|local), state (provisioning|running|terminated|error), endpoint_internal, registered_at, terminated_at, session_json_path
- provider_keys: id (uuid), user_id, provider (text), encrypted_key (bytea), encrypted_data_key (bytea), key_version (int), created_at, last_used_at?
- pending_permissions: id (uuid), session_id, permission_id (opencode), payload (jsonb), created_at, resolved_at?, response?
- usage_events: id, session_id, user_id, type (tokens|runtime|storage), quantity (numeric), meta (jsonb), created_at
- session_artifacts: id, session_id, type ('session_json'|'zip'|'git'), url_or_path (text), created_at
- Indexes: sessions (user_id, created_at desc), instances (session_id), pending_permissions (session_id, created_at), usage_events (session_id, created_at)

## 5) RLS & Roles

- Enable RLS on all tenant tables.
- Policy pattern: `USING (user_id = auth.uid())`; for instances/permissions, enforce via `EXISTS` join to sessions.
- Roles: `app_user` (RLS enforced), `orchestrator_service` (needs decrypt privileges for keys), `migration_role`.
- Secrets never selectable by frontend role; key retrieval only via orchestrator service path.

## 6) Session Lifecycle

1) Create
- Orchestrator inserts sessions row (status=creating).
- Provision target with per-session volume containing `opencode/sessions/` only.
- Sidecar starts, registers to orchestrator with reg token + ephemeral pubkey.
- Orchestrator envelope-decrypts provider keys; re-encrypts per sidecar ephemeral key; returns sealed bundle.
- Sidecar sets keys via opencode `/auth/:provider`; creates or verifies opencode session; confirm session id matches.
- Mark session active; attach event streams.

2) Active
- Events bridged to orchestrator SSE/WS.
- Minimal indices (messages metadata, permissions, usage) persisted for lists and UX.

3) Stop/Idle
- Tear down instance on TTL or request.
- Ensure session JSON persisted on volume; optionally upload session JSON to object storage; record `session_artifacts`.

4) Resume
- If no instance: provision and mount same volume; start opencode; ensure session exists from JSON; no message replay required.
- If volume unavailable: restore session JSON from `session_artifacts` backup. Message replay not required if JSON is sufficient.

## 7) Persistence & Export

- Persist: opencode session JSON only (path recorded in `instances.session_json_path` and `session_artifacts`).
- Code export: 
  - ZIP: orchestrator endpoint streams a snapshot.
  - GitHub: push to user’s repo/branch with user-provided token.
- Optional: background upload of session JSON to S3-compatible storage for resilience.

## 8) Orchestrator API (Public)

- POST `/v1/sessions` { title?, target? } → { id, status, stream }
- GET `/v1/sessions` → list
- GET `/v1/sessions/:id` → details
- POST `/v1/sessions/:id/resume` → resume if stopped
- DELETE `/v1/sessions/:id` → stop and cleanup
- GET `/v1/sessions/:id/stream` (SSE or WS) → multiplexed events
- POST `/v1/sessions/:id/prompt` { model?, parts[] }
- POST `/v1/sessions/:id/command` { command, args? } (slash/subagents)
- POST `/v1/sessions/:id/shell` { command, cwd? }
- GET `/v1/sessions/:id/permissions` → pending list
- POST `/v1/sessions/:id/permissions/:permissionID` { response }
- GET `/v1/agents` → opencode agents
- GET `/v1/config/providers` → providers/default models
- PUT `/v1/keys/:provider` { key or managed } → BYOK upsert
- WS `/v1/sessions/:id/terminal` → xterm bridge

## 9) Sidecar (Internal API/Behavior)

- Bootstrap:
  - Generate ephemeral X25519 keypair.
  - POST `/internal/register` { sessionID, regToken, pubKey }.
  - Receive sealed provider keys + sidecarAuthToken.
  - Decrypt in-memory; set opencode `PUT /auth/:id`; zero buffers.
- Start opencode server using SDK `createOpencodeServer`.
- Create/verify session via SDK; attach events `event.subscribe()`.
- Expose Agent Control endpoints for orchestrator calls: message, command, shell, permissions.
- PTY server (WebSocket) for terminal; spawn `/bin/bash -l` under non-root user; idle timeout; resize.

## 10) Provider Keys (Encryption & Provisioning)

- Storage: Envelope encryption.
  - Generate random data key (DK).
  - Encrypt provider key with DK (AES-256-GCM).
  - Encrypt DK with master key (`OPENAGENT_MASTER_KEY` or KMS).
  - Store ciphertexts + nonces + key_version.
- Provisioning:
  - Orchestrator decrypts DK with master, decrypts provider key, re-encrypts with sidecar ephemeral pubkey (sealed box).
  - Send sealed payload; sidecar decrypts locally; never writes to disk; injects into opencode; discards.

## 11) Streaming & Events

- Orchestrator offers SSE and WS for UI.
- Forward all opencode events:
  - message.append, message.complete, session.status, permission.request, permission.resolved, token.usage, context.info, server.connected.
- Maintain cursors for UI pagination; persist minimal metadata for session list performance.

## 12) Slash Commands & Subagents

- UI parses `/command args...` and shows command palette.
- Orchestrator routes to sidecar `session.command`.
- Stream results like normal messages; support subagent invocations as surfaced by opencode.

## 13) Terminal (MVP)

- Frontend: xterm.js connects to WS `/v1/sessions/:id/terminal`.
- Orchestrator: Authenticates session and token; proxies WS frames to sidecar PTY.
- Sidecar: PTY WS; non-root shell; no provider keys in env; allow resize, ctrl-c, paste.
- Security: Per-session WS tokens, short TTL, cap-drop, seccomp, limited egress by default.

## 14) Frontend UX

- Routes: `/login`, `/onboarding/keys`, `/sessions`, `/sessions/:id`, `/sessions/:id/resume`.
- Session view:
  - Live stream of messages and events.
  - Prompt input with model/provider selector.
  - Slash commands palette.
  - Permissions modal for allow/deny.
  - Usage & context window panel.
  - Terminal tab (xterm.js).
- TanStack Start loaders for data; shadcn/ui for components.

## 15) Targets & Drivers

- Driver interface: `provision(startSpec) -> { endpoint, sidecarToken }`, `destroy(id)`, `status(id)`.
- MVP drivers: Docker (default), Local (dev).
- K8s later; keep interface flexible.

## 16) Security

- Secrets: Never exposed to frontend/terminal; only sealed to sidecar; injected to opencode and discarded.
- Isolation: One session per container; non-root user; minimal capabilities.
- Tokens: One-time registration token with short TTL; per-session WS tokens; rotate on resume.
- DB: Strict RLS; service role restricts key unwrap path.
- Networking: Default egress limited; no host mounts by default.

## 17) Observability & Usage

- Logs: Mirror opencode `/log` into orchestrator logs; attach to session timeline.
- Metrics: Usage events from opencode token counts; per-session runtime and storage.
- Tracing (later): Request IDs for orchestrator ↔ sidecar ↔ opencode.

## 18) Post-MVP: Tunneling & Preview

- HTTP(S) tunnel per session to expose app on `https://<session>.<domain>`.
- Orchestrator-managed subdomain routing; sidecar agent to register ports and health.
- Access control per user/session.

## 19) Implementation Milestones

1. Drizzle schema + migrations + RLS (users only).
2. Envelope encryption service + provider key CRUD.
3. Orchestrator core routes (sessions CRUD/get/stream).
4. Docker driver + sidecar image + registration handshake.
5. Sidecar boot + opencode server + event relay.
6. Model/provider switching per message; on-the-fly key injection.
7. Frontend core: auth, onboarding keys, sessions list/detail with streaming.
8. Terminal MVP: WS proxy ↔ PTY.
9. Resume flow: volume-based session JSON; artifact backup.
10. Permissions flow end-to-end.
11. Export: ZIP + GitHub push.
12. Usage display (tokens/context) and basic metering.
13. Security hardening pass.

## 20) Open Items

- Confirm opencode session JSON directory/filename contract and discovery at runtime.
- Choose PTY implementation in sidecar (ttyd vs native Bun PTY); start with ttyd for speed.
- Define exact terminal WS message schema (stdin/stdout/resize/control).
- Decide on object storage provider and artifact retention policy.
- Validate opencode event coverage for all UI elements; plan shims if gaps exist.

## 21) Opencode Integration Reference

- Server: SDK `createOpencodeServer({ hostname, port, config })`
- Client: SDK `createOpencodeClient({ baseUrl, responseStyle: "data" })`
- APIs used:
  - Sessions: list/get/create/update/init/abort/share/unshare/summarize/messages/message/prompt/command/shell/revert/unrevert/permissions
  - Files: find.text/find.files/find.symbols/file.read/file.status (later)
  - Agents: list
  - Config: get/providers
  - Auth: set
  - Events: subscribe
