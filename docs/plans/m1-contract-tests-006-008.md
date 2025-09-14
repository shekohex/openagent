## Milestone 1 — Contract Tests: Sidecar Internal Endpoints (T006–T008)

Outcome: Three rock-solid contract tests validating Sidecar’s internal API under packages/sidecar/src/routes/internal.ts. Tests codify behavior and JSON contracts to prevent regressions and accelerate later M2 work.

Scope

- T006: POST /internal/register → 501 Not Implemented, stable error envelope
- T007: GET /internal/health → 200 OK, stable status payload
- T008: GET /internal/ready → 200 OK, stable readiness payload

Non‑Goals

- Implementing registration (T021) or key generation (T020)
- Running a real HTTP server; tests call the Hono app in-memory

---

## Preconditions

- Bun installed (repo uses bun@1.2.21)
- Repo bootstrapped: `bun install`
- Sidecar lives under `packages/sidecar` (not `apps/sidecar`)

---

## Test Harness (Sidecar-local, using hono/testing)

We keep tests inside the Sidecar package for proximity, simpler DX, and faster iteration, and we use hono/testing’s `testClient` to exercise routes in-memory See https://hono.dev/docs/helpers/testing (use firecrwal to fetch details).

Runner

- Use Vitest (consistent with `@openagent/crypto-lib`), invoked via `bun run test`.

Changes in `packages/sidecar/package.json`

- scripts:
  - `"test": "bun run test:once"`
  - `"test:once": "vitest run"`
  - `"check-types": "tsc --noEmit"` (already present)
- devDependencies: add `vitest`, `@types/node`, `@types/bun` (if missing)

---

## API Contracts (from spec/plan and current route schemas)

1. GET /internal/health → 200 OK, JSON

   - Shape: `{ status: string; timestamp: string }`
   - Current impl returns `{ status: "ok", timestamp: ISO8601 }`

2. GET /internal/ready → 200 OK, JSON

   - Shape: `{ status: string; ready: boolean; timestamp: string }`
   - Current impl returns `{ status: "ok", ready: true, timestamp: ISO8601 }`

3. POST /internal/register → 501 Not Implemented, JSON
   - Shape: `{ success: false; error: { code: string; message: string } }`
   - Current impl returns `{ success: false, error: { code: "NOT_IMPLEMENTED", message: string } }`

Headers (all)

- `content-type` includes `application/json`

---

## File Layout (tests live inside Sidecar)

```
packages/sidecar/
  tests/
    contract/
      _utils/
        client.ts          # wraps hono/testing testClient
        matchers.ts        # tiny ISO‑8601 validator
      sidecar-health.test.ts   # T007
      sidecar-ready.test.ts    # T008
      sidecar-register.test.ts # T006
```

---

## Test Cases (executable intent)

T007 — sidecar-health.test.ts

- 200 response: `status === "ok"`
- `timestamp` is ISO 8601
- `content-type` contains `application/json`

T008 — sidecar-ready.test.ts

- 200 response: `status === "ok"`, `ready === true`
- `timestamp` is ISO 8601
- `content-type` contains `application/json`

T006 — sidecar-register.test.ts

- 501 response
- Body: `success === false`, `error.code === "NOT_IMPLEMENTED"`, `error.message` present
- `content-type` contains `application/json`

Testing style

- Use `node:assert/strict`
- Do not use `console`
- Prefer explicit assertions; no fragile snapshots

---

## Step‑by‑Step Plan

1. Enable tests in Sidecar

   - Update `packages/sidecar/package.json` scripts to run Vitest via `bun run test` (see above).
   - Ensure devDependencies include `vitest`, `@types/node`, `@types/bun`.

2. Utilities (hono/testing)

   - `packages/sidecar/tests/contract/_utils/client.ts`:
     - `import app from "../../src/index"`
     - `import { testClient } from "hono/testing"`
     - `export const client = testClient(app)`
   - `packages/sidecar/tests/contract/_utils/matchers.ts` with `isISO8601()` utility.

3. Write tests (T006–T008)

   - `sidecar-health.test.ts`: assertions listed above
   - `sidecar-ready.test.ts`: assertions listed above
   - `sidecar-register.test.ts`: assertions listed above

4. Run locally

   - From repo root: `bun run test` (Turbo → Sidecar test script)
   - Or from Sidecar: `bun -C packages/sidecar run test`

5. CI/readiness

   - Turbo already includes `tests/**` in inputs; no server boot required.

6. Commit
   - `test(sidecar): add internal API contract tests with hono/testing (T006–T008)`

---

## Skeletons (for reference while implementing)

packages/sidecar/tests/contract/\_utils/client.ts

```ts
import { testClient } from "hono/testing";
import app from "../../src/index";

export const client = testClient(app);
```

packages/sidecar/tests/contract/\_utils/matchers.ts

```ts
export const isISO8601 = (s: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s);
```

packages/sidecar/tests/contract/sidecar-health.test.ts (T007)

```ts
import assert from "node:assert/strict";
import { client } from "./_utils/client";
import { isISO8601 } from "./_utils/matchers";

test("GET /internal/health returns 200 with expected shape", async () => {
  const res = await client.request("/internal/health");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/i);
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(typeof body.timestamp, "string");
  assert.ok(isISO8601(body.timestamp));
});
```

packages/sidecar/tests/contract/sidecar-ready.test.ts (T008)

```ts
import assert from "node:assert/strict";
import { client } from "./_utils/client";
import { isISO8601 } from "./_utils/matchers";

test("GET /internal/ready returns 200 with expected shape", async () => {
  const res = await client.request("/internal/ready");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/i);
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.ready, true);
  assert.ok(isISO8601(body.timestamp));
});
```

packages/sidecar/tests/contract/sidecar-register.test.ts (T006)

```ts
import assert from "node:assert/strict";
import { client } from "./_utils/client";

test("POST /internal/register returns 501 with error envelope", async () => {
  const res = await client.request("/internal/register", { method: "POST" });
  assert.equal(res.status, 501);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/i);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.error?.code, "NOT_IMPLEMENTED");
  assert.equal(typeof body.error?.message, "string");
});
```

---

## Acceptance Checklist

- Tests live under `packages/sidecar/tests/contract` and run with `bun run test`
- hono/testing `testClient` used; no real server/ports
- No `console` usage; `node:assert/strict` only
- Type‑checks clean (`bun run check-types`)
- Health/Ready return `200`, Register returns `501`
- Content‑type headers validated

---

## Next Up (after T006–T008)

- T009/T010 contract tests for remaining `/internal/*` endpoints
- Only then: T020 (X25519) and T021 (registration impl) to turn T006 from 501 → 201/200 per spec
