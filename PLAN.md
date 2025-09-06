# OpenAgent™ Plan (MVP + Roadmap)

Last updated: 2025-09-06

## 1) Goals & Scope

- Goal: Background coding agent that runs remotely in sandboxed containers/VMs using opencode as backbone.
- MVP components: Web UI, Orchestrator (Convex), Sidecar per session (Hono + opencode server + SDK).
- Core flows: Auth → onboarding (BYOK or managed) → start session → stream output → run shell/file ops → permissions → export code → stop/resume.

## 2) Architecture

- Frontend (Web UI): TanStack Start + React + shadcn/ui, xterm.js terminal, streaming session view, provider/model switcher, slash commands, subagents UI, permissions prompts.
- Orchestrator (Backend): Convex. Multi-tenant via Convex Auth, server-only mutations/actions, drivers orchestrated via actions calling driver services, secure key provisioning, event fanout (HTTP SSE/WS), usage collection.
- Sidecar (Per-session): Hono with hono/client types. Starts opencode server (SDK), handles secure key injection, bridges events, exposes Agent Control API, PTY terminal server, maintains opencode session JSON persistence.

## 3) Key Decisions

- Session identity: Orchestrator session ID equals opencode session ID (1:1).
- Resume source: Persist only opencode session JSON (no workspace FS). Users export code via GitHub push or ZIP.
- Users only: No organizations in MVP; access enforced in Convex mutations/actions by `userId`.
- Token/context: Rely on opencode for usage and context; display in UI.
- Model/provider switching: Change provider/model per message; keys injected on demand.
- Opencode features: Support slash commands, subagents, and stream all opencode events to UI.

## 4) Data Model (Convex)

- users: id, email, createdAt
- sessions: id (= opencode id), userId, title, status (creating|active|idle|stopped|error), currentInstanceId?, lastActivityAt, createdAt, updatedAt
- instances: id, sessionId, driver (docker|k8s|local), state (provisioning|running|terminated|error), endpointInternal, registeredAt, terminatedAt, sessionJsonPath
- providerKeys: id, userId, provider, encryptedKey, encryptedDataKey, keyVersion, createdAt, lastUsedAt?
- pendingPermissions: id, sessionId, permissionId (opencode), payload, createdAt, resolvedAt?, response?
- usageEvents: id, sessionId, userId, type (tokens|runtime|storage), quantity, meta, createdAt
- sessionArtifacts: id, sessionId, type ('session_json'|'zip'|'git'), urlOrPath, createdAt
- Indexes (Convex): sessions by userId+createdAt desc; instances by sessionId; pendingPermissions by sessionId+createdAt; usageEvents by sessionId+createdAt.

## 5) Auth & Access (Convex)

- Enforce per-user access in mutations/queries using Convex auth identity.
- Service actions perform key unwrap and driver calls; never expose secrets to the client.
- No RLS; all checks happen in server code; documents include `userId`.

## 6) Session Lifecycle

1. Create

- `sessions.create` mutation inserts session doc (status=creating).
- Provision target via driver from a Convex action; allocate per-session volume for `opencode/sessions/` only.
- Sidecar starts, registers to orchestrator with reg token + ephemeral pubkey.
- Orchestrator action envelope-decrypts provider keys; re-encrypts to sidecar ephemeral key; returns sealed bundle.
- Sidecar sets keys via opencode `/auth/:provider`; creates or verifies opencode session; confirm session id matches.
- Mark session active; attach event streams.

2. Active

- Events bridged to orchestrator SSE/WS.
- Minimal indices (messages metadata, permissions, usage) persisted for lists and UX.

3. Stop/Idle

- Tear down instance on TTL or request.
- Ensure session JSON persisted on volume; optionally upload session JSON to object storage; record `sessionArtifacts`.

4. Resume

- If no instance: provision and mount same volume; start opencode; ensure session exists from JSON; no message replay required.
- If volume unavailable: restore session JSON from `sessionArtifacts` backup. Message replay not required if JSON is sufficient.

## 7) Persistence & Export

- Persist: opencode session JSON only (path recorded in `instances.sessionJsonPath` and `sessionArtifacts`).
- Code export:
  - ZIP: orchestrator endpoint streams a snapshot.
  - GitHub: push to user’s repo/branch with user-provided token.
- Optional: background upload of session JSON to S3-compatible storage for resilience.

## 8) Orchestrator API (Convex)

- queries:
  - `sessions.list()` → list sessions for current user
  - `sessions.get({ id })` → session details
  - `events.list({ sessionId, cursor? })` → paginated live events (use Live Queries)
  - `permissions.list({ sessionId })` → pending list
  - `agents.list()` → opencode agents
  - `config.providers()` → providers/default models
- mutations:
  - `sessions.create({ title?, target? })` → { id, status }
  - `sessions.delete({ id })` → stop and cleanup
  - `permissions.respond({ sessionId, permissionId, response })`
  - `keys.upsert({ provider, keyOrManaged })` (server-only)
- actions:
  - `sessions.resume({ id })`
  - `sessions.prompt({ id, model?, parts })`
  - `sessions.command({ id, command, args? })`
  - `sessions.shell({ id, command, cwd? })`
  - `terminal.issueToken({ sessionId })` → ephemeral WS token for PTY bridge
  - `export.zip({ id })`
  - `export.github({ id, repo, branch, token })`

UI calls these via Convex client for full type-safety and reactivity.

## 9) Sidecar (Internal API/Behavior)

- Bootstrap:
  - Generate ephemeral X25519 keypair.
  - POST `/internal/register` { sessionID, regToken, pubKey }.
  - Receive sealed provider keys + sidecarAuthToken.
  - Decrypt in-memory; set opencode `PUT /auth/:id`; zero buffers.
- Hono server with hono/client for typed Agent Control endpoints.
- Start opencode server using SDK `createOpencodeServer`.
- Create/verify session via SDK; attach events `event.subscribe()`.
- Expose Agent Control endpoints for orchestrator calls: message, command, shell, permissions.
- PTY server (WebSocket) for terminal; spawn non-root shell; idle timeout; resize.

## 10) Provider Keys (Encryption & Provisioning)

- Storage: Envelope encryption.
  - Generate random data key (DK).
  - Encrypt provider key with DK (AES-256-GCM).
  - Encrypt DK with master key (`OPENAGENT_MASTER_KEY` or KMS).
  - Store ciphertexts + nonces + key_version.
- Provisioning:
  - Orchestrator action decrypts DK with master, decrypts provider key, re-encrypts with sidecar ephemeral pubkey (sealed box).
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

- Frontend: xterm.js uses `terminal.issueToken` action then connects to sidecar PTY WS with token.
- Orchestrator: Authenticates session and token; proxies or authorizes WS frames to sidecar PTY.
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
- Invoked via Convex actions calling a driver service.
- MVP drivers: Docker (default), Local (dev).
- K8s later; keep interface flexible.

## 16) Security

- Secrets: Never exposed to frontend/terminal; only sealed to sidecar; injected to opencode and discarded.
- Isolation: One session per container; non-root user; minimal capabilities.
- Tokens: One-time registration token with short TTL; per-session WS tokens; rotate on resume.
- Convex: Key unwrap path only in server actions; document-level checks.

## 17) Observability & Usage

- Logs: Mirror opencode `/log` into orchestrator logs; attach to session timeline.
- Metrics: Usage events from opencode token counts; per-session runtime and storage.
- Tracing (later): Request IDs for orchestrator ↔ sidecar ↔ opencode.

## 18) Post-MVP: Tunneling & Preview

- HTTP(S) tunnel per session to expose app on `https://<session>.<domain>`.
- Orchestrator-managed subdomain routing; sidecar agent to register ports and health.
- Access control per user/session.

## 19) Implementation Milestones

1. Convex schema, auth, and indexes (users, sessions, instances, keys, permissions, usage, artifacts).
2. Envelope encryption service in Convex actions + provider key CRUD.
3. Orchestrator Convex functions: queries/mutations/actions (sessions, events, permissions, keys).
4. Sidecar scaffold with Hono + hono/client types; Agent Control endpoints.
5. Driver service + Convex action integration; sidecar registration handshake.
6. Sidecar boot + opencode server + event relay.
7. Frontend core: auth, onboarding keys, sessions list/detail with streaming.
8. Terminal MVP: WS proxy ↔ PTY.
9. Resume flow: volume-based session JSON; artifact backup.
10. Permissions flow end-to-end.
11. Export: ZIP + GitHub push.
12. Usage display (tokens/context) and basic metering.
13. Security hardening pass.

## 20) Open Items

- Validate Hono + hono/client for sidecar; compare Fastify/itty-router if needed.
- Choose PTY implementation in sidecar (node-pty vs ttyd); start with node-pty.
- Define exact terminal WS message schema (stdin/stdout/resize/control).
- Decide on object storage provider and artifact retention policy.
- Confirm Convex HTTP SSE support patterns and limits for streaming; adjust if needed.
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
