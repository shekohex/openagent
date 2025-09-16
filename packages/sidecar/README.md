To install dependencies:
```sh
bun install
```

To run:
```sh
bun run dev
```

open http://localhost:3000

Integration tests
- Sidecar-focused specs live in `tests/integration/`
- Reuse backend Convex modules via `tests/setup.integration.ts`
- Configured by `vitest.integration.config.ts` (edge-runtime, 60s timeout)
