# Data Model: Native Apple Applications

This document defines native-only persistence and system-integration entities. Existing server and
wire entities in `@naaseh/domain` remain authoritative; the Swift `Codable` representations must
match them through golden fixtures.

## Storage boundary

One App Group SwiftData container is owned by a single storage actor. Every row is partitioned by a
non-reversible account namespace derived from the user ID and installation salt. Domain JSON,
outbox payloads, conflicts, drafts, and sensitive preferences are encoded canonically and encrypted
with AES-256-GCM before SwiftData sees them. Associated data is:

```text
naaseh:v1:<accountNamespace>:<recordKind>:<recordId>:<envelopeVersion>
```

The store may retain only the following plaintext metadata: opaque IDs, record kind, server version,
sync state, timestamps needed for retry/expiry, cursor audience name, migration version, and bounded
non-content state enums. Labels, names, memo text, journal values, attachment filenames, project
names, alert preview text, and voice input are never plaintext store indexes.

## NativeInstallation

Represents one installed app instance. The server record grants no authority and exists only to
route native alerts and enforce build compatibility.

| Field | Type | Rules |
|---|---|---|
| `installationId` | UUID | Random, device-local, rotated after full reinstall/reset |
| `userId` | opaque ID | Server-authenticated owner; one active user per local account namespace |
| `platform` | enum | `ios`, `ipados`, `macos` |
| `appVersion` / `buildNumber` | string | Sent with registration and diagnostic headers |
| `contractVersion` | integer | Must be within server compatibility window |
| `environment` | enum | `production` for TestFlight; local development may use `local` |
| `notificationAuthorization` | enum | `unknown`, `notDetermined`, `provisional`, `authorized`, `denied`, `restricted` |
| `previewPolicy` | enum | `generic` default or `nonPrivateTaskName` explicit opt-in |
| `apnsEnvironment` | enum | `sandbox` or `production`; must match signing/build |
| `apnsTokenDigest` | string | Server stores encrypted/raw routing token only where required; logs use digest prefix never token |
| `lastRegisteredAt` | instant | Registration freshness |
| `disabledAt` | instant? | Revocation/cleanup tombstone |

**Uniqueness**: `(userId, installationId)`.

**Transitions**: `unregistered -> active -> disabled`; token rotation updates the active record.
Sign-out and invalid-token APNs responses disable/delete the association idempotently.

## SecureAccountState

Keychain-backed state, never SwiftData plaintext.

| Field | Type | Rules |
|---|---|---|
| `accountNamespace` | digest | Identifies matching encrypted store without exposing user name |
| `deviceRootKey` | 256-bit key | Non-synchronizing, this-device-only, biometric/passcode access control |
| `sessionToken` | opaque bytes | Current `__Host-naaseh` value; accessibility after first unlock, non-syncing |
| `preAuthToken` | opaque bytes? | Short-lived login/TFA continuation; purge after completion/failure |
| `trustedDeviceToken` | opaque bytes? | Mirrors existing remembered-device contract |
| `csrfToken` | opaque string | Sent only to the production origin with mutations |
| `lastValidatedUserId` | opaque ID | Must match session response before local store unlock |
| `lockPolicy` | value | user preference plus last local unlock state; not server authority |

**Invariant**: Biometric/device-passcode success releases local key material only. It never creates,
renews, or validates a server session.

## EncryptedRecord

Generic local representation for tasks, revisions, completion events, lists, list items, directory
items, groups, categories, projects, personal-stack data, timer state, reminders, reports, journal
profiles/entries, Crisis Plans, attachment metadata, settings, and other authorized cached entities.

| Field | Type | Rules |
|---|---|---|
| `accountNamespace` | digest | Required partition |
| `recordKind` | enum | Closed list matching supported wire entity types |
| `recordId` | opaque ID | Unique within kind/account |
| `serverVersion` | integer? | Last applied server version |
| `syncState` | enum | `synced`, `pending`, `conflicted`, `rejected`, `revoked`, `tombstone` |
| `updatedAt` | instant | Non-content ordering/health use only |
| `envelopeVersion` | integer | Crypto envelope version |
| `nonce` | 12 bytes | Unique per key/encryption |
| `ciphertextAndTag` | bytes | Canonical JSON encrypted with AES-GCM |

**Uniqueness**: `(accountNamespace, recordKind, recordId)`.

**Validation**: Decrypt, validate with the Swift contract schema, and enforce authorization context
before presentation. Authentication failure quarantines the store and blocks writes; it is never
treated as an absent record.

## PendingOperation

Durable native equivalent of the web outbox row.

| Field | Type | Rules |
|---|---|---|
| `mutationId` | ULID | Stable across retries; Siri invocation maps to one stable ID |
| `accountNamespace` | digest | Required partition |
| `entityType` / `entityId` | enum / opaque ID | Routing only |
| `baseVersion` | integer? | Version on which local intent was based |
| `operation` | enum | Existing sync operation vocabulary |
| `createdAt` | instant | Retry/order metric |
| `attemptCount` | integer | Bounded, non-negative |
| `nextAttemptAt` | instant? | Exponential backoff with jitter |
| `state` | enum | `queued`, `sending`, `retryable`, `conflict`, `rejected`, `applied` |
| `lastProblemClass` | enum? | Bounded non-content diagnostic category |
| encrypted payload | envelope | AAD namespace `mutation:<mutationId>` |

**Atomicity invariant**: The related `EncryptedRecord` update and `PendingOperation` insert happen
in one storage transaction before the UI, Siri, or an alert action reports success.

**Replay invariant**: A crash after server apply but before local acknowledgement retries the same
`mutationId`; the server's existing receipt returns applied/duplicate without a second effect.

## SyncCursor

| Field | Type | Rules |
|---|---|---|
| `accountNamespace` | digest | Required partition |
| `audience` | string | `public`, `owner`, `access`, or opaque `group:<id>`; admin feeds are not used by native apps |
| `sequence` | integer | Monotonic, never advanced before all changes are durably applied |
| `lastPulledAt` | instant? | Freshness display |
| `lastResult` | enum | `success`, `offline`, `retryable`, `authRequired`, `incompatible` |

**Uniqueness**: `(accountNamespace, audience)`.

## SyncConflict

| Field | Type | Rules |
|---|---|---|
| `conflictId` | ULID | Local identity |
| `mutationId` | ULID | Pending operation that conflicted |
| `entityType` / `entityId` | enum / opaque ID | Routing |
| `reason` | bounded enum | Existing contract conflict reason |
| `createdAt` | instant | Display/order |
| local/server/base snapshots | encrypted envelope | Never logged or indexed |
| `resolutionState` | enum | `unresolved`, `keepLocalQueued`, `acceptServer`, `mergedQueued`, `resolved` |

Resolution always creates or updates a durable mutation before marking the conflict resolved.

## MigrationJournal

| Field | Type | Rules |
|---|---|---|
| `schemaVersion` | integer | SwiftData schema version |
| `cryptoVersion` | integer | Envelope/AAD version |
| `migrationId` | string | Stable named migration |
| `state` | enum | `notStarted`, `preflight`, `copying`, `verifying`, `committed`, `rolledBack`, `blocked` |
| `sourceDigest` / `resultDigest` | digest? | Non-content integrity evidence |
| `startedAt` / `completedAt` | instant? | Recovery diagnostics |
| `failureClass` | enum? | No raw error or protected values |

**Invariant**: Upgrade opens the old store read-only, checks free space and key availability, writes
to a staged version, verifies counts/digests/decryptability, then atomically promotes. Termination
before promotion resumes or discards only the staged copy. A blocked migration preserves the prior
store and prevents mutation.

## NativeSceneState

Stores restorable navigation only; sensitive routes are redacted when locked.

| Field | Type | Rules |
|---|---|---|
| `sceneId` | UUID | Per iPad scene/Mac window; one for iPhone |
| `platform` | enum | phone, tablet, desktop |
| `routeKind` | enum | Non-sensitive destination category |
| `selectedOpaqueId` | encrypted value? | Never placed in a URL/user activity as plaintext |
| `draftId` | opaque ID? | Points to encrypted draft, not draft content |
| `layoutState` | encrypted value | Column visibility, inspector, filters, scroll anchor |
| `sensitivity` | enum | `ordinary`, `protected`, `journal`, `crisisPlan` |
| `lastActiveAt` | instant | Restoration pruning |

Multiple scenes observe the same storage actor. A second edit uses version checks and becomes an
explicit local conflict rather than last-writer-wins.

## AlertRegistration

Local and server representations share `installationId` but store different details.

| Field | Type | Rules |
|---|---|---|
| `installationId` | UUID | Foreign key to NativeInstallation |
| `permissionState` | enum | Mirrors current OS setting |
| `previewPolicy` | enum | Generic by default; task names only for authorized non-private tasks |
| `badgeEnabled` / `soundEnabled` | bool | Device-scoped |
| `lastReconciledAt` | instant? | Health |
| `pendingOccurrenceIds` | encrypted set | Stable IDs for scheduled local requests |

Private-task, hidden memo, journal, Crisis Plan, and attachment content is never eligible for an
alert preview regardless of preference.

## ReminderOccurrence

| Field | Type | Rules |
|---|---|---|
| `occurrenceId` | digest | Stable digest of task/reminder/version/time/installation |
| `taskId` | opaque ID | Encrypted locally; server scheduled event already carries authorized ID |
| `fireAt` | instant | Absolute server-compatible time |
| `source` | enum | `offlineLocal` or `serverRemote` |
| `state` | enum | `scheduled`, `delivered`, `cancelled`, `superseded`, `handled` |

Acknowledgement/reconciliation uses `occurrenceId` to avoid duplicate visible alerts when an
offline reminder becomes server-authoritative.

## TimerPresentation

Derived from the existing canonical `TaskTimer`; it is not a second timer source of truth.

| Field | Type | Rules |
|---|---|---|
| `ownerId` | opaque ID | Current user only |
| `timerVersion` | integer | Canonical version |
| `intervalKind` | enum | Existing work/rest meaning |
| `anchorAt` / `duration` | instant / duration | Compute displayed remaining time from a clock |
| `state` | enum | Existing running/paused/stopped states |
| `activityId` | string? | Local ActivityKit/status-surface identity |
| `lastReconciledAt` | instant | Staleness handling |

The presentation may show generic interval state; task names follow the same explicit preview policy
and can never reveal a private task.

## VoiceTaskRequest

Transient except for its encrypted pending-operation representation.

| Field | Type | Rules |
|---|---|---|
| `invocationId` | stable string | Mapped deterministically to one mutation ID for deduplication |
| `label` | string | Required, validated with ordinary task rules; never logged/donated |
| `projectPhrase` | string? | Optional; omission means Unassigned and does not prompt |
| `projectId` | opaque ID? | Only after authorized active local resolution |
| `dueDate` / `dueTime` | value? | Resolved using current locale/time zone and ordinary defaults |
| `resolutionState` | enum | `ready`, `ambiguous`, `needsUnlock`, `needsSignIn`, `invalid`, `cancelled`, `committed` |
| `continuationToken` | encrypted opaque value? | Short-lived foreground handoff; contains no URL parameters |

Ambiguous resolution displays/speaks only authorized candidates. Success is returned only after the
task and outbox row commit.

## ClientCompatibility

Server-provided, cacheable only for a short bounded period.

| Field | Type | Rules |
|---|---|---|
| `platform` | enum | iOS/iPadOS/macOS |
| `minimumBuild` | integer | Lower builds become read-only/blocked before mutation |
| `latestBuild` | integer | Optional upgrade advice |
| `supportedContractVersions` | integer set | Must include client version |
| `mode` | enum | `supported`, `upgradeRequired`, `temporarilyUnavailable` |
| `messageCode` | enum | Client-localized, no server-provided rich text |

## NativeTelemetryEvent

A bounded, content-free diagnostic event for significant native-only failures. It is never a user
data record, never changes a user-operation outcome, and is not persisted server-side outside the
existing CloudWatch log/metric retention policy.

| Field | Type | Rules |
|---|---|---|
| `eventId` | UUID | Random deduplication/correlation value; not derived from user or record data |
| `occurredAt` | instant | Client event time; server also records receipt time |
| `platform` | enum | `ios`, `ipados`, `macos` |
| `appVersion` / `buildNumber` | string / integer | Bounded release identity |
| `contractVersion` | integer | Current sync/API contract |
| `operationClass` | enum | `migration`, `secureStore`, `crypto`, `sync`, `lifecycle`, `siri`, `notification`, `fileWorkflow`, `authentication` |
| `outcome` | enum | `failed`, `blocked`, `recovered`, `retryScheduled` |
| `errorClass` | enum | Bounded safe classification; no raw exception message |
| `durationMilliseconds` | integer? | Non-negative and capped before submission |
| `retryable` | bool | Whether a safe automatic/manual retry exists |
| `queueDepthBucket` | enum? | `zero`, `oneToTen`, `elevenToHundred`, `overHundred` |
| `freshnessBucket` | enum? | Coarse state only; no record timestamp |
| `correlationId` | UUID | Client-generated safe correlation value |

**Forbidden fields**: user/device/installation IDs, entity IDs, names, labels, filenames, URLs,
voice text, notification text, ciphertext, keys, tokens, cookies, stack traces, raw exception text,
free-form metadata, and arbitrary dimensions.

**Client retention**: At most 100 events are stored in a separately encrypted protected ring file
using a telemetry key derived from the device root key. Oldest events are dropped with a bounded
counter when full. Events without an available local key remain memory-only. The client flushes a
batch only after session validation and connectivity, deletes acknowledged events, and applies
bounded retry without blocking user work.

**Server handling**: Accept 1–50 events and at most 32 KiB per request, validate the closed schema,
add the API request correlation ID, emit through the existing structured CloudWatch logger/metrics,
and return 204. The server does not place telemetry events in DynamoDB or echo them in a response.

## Purge and recovery rules

1. **Ordinary lock/background**: zeroize decrypted objects and derived indexes; retain encrypted store
   and Keychain items; obscure app-switcher snapshots and system surfaces.
2. **Expired session**: lock data and require server reauthentication. Never discard pending work.
3. **Authorization revocation**: remove revoked server records, local plaintext, related search data,
   local alerts, and live surfaces after a confirmed authorized pull. Preserve only encrypted audit/
   recovery state required by existing rules.
4. **Sign-out without pending work**: revoke server session when online, unregister alerts, remove
   account Keychain items, delete account store partition, clear scenes/system surfaces.
5. **Sign-out with pending work**: require cancel, retry sync, or explicit encrypted recovery/discard
   choice; never expose the partition to the next account.
6. **Missing/corrupt key or store**: quarantine and block writes; offer server re-bootstrap only after
   warning about confirmed-unsynced data. Never silently replace the store.
7. **Reinstall**: a surviving Keychain item may not be assumed. If no matching key exists, old local
   encrypted files are unusable and must not be treated as authoritative; server bootstrap restores
   synchronized data only.
