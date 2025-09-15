# Plan: Contract Tests for T009–T013 (Sidecar + Convex)

Date: 2025-09-14
Owner: OpenAgent Core
Scope: Implement and run contract tests for tasks T009–T013 in Phase 3.2 (Tests First), targeting Sidecar internal endpoints and Convex actions. Tests should compile, run under Bun/Vitest, and fail initially (RED) until implementations land in Phase 3.3.

---

**Objectives**

- Establish robust, deterministic contract tests for:
  - T009: PUT /internal/update-keys (Sidecar)
  - T010: POST /internal/shutdown (Sidecar)
  - T011: action sessions.provision (Convex)
  - T012: action sessions.resume (Convex)
  - T013: action export.zip (Convex)
- Enforce API shapes, auth semantics, and critical side-effects where applicable.
- Ensure tests align with monorepo tooling: Bun, Vitest, Turbo, Convex Test Harness.

---

**Prerequisites**

- Bun installed; run `bun install` at repo root.
- Backend Convex dev setup completed: `bun run dev:setup`.
- Verify sidecar workspace exists (from T001/T002). If missing, add a minimal scaffold in a separate PR to unblock test compilation.
- Contracts source of truth:
  - `.specify/specs/001-initial-mvp-implementation/contracts/sidecar-api.ts`
  - `.specify/specs/001-initial-mvp-implementation/contracts/convex-api.ts`

---

**Directory Layout**

- Convex contract tests (reuse backend Vitest config):
  - `packages/backend/tests/contract/convex-provision.test.ts` (T011)
  - `packages/backend/tests/contract/convex-resume.test.ts` (T012)
  - `packages/backend/tests/contract/convex-export.test.ts` (T013)
- Sidecar contract tests (pending sidecar workspace):
  - `apps/sidecar/tests/contract/sidecar-update-keys.test.ts` (T009)
  - `apps/sidecar/tests/contract/sidecar-shutdown.test.ts` (T010)

Note: The original tasks.md lists `tests/contract/...` at repo root. To ensure tests execute under Turbo and use the correct Vitest configs, place tests in their owning workspace packages as above.

---

**Test Harnesses**

- Convex: Use existing `packages/backend/test-utils/createConvexTest()` + `convex-test` with Edge runtime. Seed minimal data per test via `t.run()`.
- Sidecar: Add a tiny test helper later (once `apps/sidecar` exists):
  - `apps/sidecar/tests/_utils/sidecarTestHarness.ts` exporting `createInMemoryApp()` that returns a Hono app instance for supertest/fetch injection.
  - Before T019 is implemented, `createInMemoryApp()` throws a descriptive NotImplemented error, keeping tests RED but compiling.

---

**Acceptance Criteria (Per Task)**

- T009 sidecar-update-keys
  - Requires `Authorization: Bearer <token>`; 401 if missing/invalid.
  - Accepts body `{ encryptedProviderKeys: [{ provider, encryptedKey, nonce }] }` where all fields are non-empty strings; 400 on schema violation or duplicate providers.
  - On success → status 200, JSON `{ updated: true, providers: [provider,...] }`.
  - Security: no key material echoed back; providers list contains unique values only.

- T010 sidecar-shutdown
  - Requires `Authorization: Bearer <token>`; 401 if missing/invalid.
  - Accepts optional `{ gracePeriodMs?: number }`; 400 if negative or NaN.
  - Responds 202 with `{ shuttingDown: true }` and schedules shutdown; verify graceful path via emitted event or timer hook (mock clock).

- T011 sessions.provision (Convex action)
  - Input: `{ sessionId: Id<"sessions">, driver: "docker" | "local" }`.
  - Returns 200 shape `{ instanceId: Id<"instances">, endpoint: string }`.
  - Side-effects: creates `instances` row; may call internal `instances.updateState` to running. Verify via `t.run(ctx => ctx.db.get(...))`.
  - Error path: invalid driver → throws with message; missing session → throws.

- T012 sessions.resume (Convex action)
  - Input: `{ id: Id<"sessions"> }`.
  - Returns `{ success: boolean, instanceId?: Id<"instances">, error?: string }`.
  - Happy path: if existing instance is terminated, ensures it’s re-provisioned or returns meaningful error depending on policy; this test asserts documented shape and that success toggles accordingly.

- T013 export.zip (Convex action)
  - Input: `{ id: Id<"sessions"> }`.
  - Returns `{ downloadUrl: string, size: number, expiresAt: number }` where `expiresAt > Date.now()`.
  - Side-effect: creates `sessionArtifacts` row of type `zip`; verify persistence.

---

**Implementation Steps (Execution Order)**

1) Convex Tests First (backend runs green in CI infra)
- Write T011, T012, T013 tests in `packages/backend/tests/contract/` using `createConvexTest(schema)`.
- Add fixtures: helper to create user, session; seed minimal rows.
- Run locally: `bun run test -F @openagent/backend` (or `bun run test` at root to via Turbo).
- Expect RED until actions land in Phase 3.3.

2) Sidecar Test Scaffolds
- Create `apps/sidecar/tests/_utils/sidecarTestHarness.ts` with `createInMemoryApp()` that currently throws `NotImplementedError` with guidance to implement `apps/sidecar/src/server.ts`.
- Author T009/T010 tests against `createInMemoryApp()` using `supertest`-style fetch injection or Hono’s `app.request()`.
- Add sidecar package `package.json` test script using Vitest; ensure Turbo picks it up.
- Run: `bun run test -F @openagent/sidecar`; expect RED until T019–T026.

3) CI & Quality Gates
- Ensure both packages have `"test": "bun run test:once"` and Vitest config (backend already present).
- Update root `turbo.json` pipeline if needed so `test` includes `apps/*`.
- Add coverage thresholds later (stretch): 85% lines for these contracts.

---

**Edge Cases**

- Sidecar auth header casing and extra spaces: normalize and test.
- Duplicate provider entries in update-keys: reject with 400.
- Shutdown called twice: second call should still return 202 idempotently.
- Convex actions with stale session IDs: expect throw with clear message.
- export.zip for empty sessions: size may be 0 but must still produce a valid URL and artifact row.

---

**Security & A11y Notes**

- Never log secrets in tests. Use deterministic fake values.
- For sidecar, assert no sensitive fields leak into responses (no keys, nonces fine as inputs only).
- Web a11y not applicable to these server-side tests, but keep frontend a11y checklist for later phases.

---

**Commands (Bun-first)**

- Install: `bun install`
- Setup Convex: `bun run dev:setup`
- Backend tests: `bun run test -F @openagent/backend`
- Sidecar tests (once package exists): `bun run test -F @openagent/sidecar`

---

**Definition of Done**

- Test files for T009–T013 exist in the specified locations with clear Arrange/Act/Assert sections.
- Tests compile under Bun/Vitest and fail with informative messages prior to implementation.
- CI runs `turbo test` across workspaces and reports these tests.
- Contracts validated against shapes in the design docs; side-effects verified where applicable.

---

**Risks & Mitigations**

- Sidecar package missing → Mitigation: create minimal workspace and test harness stub in a small enabling PR.
- Monorepo resolution issues for cross-package imports → Mitigation: use workspace-relative imports and avoid reaching across package boundaries in tests.
- Flaky time-based assertions (shutdown, expiresAt) → Mitigation: use Vitest fake timers and assert relative bounds.

---

**Next PRs (Thin, Sequential)**

- PR A: Add test scaffolds for T011–T013 (backend only) → RED.
- PR B: Add sidecar workspace skeleton + test harness + T009/T010 tests → RED.
- PR C: Implement sessions.provision/resume/export to turn backend tests GREEN.
- PR D: Implement sidecar internal routes to turn sidecar tests GREEN.

