# Data Model: OpenAgent MVP

**Date**: 2025-09-08  
**Status**: Implemented in Convex Schema

## Overview

The data model is fully implemented in `/packages/backend/convex/schema.ts`. This document describes the entities, relationships, and state transitions for the OpenAgent platform.

## Core Entities

### 1. Users
**Purpose**: Authenticated users of the platform

**Fields**:
- `id`: Unique identifier (Convex ID)
- `name`: Optional display name
- `image`: Optional profile image URL
- `email`: Optional email address
- `emailVerificationTime`: Optional timestamp of email verification
- `githubId`: Optional GitHub user ID for OAuth
- `createdAt`: Optional account creation timestamp

**Indexes**:
- `email`: For email-based lookups

**Relationships**:
- One-to-many with Sessions
- One-to-many with ProviderKeys
- One-to-many with UsageEvents

### 2. Sessions
**Purpose**: Represents a coding workspace/agent session

**Fields**:
- `id`: Unique identifier (equals OpenCode session ID)
- `userId`: Reference to owner user
- `title`: Session display name
- `status`: Enum (creating, active, idle, stopped, error)
- `currentInstanceId`: Optional reference to active instance
- `registrationToken`: Unique token for sidecar registration
- `sidecarKeyId`: Sidecar's key identifier
- `sidecarPublicKey`: Sidecar's public key for encryption
- `orchestratorPublicKey`: Orchestrator's public key
- `orchestratorKeyId`: Orchestrator's key identifier
- `registeredAt`: Timestamp of sidecar registration
- `lastActivityAt`: Last interaction timestamp
- `createdAt`: Creation timestamp
- `updatedAt`: Last modification timestamp

**Indexes**:
- `by_user`: [userId, createdAt] - User's sessions sorted by creation
- `by_status`: [status] - Sessions by status
- `by_registration_token`: [registrationToken] - Token lookup

**State Transitions**:
```
creating → active (on successful registration)
active → idle (on timeout)
idle → active (on resume)
active/idle → stopped (on user request)
any → error (on failure)
```

### 3. Instances
**Purpose**: Container/VM instances running sidecars

**Fields**:
- `id`: Unique identifier
- `sessionId`: Reference to parent session
- `driver`: Enum (docker, k8s, local)
- `state`: Enum (provisioning, running, terminated, error)
- `endpointInternal`: Internal endpoint URL
- `registeredAt`: Registration completion timestamp
- `terminatedAt`: Termination timestamp
- `sessionJsonPath`: Path to persisted session JSON

**Indexes**:
- `by_session`: [sessionId] - Instance for session
- `by_state`: [state] - Instances by state

**State Transitions**:
```
provisioning → running (on successful start)
running → terminated (on stop/cleanup)
any → error (on failure)
```

### 4. ProviderKeys
**Purpose**: Encrypted API keys for AI providers

**Fields**:
- `id`: Unique identifier
- `userId`: Reference to owner user
- `provider`: Provider name (e.g., "openai", "anthropic")
- `encryptedKey`: Encrypted API key
- `encryptedDataKey`: Encrypted data encryption key
- `keyVersion`: Version for key rotation
- `nonce`: Encryption nonce
- `tag`: Authentication tag
- `dataKeyNonce`: Data key encryption nonce
- `dataKeyTag`: Data key authentication tag
- `masterKeyId`: Master key identifier
- `createdAt`: Creation timestamp
- `lastUsedAt`: Last usage timestamp

**Indexes**:
- `by_user`: [userId] - User's keys
- `by_provider`: [userId, provider] - Specific provider key

**Validation Rules**:
- Provider name: alphanumeric with dots, hyphens, underscores
- Provider name length: 1-50 characters
- Key length: 8-1000 characters
- Unique per user-provider combination

### 5. PendingPermissions
**Purpose**: Permission requests awaiting user approval

**Fields**:
- `id`: Unique identifier
- `sessionId`: Reference to session
- `permissionId`: OpenCode permission ID
- `payload`: Permission details object
  - `type`: Permission type
  - `action`: Requested action
  - `resource`: Optional resource identifier
  - `data`: Optional additional data
    - `path`: File path
    - `content`: Content to write
    - `permissions`: Required permissions array
- `createdAt`: Request timestamp
- `resolvedAt`: Resolution timestamp
- `response`: User response object
  - `granted`: Boolean approval
  - `reason`: Optional rejection reason
  - `expiresAt`: Optional expiration

**Indexes**:
- `by_session`: [sessionId, createdAt] - Session permissions chronologically
- `by_permission`: [permissionId] - Direct permission lookup

### 6. UsageEvents
**Purpose**: Track resource usage for billing and limits

**Fields**:
- `id`: Unique identifier
- `sessionId`: Reference to session
- `userId`: Reference to user
- `type`: Enum (tokens, runtime, storage)
- `quantity`: Usage amount
- `meta`: Optional metadata object
  - `model`: AI model used
  - `provider`: Provider name
  - `inputTokens`: Input token count
  - `outputTokens`: Output token count
  - `duration`: Runtime duration
  - `storageType`: Storage type
  - `storageSize`: Storage size in bytes
- `createdAt`: Event timestamp

**Indexes**:
- `by_session`: [sessionId, createdAt] - Session usage chronologically
- `by_user`: [userId, createdAt] - User usage chronologically

### 7. SessionArtifacts
**Purpose**: Exported code and backups

**Fields**:
- `id`: Unique identifier
- `sessionId`: Reference to session
- `type`: Enum (session_json, zip, git)
- `urlOrPath`: Storage location (URL or file path)
- `createdAt`: Creation timestamp

**Indexes**:
- `by_session`: [sessionId] - Session artifacts
- `by_type`: [sessionId, type] - Artifacts by type

## Relationships Diagram

```
Users (1) ─────┬──── (*) Sessions
    │          │           │
    │          │           ├──── (1) Instances
    │          │           │
    │          │           ├──── (*) PendingPermissions
    │          │           │
    │          │           ├──── (*) UsageEvents
    │          │           │
    │          │           └──── (*) SessionArtifacts
    │          │
    └──────────┴──── (*) ProviderKeys
```

## Data Integrity Rules

### Referential Integrity
- Sessions must reference valid Users
- Instances must reference valid Sessions
- ProviderKeys must reference valid Users
- PendingPermissions must reference valid Sessions
- UsageEvents must reference valid Users and Sessions
- SessionArtifacts must reference valid Sessions

### Business Rules
1. **Session Uniqueness**: OpenCode session ID must equal Convex session ID (1:1)
2. **Provider Key Uniqueness**: One key per provider per user
3. **Active Instance**: Only one Instance per Session can be in "running" state
4. **Permission Resolution**: PendingPermissions must be resolved before expiry
5. **Usage Tracking**: All billable operations must create UsageEvents
6. **Key Rotation**: ProviderKeys version must increment on updates

### Security Constraints
1. **Encryption Required**: ProviderKeys must use envelope encryption
2. **Token Uniqueness**: Registration tokens must be globally unique
3. **User Isolation**: All queries must enforce userId filtering
4. **Key Zeroing**: Decrypted keys must never persist to disk
5. **Audit Trail**: All key operations must be logged

## Migration Considerations

### From Current Schema
The schema is already fully implemented. No migrations needed for MVP.

### Future Migrations
1. **Organizations**: Add `organizationId` to Users and Sessions
2. **Subscription Tiers**: Add `subscriptionTier` to Users
3. **Team Collaboration**: Add `collaborators` array to Sessions
4. **Version History**: Add `versions` table for session snapshots
5. **Billing**: Add `invoices` and `subscriptions` tables

## Performance Optimizations

### Implemented Indexes
All required indexes are implemented for:
- User session listing (by_user)
- Session status filtering (by_status)
- Token-based lookups (by_registration_token)
- Permission chronology (by_session + createdAt)
- Usage aggregation (by_user + createdAt)

### Query Patterns
1. **Session List**: Use `by_user` index with pagination
2. **Active Sessions**: Use `by_status` index for monitoring
3. **Permission Queue**: Use `by_session` index with unresolved filter
4. **Usage Reports**: Use `by_user` index with date range
5. **Provider Keys**: Use `by_provider` index for direct lookup

## Validation Summary

✅ All entities from requirements are modeled  
✅ All relationships are properly indexed  
✅ State transitions are clearly defined  
✅ Security constraints are enforced  
✅ Performance indexes are in place  

The data model is production-ready for the MVP launch.

---
*Data model documented: 2025-09-08*