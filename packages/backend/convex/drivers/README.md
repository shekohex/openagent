# Drivers Scaffold

This directory contains driver implementation files referenced by tasks T028–T031.

Path clarification: Although early plan docs referenced `convex/drivers/*` at the repo root, the actual backend path in this repository is `packages/backend/convex/`. Tasks and path conventions allow both; we standardize on this location.

Planned files:

- `docker.ts` — Docker driver (implements `ContainerDriver` from `@openagent/driver-interface`).
- `docker-volumes.ts` — Volume management helpers.
- `docker-network.ts` — Network isolation helpers.
- `docker-health.ts` — Driver health metrics and checks.

These files are currently placeholders and intentionally contain no executable code to keep type-checking green until the tests for these tasks are in place.

