Backend (Convex) – Tests and Integration

- Contract tests: `packages/backend/tests/contract/`
- Integration tests: `packages/backend/tests/integration/`
  - Shared fixtures: `tests/integration/_utils/`

Run tests
- Single test: `bun run --cwd packages/backend test:once tests/contract/convex-events.test.ts`
- All tests: `bun run --cwd packages/backend test:once`

Vitest config
- Includes `tests/integration/**/*.test.ts`
- Uses `test-utils/setup.ts` to initialize Convex modules

