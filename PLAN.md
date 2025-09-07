# OpenAgent™ Plan (MVP + Roadmap)

Last updated: 2025-09-07

## 1) Goals & Scope

- Goal: Background coding agent that runs remotely in sandboxed containers/VMs using opencode as backbone.
- MVP components: Web UI, Orchestrator (Convex), Sidecar per session (Hono + opencode server + SDK).
- Core flows: Auth → onboarding (BYOK or managed) → start session → stream output → run shell/file ops → permissions → export code → stop/resume.

## 2) Architecture

- Frontend (Web UI): TanStack Start + React + shadcn/ui, xterm.js terminal, streaming session view, provider/model switcher, slash commands, subagents UI, permissions prompts.
- Orchestrator (Backend): Convex. Multi-tenant via Convex Auth, server-only mutations/actions, drivers orchestrated via actions calling driver services, secure key provisioning, event fanout (HTTP SSE/WS), usage collection.
 - Orchestrator (Backend): Convex. Multi-tenant via Convex Auth, server-only mutations/actions, drivers orchestrated via actions calling driver services, secure key provisioning, event fanout (HTTP SSE/WS), usage collection. Maintains a per-user, per-session in-memory registry of `createOpencodeClient` instances that connect directly to the sidecar's OpenCode server for typed requests and SSE streaming.
- Sidecar (Per-session): Thin wrapper around the OpenCode SDK server. Hono with hono/client types. Handles orchestrator auth + handshake, receives an orchestrator-assigned listen port via registration payload, starts OpenCode server bound to that port and to `0.0.0.0` inside the container, bridges events, exposes Agent Control API, PTY terminal server, and maintains OpenCode session JSON persistence.

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
- instances: id, sessionId, driver (docker|k8s|local), state (provisioning|running|terminated|error), endpointInternal, listenPort, bindAddress, registeredAt, terminatedAt, sessionJsonPath
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
- Orchestrator selects an available listen port (from an allowed range) and includes it in the registration payload (`opencodeListenPort`). For Docker/K8s/local the driver can also inject `OPENCODE_PORT` env for observability, but the registration payload is the source of truth.
- Sidecar starts, registers to orchestrator with reg token + ephemeral pubkey, and acknowledges the assigned port and bind address (default `0.0.0.0`).
- Orchestrator action envelope-decrypts provider keys; re-encrypts to sidecar ephemeral key; returns sealed bundle.
- Sidecar starts OpenCode server using SDK on the assigned port and `hostname: "0.0.0.0"` (container-internal); sets keys via `/auth/:provider`; creates or verifies OpenCode session; confirms session id matches.
- Sidecar announces readiness back to the orchestrator including `{ listenPort, baseUrlInternal }`; orchestrator records in `instances`.
- Mark session active; attach event streams.

Client registry (orchestrator)

- Construct `baseUrl` from driver-resolved endpoint + `listenPort`.
- Create and cache a typed `createOpencodeClient({ baseUrl, responseStyle: "data" })` keyed by `userId+sessionId`.
- Open and hold SSE subscription to `/event` for live updates; backoff and resume on disconnects.
- On orchestrator restart, rehydrate clients by scanning `instances` in state `running` and re-open SSE streams.

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
- Thin wrapper: Do not replace OpenCode server; run it in-process and expose only a minimal control plane.
- Port assignment: Accept orchestrator-assigned port (registration payload is canonical; `OPENCODE_PORT` env optional) and bind OpenCode server to it. For Docker/K8s/local, orchestrator/driver ensures port mapping as needed.
- Expose Agent Control endpoints for orchestrator calls: message, command, shell, permissions.
- PTY server (WebSocket) for terminal; spawn non-root shell; idle timeout; resize.

- Readiness/health:
  - `/internal/ready` after OpenCode server is listening.
  - `/internal/healthz` basic liveness endpoint.

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

Direct typed client path

- Orchestrator uses typed SDK client directly against the sidecar's OpenCode server. This preserves type-safety and simplifies request/response handling.
- UI never connects directly to sidecars; it streams via orchestrator for auth, tenancy, and fanout.

Networking/Connection model (MVP)

- Orchestrator chooses the port; sidecar binds OpenCode server to it and reports readiness.
- Creator/operator connects via orchestrator-authorized paths:
  - Control plane (messages/permissions): orchestrator actions → sidecar control endpoints.
  - Terminal: orchestrator issues ephemeral WS token (see §13) and proxies/authorizes WS to sidecar PTY.
- For MVP assume no firewall between orchestrator and sidecar; no VPN/tunnel required.

Notes from OpenCode docs

- SDK server: `createOpencodeServer({ hostname, port, config })`; default hostname is `127.0.0.1`. We must set `hostname: "0.0.0.0"` in containers.
- Events: SSE stream at `/event` emits `server.connected` then bus events; we bridge these to orchestrator.
- Auth: provider credentials set via `PUT /auth/:id`.

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

Driver startSpec additions

- `listenPort`: number selected by orchestrator; driver must expose/bind container port to host/network as appropriate.
- `portRangePolicy`: optional policy string or range to aid schedulers (future).

Endpoint resolution per driver

- Docker (same host/network): publish `listenPort` to host and return `{ endpointInternal: 127.0.0.1, publishedPort }` when orchestrator is co-located; otherwise return host IP/FQDN reachable by orchestrator.
- Kubernetes: if orchestrator runs in-cluster, return ClusterIP+port; if external, use NodePort/LoadBalancer per policy. Avoid public exposure where possible; restrict via NetworkPolicy/ingress ACLs.
- VM/Bare metal: return configured IP/FQDN with firewall rule for `listenPort`. Ensure security groups allow orchestrator source IPs only.
- If none is reachable (NAT/firewall), fall back to post‑MVP connectivity strategies (see §22).

## 16) Security

- Secrets: Never exposed to frontend/terminal; only sealed to sidecar; injected to opencode and discarded.
- Isolation: One session per container; non-root user; minimal capabilities.
- Tokens: One-time registration token with short TTL; per-session WS tokens; rotate on resume.
- Convex: Key unwrap path only in server actions; document-level checks.
- Ports: Orchestrator selects from an allowed ephemeral range; sidecar must not self-select ports. Validate and refuse out-of-range values. Prevent collisions via driver-level reservation.
- Bind address: Default bind to `0.0.0.0` inside container; never bind to public interfaces directly on hosts unless driver policy allows.

## 17) Observability & Usage

- Logs: Mirror opencode `/log` into orchestrator logs; attach to session timeline.
- Metrics: Usage events from opencode token counts; per-session runtime and storage.
- Tracing (later): Request IDs for orchestrator ↔ sidecar ↔ opencode.

## 18) Post-MVP: Tunneling & Preview

- HTTP(S) tunnel per session to expose app on `https://<session>.<domain>`.
- Orchestrator-managed subdomain routing; sidecar agent to register ports and health.
- Access control per user/session.
- NAT/Firewall traversal: If operator and sidecar are on different networks or behind firewalls, support VPN (WireGuard/Tailscale) or managed reverse tunnels. Track in GitHub issue #34.
  - WireGuard/Tailscale: Overlay network with stable private IPs; solves blocked inbound ports/NAT. Requires key distribution, ACLs, and host agent. Likely overkill for MVP but suitable for remote deployments.
  - Reverse tunnel (WS/HTTP): Maintain outbound, long‑lived connection from sidecar to orchestrator; multiplex control and SSE/WS over it. Avoids opening inbound ports; more app work but simpler ops than VPN.
  - K8s ingress: Use cluster Service/Ingress for in‑cluster sidecars; not applicable to arbitrary remote hosts.

## 19) Implementation Milestones

1. Convex schema, auth, and indexes (users, sessions, instances, keys, permissions, usage, artifacts).
2. Envelope encryption service in Convex actions + provider key CRUD.
3. Orchestrator Convex functions: queries/mutations/actions (sessions, events, permissions, keys).
4. Sidecar scaffold with Hono + hono/client types; Agent Control endpoints.
5. Driver service + Convex action integration; sidecar registration handshake.
6. Sidecar boot + OpenCode server on orchestrator-assigned port + event relay.
6a. Handshake: registration payload carries `opencodeListenPort`; sidecar binds to `0.0.0.0:port` and reports readiness.
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
- Decide direct vs proxy connection for operator access to OpenCode server; for MVP use orchestrator-mediated paths only.
- Define port selection strategy, allowed range, and collision handling in drivers.
- Specify readiness/health endpoints and incorporate in provisioning checks.
- Decide env vs registration payload for port injection; prefer env `OPENCODE_PORT` for simplicity.
  - Update: Registration payload is canonical; env is optional for observability.

Related GitHub issues to align

- #4 Build Sidecar service with Hono framework
- #5 Integrate OpenCode SDK and server in Sidecar
- #6 Implement Docker driver for container provisioning
- #7 Create session lifecycle management system
- #8 Build Orchestrator API with Convex functions
- #11 Implement event streaming system (SSE/WebSocket)
- #12 Create terminal integration with xterm.js
- #30 Implement WebSocket authentication and token management
- #34 Implement HTTP tunneling for preview functionality (post-MVP)

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

Notes

- The sidecar passes the orchestrator-assigned port into `createOpencodeServer({ hostname: "0.0.0.0", port })` and reports readiness with `baseUrlInternal` for orchestrator awareness.
- Remote hosts and firewalls: For MVP, assume reachable network. For remote/locked‑down hosts, plan either VPN (WireGuard/Tailscale) or reverse tunnel (outbound WS) to avoid inbound port exposure.

## 22) Connectivity Strategy (MVP vs Remote)

MVP (no firewall/NAT between orchestrator and sidecar)

- Orchestrator chooses `opencodeListenPort` and sends in registration payload.
- Sidecar binds OpenCode to `0.0.0.0:port` (container) and exposes only inside its network namespace; orchestrator reaches sidecar via driver-provided endpoint.
- All operator traffic goes through orchestrator → sidecar control plane and PTY proxy; OpenCode server is not directly exposed to the Internet.
 - Orchestrator connects directly to sidecar OpenCode server using the typed SDK client and SSE; baseUrl resolved per driver.

Remote/Firewall scenarios (post-MVP options)

- VPN overlay (WireGuard or Tailscale)
  - Pros: Strong security, stable private addressing, transparent L3 connectivity across NAT/firewalls.
  - Cons: Operational overhead (key distribution/rotation, ACLs, agent lifecycle), infra ownership. Overkill for MVP; appropriate for managed remote deployments.
- Reverse tunnel (application-level)
  - Maintain an outbound WebSocket(s) from sidecar to orchestrator for control and event streams.
  - Pros: NAT friendly, minimal ops; avoids exposing ports. Cons: Requires multiplexing and backpressure handling in app.
- Platform ingress (K8s/Cloud)
  - Use Service/Ingress/LoadBalancer for in-cluster sidecars. Not applicable to arbitrary remote Docker hosts.

Recommendation

- MVP: keep orchestrator‑mediated connections, no VPN/tunnel; registration payload carries the port.
- Post‑MVP: implement reverse tunnel first (lower ops cost), then evaluate WireGuard/Tailscale for fleet/enterprise remote deployments.
 - Maintain the direct typed SDK client model in all cases; tunnels/VPNs should present a stable HTTP endpoint so `createOpencodeClient` continues to work unchanged.
