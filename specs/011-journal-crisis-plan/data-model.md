# Data Model: Journal Crisis Plan

All durable rich text, keys, wraps, grants, drafts, and conflicts are encrypted. Routing metadata is minimized but remains sensitive and is authorized, backed up, logged, and retained accordingly. “Plaintext” below means browser memory only unless explicitly describing the transient CPK broker boundary.

## CrisisPlan

One stable record per journal owner. It has no delete/tombstone transition.

| Field | Type | Rules |
|---|---|---|
| `id` | opaque owner-stable ID | Exactly one per `ownerId`; not derived from username |
| `ownerId` | user ID | Derived from authenticated context on writes; never trusted from client routing |
| `schemaVersion` | positive integer | Initial crisis-plan schema `1`; unsupported future versions fail closed |
| `version` | positive integer | Increments for every content, owner-wrap, or generation change |
| `keyGeneration` | positive integer | Increments whenever CPK rotates; current grants must match |
| `bodyEnvelope` | ciphertext envelope | AES-256-GCM normalized Lexical document; fresh IV; at most feature-010 encrypted body ceiling |
| `ownerKeyWrap` | ciphertext envelope | CPK wrapped with JMK-derived `crisis-plan-owner-wrap/v1` key; owner only |
| `sharingKeyVersion` | positive integer | Dedicated KMS public key version used for current grants |
| `keyRotationRequired` | boolean | Set after recipient self-removal; blocks owner content/share mutations until owner rekeys |
| `createdAt`, `updatedAt` | timestamps | Server-validated ISO timestamps; no journal response/date data |

`bodyEnvelope` canonical AAD:

```text
naaseh/crisis-plan/body/v1
schemaVersion | ownerId | planId | planVersion | keyGeneration
```

`ownerKeyWrap` canonical AAD:

```text
naaseh/crisis-plan/owner-wrap/v1
schemaVersion | ownerId | planId | planVersion | keyGeneration
```

The server may persist `hasPlan=true` only as the existence of this current row. It cannot validate meaningful rich-text plaintext, so the browser domain validator rejects empty/formatting-only documents before encryption. Server contract validation still rejects missing/empty ciphertext envelopes, oversized ciphertext, bad versions, and unsupported algorithms.

### Lifecycle

```text
absent
  └─ create(valid encrypted body + owner wrap) → current

current
  ├─ content update(same generation) → current(version + 1)
  ├─ owner rekey/revocation(generation + 1) → current(version + 1)
  ├─ recipient self-removal → current(keyRotationRequired = true)
  └─ delete/tombstone → REJECTED

current(keyRotationRequired = true)
  ├─ owner rekey(generation + 1) → current(false)
  ├─ content/share/revoke without rekey → REJECTED
  └─ owner offline → preserved pending; no false success
```

## CrisisPlanDocument (plaintext browser model)

| Field | Type | Rules |
|---|---|---|
| `document` | normalized Lexical AST | Exactly one WYSIWYG field; at least one meaningful supported text/list/link node |

Allowed formatting is inherited from feature 010: paragraph/plain text, bold, italic, underline, strikethrough, bulleted list, numbered list, and absolute HTTPS link. Raw HTML, scripts, event attributes, embedded media, unknown node types, unsafe protocols, and formatting-only documents are rejected/normalized away before encryption and again before rendering.

## CrisisPlanShare

One relationship per `(planId, recipientId)`. Share selection activates access immediately; there is no invitation or acceptance state.

| Field | Type | Rules |
|---|---|---|
| `planId` | opaque plan ID | Must reference the owner's current plan |
| `ownerId` | user ID | Immutable; must equal plan owner |
| `recipientId` | user ID | Immutable; active user other than owner at creation |
| `state` | `active`, `revoked`, `recipient_removed` | Only `active` permits list/open |
| `version` | positive integer | Conditional lifecycle version |
| `keyGeneration` | positive integer | For active state, must equal current plan generation |
| `grant` | `RecipientKeyGrant` or absent | Required for active state; inaccessible/ignored otherwise |
| `createdAt`, `updatedAt` | timestamps | Lifecycle evidence |
| `changedBy` | `owner` or `recipient` | Owner creates/revokes; exact recipient removes |

### Share transitions

```text
absent
  └─ owner selects active recipient + valid current grant → active

active
  ├─ idempotent owner selection → active (same relationship)
  ├─ owner revokes + atomic plan rekey → revoked
  └─ exact recipient removes → recipient_removed + plan.keyRotationRequired

revoked
  └─ owner re-shares with current-generation grant → active(version + 1)

recipient_removed
  └─ owner re-shares after required rekey with current-generation grant → active(version + 1)
```

No recipient may edit, reshare, export, alter another relationship, or change the plan. Owner revocation and recipient removal never affect another recipient's relationship.

Recipient account lifecycle is an authorization condition, not another share state. Every recipient list, open, refresh, and broker request requires both `state=active` and a currently active recipient account/session. Account deletion, deactivation, or loss of application access denies delivery immediately while the relationship remains available to the owner for audit and explicit revocation.

## RecipientKeyGrant

Opaque RSA-OAEP ciphertext produced in the owner browser with the signed current public key for the dedicated RSA-3072 KMS sharing key.

| Field | Type | Rules |
|---|---|---|
| `schemaVersion` | literal `1` | Compact package format version |
| `kmsKeyVersion` | positive integer | Must identify an active/decrypt-only sharing key in signed registry |
| `algorithm` | `RSAES_OAEP_SHA_256` | No downgrade |
| `ciphertext` | base64url | Bounded for RSA-3072 ciphertext; never logged |
| `bindingDigest` | SHA-256 digest | Digest of non-secret canonical routing bindings; used for validation without logging identities |

Decrypted compact package (broker memory only, maximum 318 bytes before RSA encryption):

| Component | Bytes | Purpose |
|---|---:|---|
| magic + schema | 8 | Reject wrong protocol |
| CPK | 32 | AES-256 plan key |
| `SHA-256(ownerId)` | 32 | Owner binding |
| `SHA-256(planId)` | 32 | Plan binding |
| `SHA-256(recipientId)` | 32 | Recipient binding |
| `shareVersion` | 8 | Relationship binding |
| `keyGeneration` | 8 | Plan generation binding |
| `createdAtEpoch` | 8 | Bounded freshness/audit input |
| reserved/check bytes | bounded | Future-safe exact-length validation |

The broker rejects any wrong length, magic, schema, KMS version, digest, relationship version, generation, caller, inactive state, or unsupported public-key algorithm before returning data.

## CrisisPlanMutationReceipt

| Field | Type | Rules |
|---|---|---|
| `mutationId` | UUID/ULID | Unique per actor operation |
| `actorId` | user ID | Bound to authenticated actor |
| `operation` | enum | `planCreate`, `planUpdate`, `shareCreate`, `shareRevoke`, `shareRemove`, `planRekey` |
| `resourceVersion` | positive integer | Stable result version |
| `outcome` | `applied`, `alreadyApplied`, `conflict`, `rejected` | Replay returns original terminal applied result |
| `createdAt`, `expiresAt` | timestamps | Retained per existing mutation-receipt policy |

Receipts contain no content, ciphertext, grant, key, public key, journal response, display name, or raw recipient identifier in logs.

## CrisisPlanRekeyPackage (request-only)

Owner-generated payload for revocation or required rekey.

| Field | Type | Rules |
|---|---|---|
| `basePlanVersion` | positive integer | Must equal current plan |
| `baseKeyGeneration` | positive integer | Must equal current generation |
| `nextBodyEnvelope` | ciphertext envelope | Same normalized current document encrypted under new CPK |
| `nextOwnerKeyWrap` | ciphertext envelope | New CPK wrapped to owner JMK |
| `nextKeyGeneration` | integer | Exactly current + 1 |
| `remainingGrants` | array | Exactly one current-generation grant per remaining active recipient; maximum 90 |
| `targetRecipientId` | user ID or absent | Required for owner revocation; absent for general required rekey |
| `mutationId` | UUID/ULID | Retry-stable |

The transaction conditionally updates the plan, target relationship if present, every remaining active share grant, and receipt. It rejects missing/extra recipients, stale state/version/generation, duplicates, self-share, inactive users, more than 90 active recipients, or partial packages. Either the entire new generation becomes current or none does.

## SharedPlanOpenRequest (ephemeral)

Never persisted.

| Field | Type | Rules |
|---|---|---|
| `planId` | opaque ID | Route parameter; concealed not-found for unknown/unauthorized |
| `ephemeralPublicKeySpki` | base64url SPKI | One-use RSA-OAEP SHA-256 public key, at least 2048 bits, bounded size |
| `requestNonce` | random 128-bit value | Binds response/AAD and prevents accidental replay in UI state |

## SharedPlanOpenResult (ephemeral)

Returned with `Cache-Control: no-store`; never stored in IndexedDB, Cache Storage, service worker, analytics, or logs.

| Field | Type | Rules |
|---|---|---|
| `planId`, `ownerId` | opaque IDs | Authorized routing only; owner display label returned separately/minimally |
| `ownerDisplayName` | string | Current minimal identity for the selected plan; memory only |
| `planVersion`, `shareVersion`, `keyGeneration` | positive integers | Must match response AAD and current rows |
| `bodyEnvelope` | ciphertext envelope | Current plan ciphertext |
| `rewrappedCpk` | RSA-OAEP ciphertext | CPK encrypted only to request ephemeral public key |
| `requestNonce` | same nonce | Browser rejects mismatch |

The browser imports the private key as non-extractable, unwraps CPK, validates AES-GCM AAD, renders normalized rich text, then destroys component references on every recipient teardown event.

## ShareableUserSummary (online response only)

| Field | Type | Rules |
|---|---|---|
| `id` | user ID | Active, not current owner |
| `username` | canonical username | Minimum selection identity |
| `displayName` | string | Minimum selection identity |

No email, role, TFA/security state, group membership, session epoch, profile details, inactive account, or journal/crisis-plan state is returned. Query is authenticated, trimmed, rate-limited, paginated to 20, and not cached offline.

## Local IndexedDB schema version 13

Feature 010 defines schema version 12. Add owner-only stores:

```text
secureCrisisPlans: id, ownerId, version, updatedAt
secureCrisisPlanConflicts: id, ownerId, planId, createdAt
secureCrisisPlanShareIntents: id, ownerId, operation, createdAt
```

Every value is encrypted by the JMK/CPK hierarchy or existing encrypted outbox/device-key envelope. Indexes expose only owner/routing/version/timestamp fields needed for local operation. No recipient-owned shared plan body, key, grant, summary, or open response is written to IndexedDB. Migration is additive, resumable, quota-aware, and preserves schema-12 journal stores and pending mutations.

### Local plan status

```text
absent | draft | saved_pending | synced | conflict | rekey_required | unavailable_future_version
```

- `draft`: encrypted local editor recovery state; not yet a valid plan prerequisite.
- `saved_pending`: atomic local plan + outbox committed; may gate local entry creation, but outbox orders plan before new entry.
- `synced`: server receipt accepted.
- `conflict`: both encrypted variants retained until owner resolution.
- `rekey_required`: recipient self-removal observed; owner content/share changes wait for CPK rotation.
- `unavailable_future_version`: ciphertext retained, never overwritten by older code.

## DynamoDB layout delta

Use the feature-010 single table and backup policy:

```text
PK=JOURNAL#OWNER#{ownerId}       SK=CRISIS_PLAN
PK=CRISIS_PLAN#{planId}          SK=SHARE#{recipientId}
PK=CRISIS_PLAN#{planId}          SK=MUTATION#{actorId}#{mutationId}
```

Active share rows project a minimal recipient index:

```text
GSI1PK=CRISIS_PLAN_RECIPIENT#{recipientId}
GSI1SK=ACTIVE#{updatedAt}#{planId}
```

Revoked/removed rows are removed from the active GSI projection but retained for authorization/audit/restore according to the lifecycle policy. Owner plan/share queries use exact partitions and bounded pagination. No plaintext body, journal response, link text, recipient key, CPK, JMK, or decrypted derivative is stored.

## Cross-entity invariants

1. An owner has zero or one crisis plan; once created, it has no delete/tombstone transition.
2. A journal-entry create mutation succeeds only if the owner plan row exists; journal-entry updates do not require the row for legacy compatibility.
3. One owner/recipient pair has at most one share relationship; owner self-share is invalid.
4. Only `active` relationships with matching plan/share/key generation can list/open.
5. Current plan generation, owner wrap, body envelope, and all active recipient grants change atomically on owner revocation/rekey.
6. `keyRotationRequired=true` blocks owner content/share mutation until a valid owner rekey commits.
7. A recipient self-removal immediately removes the active GSI entry and broker access, without modifying another share.
8. Recipient open responses and keys are never durable; an offline recipient gets no plan content.
9. Trigger display reads the owner's current decrypted plan only and never writes plan content or a snapshot into a journal entry.
10. Recovery restores owner JMK access only; it does not expose plan plaintext, CPKs, grants, or share lists to the recovery administrator.
11. Logs, metrics, traces, support artifacts, exports, notifications, analytics, and URLs exclude protected content and cryptographic material.
12. Restores must preserve or advance versions/generations and cannot resurrect an active share from a revoked/removed row silently.
