# T005 Plan — Create `crypto-lib` Package for Envelope Encryption

Status: In Progress • Milestone: M1: Setup & Contracts • Priority: P0

This plan aligns with the feature plan in `.specify/specs/001-initial-mvp-implementation/plan.md`, the product spec in `.specify/specs/001-initial-mvp-implementation/spec.md`, and the task list in `.specify/specs/001-initial-mvp-implementation/tasks.md`. It follows project rules (Bun-first, TypeScript best practices, testing discipline, and style constraints in `CLAUDE.md`).

## Objective

Provide a reusable TypeScript library that performs envelope encryption to protect provider API keys and other small secrets. The library exposes a minimal, well-typed API for encrypting and decrypting payloads using a symmetric Data Encryption Key (DEK) and a Key Encryption Key (KEK). For MVP, KEK is sourced from configuration (env/KMS). Future support for X25519 (sidecar handshake) is designed in but not implemented in this setup task.

## Scope & Phasing

- Scope (T005 only):
  - Scaffold `packages/crypto-lib` with code, types, errors, and docs structure.
  - Implement safe data encoders and canonicalization utilities.
  - Implement envelope data model, KEK provider interface, and env‑based KEK provider.
  - Provide non-breaking, small encryption surface using Web Crypto (AES‑GCM for data, AES‑KW for DEK wrapping). No streaming I/O in MVP.
  - Add tests scaffolding; full RED integration test for crypto flow will occur in T017.
- Out of Scope (handled later):
  - X25519 sealed‑box mode and key rotation flows (will be introduced once T020 is done).
  - KMS providers beyond a simple env provider (optional stub only).

## Requirements Mapping

- FR‑008: “System MUST encrypt and securely store provider API keys” → satisfied by AES‑GCM + envelope with KEK from configuration.
- Sidecar/driver tasks are unaffected by library scaffolding; crypto is consumed by backend and sidecar later in integration (T017).

## Design Overview

- Algorithms (MVP, reusing existing implementation):
  - Data encryption: AES‑256‑GCM (96‑bit IV, 128‑bit tag).
  - DEK protection: AES‑256‑GCM encrypts/exported DEK bytes with the master key (KEK). This matches current backend storage schema (`nonce`, `tag`, `dataKeyNonce`, `dataKeyTag`).
  - Key sizes: DEK = 256‑bit; KEK = 256‑bit (raw bytes provided via env/KMS).
  - AAD: Not used currently; can be added without schema changes later.
- Storage shape (matches Convex schema today; base64 for fields):
  - Provider key ciphertext: `encryptedKey`, `nonce`, `tag`
  - DEK ciphertext (exported DEK string): `encryptedDataKey`, `dataKeyNonce`, `dataKeyTag`
  - Metadata: `keyVersion`, `masterKeyId`
- Web Crypto usage (Bun):
  - Use global `crypto.subtle` for key generation/import/usage.
  - Avoid Node‑only `node:crypto` APIs to keep portability.
- Extensibility hooks:
  - `KEKProvider` interface supports: `env`, `kms` (stub), `x25519` (stub for future sealed‑box mode).
  - `EnvelopeV1` is versioned for future algorithm agility and rotations.

## Public API (initial)

- `EnvelopeEncryption.encryptProviderKey(plaintext: string): StoredProviderKey`
- `EnvelopeEncryption.decryptProviderKey(stored: StoredProviderKey): string`
- `getDefaultEnvelopeEncryption()` and key manager helpers
- Base64/base64url utility helpers

Notes
- Return `Uint8Array` for binary correctness. Callers can convert to string when needed.
- Accept optional `context` in options → included as AAD.

## Error Model

- `CryptoError` (base) → `InvalidEnvelopeError`, `KeyUnavailableError`, `DecryptionFailedError`, `UnsupportedAlgorithmError`.
- No thrown primitives; always `new Error(message)` per style guide.

## Package Structure

```
packages/crypto-lib/
├── src/
│   ├── index.ts              # Surface exports only (no logic)
│   ├── envelope.ts           # types, guards, versioning
│   ├── encrypt.ts            # encrypt()/decrypt() orchestration
│   ├── providers/
│   │   ├── env.ts            # Env KEK provider (AES‑KW)
│   │   ├── kms.ts            # Stubbed interface + TODOs
│   │   └── x25519.ts         # Stub for future sealed‑box
│   ├── errors.ts             # error hierarchy
│   └── util/
│       ├── b64.ts            # base64url helpers
│       └── canon.ts          # canonical JSON + AAD builder
├── tests/
│   ├── unit/
│   │   ├── b64.test.ts
│   │   └── envelope.test.ts
│   └── integration/
│       └── (covered by T017)
├── package.json
├── tsconfig.json
├── README.md
└── docs/ARCHITECTURE.md
```

Scripts (match repo norms):
- `build: tsc`
- `check-types: tsc --noEmit`
- `test: bun run test:once` (vitest)

## Implementation Details

1) KEK Provider (env)
- Import raw 32‑byte secret → `crypto.subtle.importKey('raw', ..., 'AES-KW', false, ['wrapKey','unwrapKey'])`.
- Provide `wrap(dek: CryptoKey) → ArrayBuffer` and `unwrap(wrapped: ArrayBuffer) → CryptoKey`.

2) Data Encryption
- Generate DEK: `crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, ...)`.
- IV: `crypto.getRandomValues(new Uint8Array(12))`.
- AAD: canonical JSON → `Uint8Array`.
- `encrypt`: `crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, dek, plaintext)`.

3) DEK Wrapping
- `crypto.subtle.wrapKey('raw', dek, kek, 'AES-KW')` → store as `wrapped_key`.

4) Decrypt Flow
- Unwrap DEK via KEK provider, then `crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, dek, ciphertext)`.

5) Encoding
- Use unpadded base64url for all binary fields. Provide lossless `Uint8Array` conversions.

6) Security Hygiene
- Zeroize transient buffers with `fill(0)` where practical after use.
- Validate envelope strictly (version, alg, wrap_alg, lengths, base64url chars).
- Defensive parsing: reject oversize payloads (> 64 KiB) to avoid abuse (keys are small).

## Testing Strategy (respecting plan/tasks sequencing)

- T005: reuse and run existing unit tests in `packages/backend/lib/*test.ts` by switching imports to `@openagent/crypto-lib` (done). Keep integration flow in T017.
- T017: implement full RED integration test `tests/integration/crypto-flow.test.ts` that uses this package end‑to‑end (failing until encrypt/decrypt are wired). Then GREEN with implementation.

Unit Test Cases (added now)
- base64url codec round‑trip for random buffers and edge cases.
- envelope schema guards: accept valid, reject malformed.
- `createEnvKekProvider` rejects wrong key sizes and invalid inputs.

Integration Test Cases (T017)
- `encrypt` → `decrypt` round‑trip with context AAD and tamper detection (IV, ciphertext, wrapped_key, aad).
- Backward/forward compatibility check for `version: 1`.

## Validation & Quality Gates

- Build: `bun build` (tsc via turbo) with zero TS errors.
- Lint/format: `bun check` and `bun ultracite fix` clean.
- No `any`, no enums; use `export type` and `import type`.
- Avoid Node‑specific crypto; rely on Web Crypto for portability.

## Risks & Mitigations

- Web Crypto availability in all runtimes: use Bun (required) and document Node ≥20 support if used elsewhere.
- Misconfigured KEK length: strict input validation with clear error messages.
- Future X25519 need: provide provider stub and typed options so adding sealed‑box doesn’t break API.

## Step‑By‑Step Tasks (T005)

1. Create package folder `packages/crypto-lib/` with `package.json`, `tsconfig.json`, `.gitignore`.
2. Implement `src/util/b64.ts` and `src/util/canon.ts` with unit tests.
3. Implement `src/envelope.ts` (types/guards) and tests.
4. Implement `src/providers/env.ts` with strict validation and tests.
5. Scaffold `src/encrypt.ts` with function signatures and TODOs; minimal “not implemented” to keep tests failing for integration.
6. Export public surface from `src/index.ts`.
7. Add `README.md` with usage and security notes; add `docs/ARCHITECTURE.md`.
8. Wire scripts in `package.json` (build, check-types, test). Ensure workspace discovery.
9. Run: `bun install && bun check-types && bun run test`.

## Deliverables

- New package `@openagent/crypto-lib` with typed API, tests scaffolding, and docs.
- Passing unit tests for utilities and guards; integration tests to be added in T017.

## Next (after T005)

- T017: Add failing integration test consuming this package end‑to‑end.
- Implement `encrypt` and `decrypt` to pass T017 (GREEN), then refactor.
- Add optional KMS provider and, post‑T020, introduce `x25519` sealed‑box provider.
