# Contract: Native Security and Synchronization

## Authentication transport

1. Native requests use only `https://gsd.thepandas.link` in TestFlight.
2. Login/TFA/password flows remain the existing API. The client uses an ephemeral URLSession,
   parses `Set-Cookie`, stores opaque values in non-synchronizing Keychain, and never logs them.
3. Authenticated requests send `Cookie: __Host-naaseh=<opaque>` only to the pinned configured host.
4. Mutations also send the exact configured `Origin` and current `X-CSRF-Token`. Redirects to a
   different host are rejected before credentials are forwarded.
5. Session validation remains server-authoritative. Face ID/Touch ID only releases local Keychain
   material after a normal sign-in.
6. A 401 locks protected local state; it does not delete pending work. A confirmed account-disable or
   authorization pull initiates the purge state machine.

## Contract fixtures

Every shared wire entity and problem envelope has canonical JSON fixtures under
`packages/test-fixtures/fixtures/apple`. Swift and TypeScript tests must:

- decode every current fixture;
- reject the same invalid boundaries;
- re-encode a semantically equivalent representation;
- preserve unknown-compatible optional fields where the contract requires forward tolerance;
- cover ISO-8601 precision, local date/time values, money decimals, ULIDs, enum casing, null versus
  omission, and sync contract versions;
- verify AES-GCM nonce/tag/AAD, base64url, RSA-OAEP-SHA256, and Argon2id byte interoperability.

The TypeScript Zod schemas remain the contract authority. Swift models are generated or manually
maintained from versioned OpenAPI/fixture definitions, never inferred from UI responses.

## Atomic local mutation

For each offline-capable command:

1. Validate input and current local authorization.
2. Load the current encrypted record and verify its base version.
3. Produce the new domain record, immutable local revision where applicable, and stable mutation ID.
4. Encrypt each payload with fresh nonces and record-specific AAD.
5. Insert/update the domain record and insert the pending operation in one SwiftData transaction.
6. Save and read back enough metadata to prove the commit.
7. Only then update the UI or return App Intent/alert-action success.

If steps 1-6 fail, no success is announced and no partially applied record is visible.

## Push/pull synchronization

- Push at most the existing server batch limit (100 mutations) in deterministic order.
- A `sending` marker is advisory; a crash retries the same stable mutation ID.
- `applied` or `duplicate` removes the outbox row only in the same transaction that stores the
  returned server version/entity.
- `conflict` stores encrypted local/base/server state and leaves user intent unresolved.
- `rejected` retains an actionable, bounded problem category until the user acknowledges or repairs
  it; protected server messages are not logged.
- Retryable transport/5xx/429 failures use capped exponential backoff with jitter and manual retry.
- Pull uses the existing public/owner/access/group cursors. Native admin feeds are never requested.
- A cursor advances only in the transaction that applies every validated change in that page.
- Pull rechecks authorization before decrypting/presenting content and removes revoked data and
  associated alerts/system surfaces.
- Network reachability is a hint, never proof. Only request outcomes set synchronized state.

## Multiple windows and intent execution

All scenes, Live Activity controls, notification actions, and App Intents send commands through one
per-account storage/sync actor. Each command carries the base version it observed. Concurrent local
changes either serialize safely or create a local conflict; they never silently overwrite.

## Encryption and zeroization

- Local cache and outbox encryption: AES-256-GCM with a root-derived per-purpose key and fresh
  96-bit nonce.
- Existing hidden memo/journal/Crisis Plan payloads preserve their wire envelopes and recovery
  wrapping exactly; the local cache may wrap those ciphertext records again.
- RSA recovery uses Security framework RSA-OAEP-SHA256.
- Existing PIN wrapping uses the exact Argon2id parameters encoded by the record.
- Plaintext and derived search indexes exist only while unlocked in process memory.
- Lock/background/sign-out destroys references and replaces sensitive views before snapshotting.
  Swift cannot guarantee physical memory wiping for arbitrary value copies, so designs minimize
  copies and use explicitly wiped buffers for key material without claiming impossible guarantees.

## Online-only commands

Credential/TFA changes, recipient sharing/access, attachment upload/finalize,
exports, and destructive server workflows require a successful online response. The client checks
connectivity for early guidance but never queues or claims success based only on that check.

## Observability contract

Allowed fields: correlation ID, platform, app/build/contract version, operation class, duration,
outcome, retry count bucket, conflict category, HTTP status class, APNs reason class, queue-depth
bucket, and freshness bucket.

Forbidden fields: credentials, cookies, CSRF values, APNs tokens, user-entered strings, voice
transcripts, task/project/list names, memos, journal/Crisis Plan values, filenames, URLs containing
record IDs, ciphertext, encryption keys, or full user/device identifiers.

Significant client-only failures use `POST /api/client/telemetry` after the normal session and CSRF
checks. The client validates against the same closed event schema before buffering or sending. When
offline, it may keep at most 100 events in a separately encrypted, protected ring file and flush 1–50
events per request after session revalidation. Missing-key or pre-authentication events remain
memory-only unless they can be sent immediately without protected context. Telemetry submission is
best-effort: it cannot turn failed work into success, block a user mutation, or recursively generate
more telemetry.

The compatibility Lambda handles the telemetry route, validates the 32 KiB request limit and closed
enums, writes one structured event plus bounded metrics through `@naaseh/observability`, and returns
204. It does not store telemetry in DynamoDB, echo the batch, accept free-form fields, or create a new
AWS service/log group. Rate limiting, existing retention, and existing Lambda error/throttle alarms
bound cost and abuse.
