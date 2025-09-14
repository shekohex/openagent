# T005 Fix Plan — Make Crypto Tests & Lints Green After Move

Status: Draft • Owner: you • Scope: test relocation + config only (no code changes)

Goal: Move unit tests for the crypto utilities into `@openagent/crypto-lib` and get `bun run test` and `bun check` passing consistently across the monorepo.

Important: This plan avoids code changes to implementation. Only file moves and config tweaks are included.

---

## 0) Scope Check (confirm before starting)

- Intention is to move only unit tests tied to the crypto library logic:
  - Move: `packages/backend/lib/crypto.test.ts`
  - Move: `packages/backend/lib/keyExchange.test.ts`
- Keep Convex integration tests in backend (e.g., `packages/backend/convex/providerKeys.test.ts`). These exercise DB, Convex runtime, and app glue — not pure library concerns. If you want to move them too, see Appendix A.

---

## 1) Relocate Tests Into Library

- Create destination folders:
  - `mkdir -p packages/crypto-lib/tests/unit`
- Move the files:
  - `git mv packages/backend/lib/crypto.test.ts packages/crypto-lib/tests/unit/crypto.test.ts`
  - `git mv packages/backend/lib/keyExchange.test.ts packages/crypto-lib/tests/unit/keyExchange.test.ts`

Acceptance: No remaining `*.test.ts` under `packages/backend/lib/`.

---

## 2) Adjust Test Imports (avoid requiring a build)

- Inside both moved test files, change imports from the published package name to local sources so tests don’t depend on a prior build:
  - Replace: `from "@openagent/crypto-lib"` → `from "../src"` (or `../src/crypto`, `../src/keyExchange` as appropriate).
  - Remove any leftover relative imports that still point to `./crypto` or `./keyExchange` (old backend paths) and switch to `../src/...`.

Acceptance: Grep shows no `@openagent/crypto-lib` import inside test files in `packages/crypto-lib/tests`.

---

## 3) Add Vitest Config for Library (Web APIs + WebCrypto)

- Create `packages/crypto-lib/vitest.config.mts` with an environment that provides `atob`, `btoa`, and `crypto.subtle`:
  - Use the same environment as backend: `environment: "edge-runtime"`.
  - Minimal config is fine; no setup files needed for the unit tests.
- Add dev dependency in the library:
  - `bun add -w @openagent/crypto-lib -D @edge-runtime/vm`

Acceptance: Running `bun run -w @openagent/crypto-lib test` starts without environment errors.

---

## 4) Ensure Turbo Watches Library Tests

- Update `turbo.json` to include `tests/**` in the `test.inputs` list:
  - Add `"tests/**"` alongside `"test/**"`.

Acceptance: Changing files under `packages/crypto-lib/tests/**` invalidates the test task cache and re-runs tests.

---

## 5) Verify Package-Level Tests First

- Run only library tests:
  - `bun run -w @openagent/crypto-lib test`
- Common issues and fixes (no code changes to implementation):
  - Module resolution complaints → double-check import paths point to `../src`.
  - Missing Web APIs → confirm Step 3 config and dev dep are present.

Acceptance: `@openagent/crypto-lib` test run passes locally.

---

## 6) Run Full Workspace Tests

- At repo root:
  - `bun run test`
- Expected behavior:
  - Library unit tests pass.
  - Backend Convex tests still pass (provider keys, etc.).

Acceptance: All tests green across the workspace.

---

## 7) Lint & Format Pass

- Run Biome + Ultracite:
  - `bun check` (auto-fixes enabled per root script)
  - If anything remains, run `bun ultracite fix`.
- Notes:
  - `biome.json` already excludes `**/*.test.ts`, so unit test files won’t be linted.
  - If lint still reports issues in library sources, review rule messages; adjust formatting only (no logic changes).

Acceptance: `bun check` exits clean. No outstanding diagnostics.

---

## 8) Commit & Sanity Checks

- Commit messages (conventional):
  - `test(crypto-lib): move unit tests into library`
  - `chore(crypto-lib): add vitest edge-runtime config`
  - `chore: update turbo to watch tests dir`
- Optional: run `bun build` to ensure types emit for the library.

Acceptance: CI (if any) passes for test and lint jobs.

---

## Appendix A — If You Want To Move Convex Integration Tests Too

Moving `packages/backend/convex/providerKeys.test.ts` into the library is possible, but increases coupling. If you decide to proceed:

1) Copy backend test utilities that set up Convex:
- Bring `packages/backend/test-utils/{setup.ts,utils.ts}` into `packages/crypto-lib/tests/_convex/` (or create a shared test-utils package).
- Update paths inside the copied files.

2) Add `convex`, `convex-test`, and related dev deps to `@openagent/crypto-lib`.

3) Extend `vitest.config.mts` in the library to include `setupFiles` and any Convex inline deps similar to backend config.

4) Wire import.meta.glob to the correct Convex functions if needed, or refactor to use a shared loader.

5) Run library tests again and fix only config/import paths; do not change implementation code.

Consider leaving Convex tests in backend to keep the crypto library lightweight and focused.

---

## Quick Checklist

- [ ] Move unit tests into `packages/crypto-lib/tests/unit`
- [ ] Update test imports to `../src`
- [ ] Add `vitest.config.mts` with `environment: "edge-runtime"`
- [ ] Add `@edge-runtime/vm` as a dev dependency
- [ ] Update `turbo.json` test inputs to include `tests/**`
- [ ] Run `bun run -w @openagent/crypto-lib test` and fix config only
- [ ] Run `bun run test` at root; confirm all green
- [ ] Run `bun check` and `bun ultracite fix`; confirm clean

---

## Success Criteria

- All unit tests in `@openagent/crypto-lib` pass locally.
- Backend Convex tests still pass unchanged.
- `bun check` reports no remaining issues.
- No implementation code modifications were required.

