# Research: Private Journal and Wellness Dashboard

## Decision 1: One browser-held Journal Master Key per owner

**Decision**: Generate one random 256-bit JMK per journal owner in the browser. Derive namespace- and record-specific AES-256-GCM keys plus a date-identity HMAC key with domain-separated HKDF labels. Encrypt entry projections, rich-text bodies, preferences, task associations, and any durable local derivatives with fresh 96-bit IVs and canonical AAD containing owner ID, opaque record ID, record kind, schema version, key version, and opaque date token. Keep the unlocked JMK as a non-extractable Web Crypto key only in memory; lock after five minutes, tab hiding, logout, session revocation, or explicit lock.

**Rationale**: The repository's hidden-memo path already establishes browser AES-GCM, Argon2id wrapping, recovery public-key wrapping, and visibility-bound key lifetimes (`apps/web/src/crypto/*`, `packages/domain/src/crypto/hidden-memo-package.ts`). A per-user JMK avoids a recovery wrap per daily entry while derived keys isolate record classes and versions. The persisted general device key is insufficient because it does not impose a journal-owner unlock boundary.

**Alternatives considered**:

- Server-side KMS envelope encryption: rejected because ordinary server roles could obtain plaintext.
- One KMS key per user: rejected because of monthly cost, quotas, and no additional ordinary-admin isolation.
- One independent DEK/recovery wrap per entry: rejected because it expands key inventory, storage, rotation, restore validation, and recovery work without a deletion/crypto-shredding requirement.

## Decision 2: Owner PIN wrap plus shared recovery-key wrap

**Decision**: Persist a versioned Journal Key Envelope containing two wraps of the JMK material: an owner wrap protected by the existing Argon2id PIN-derived AES key parameters, and an RSA-OAEP-SHA-256 wrap to the signed public key for the existing RSA-3072 recovery KMS key. First journal use enrolls an owner journal PIN. Previously authorized offline devices can unlock from the local owner wrap; changing the PIN rewraps only the JMK.

**Rationale**: This reuses `pin-wrap.ts`, `recovery-wrap.ts`, the signed recovery-key registry, and `UnlockSession`. KMS is invoked only at rare recovery/rotation events, not daily reads or writes.

**Alternatives considered**:

- Account password as the permanent wrap secret: rejected because password changes/resets would tightly couple account recovery and journal cryptography and make offline semantics fragile.
- Persisted device-only wrap: rejected because a new device could not unlock and local access would not require an owner secret.
- User-held recovery code only: rejected by the clarified administrator-assisted recovery decision.

## Decision 3: Opaque owner/date uniqueness without plaintext dates

**Decision**: Give each entry a stable random opaque ID. Derive a date-identity key from the JMK and calculate `dateToken = HMAC(dateIdentityKey, YYYY-MM-DD)`. Transact a conditional owner-scoped date pointer with the versioned ciphertext entry. Create requires pointer absence; changing a date reserves the new token and releases the old token in the same transaction. Store the date only inside ciphertext and bind the token into AAD.

**Rationale**: The API can enforce one entry per owner/local date across devices without learning the date. Stable entry IDs preserve edit/conflict identity. Existing repositories already use DynamoDB conditional transactions, mutation receipts, and owner feeds.

**Alternatives considered**:

- Plain ISO date sort key: rejected because it leaks journal activity dates to ordinary administrators and backups.
- Public hash of the date: rejected because calendar dates are enumerable.
- Random IDs with only client duplicate checks: rejected because concurrent offline creates can produce duplicates.

## Decision 4: Ciphertext-only versioned synchronization

**Decision**: Extend the existing sync contract with `journalEntry` and `journalProfile` ciphertext entities. Journal create/update mutations carry opaque identity, date token, key/schema version, IV/ciphertext, base version, mutation ID, and byte size—never plaintext domain fields. The server conditionally commits ciphertext, date pointer, receipt, and owner-feed change. Duplicate mutation IDs return stable results. No delete/tombstone operation exists. The JournalKeyEnvelope remains on its dedicated owner/recovery endpoint because it must be retrieved before journal unlock and updated atomically during recovery.

**Rationale**: Reusing the encrypted outbox, sequential per-entity drain, owner feeds, cursors, and conditional write patterns avoids a second synchronization subsystem. A journal-specific parser can reject any unexpected plaintext field and bound ciphertext sizes.

**Alternatives considered**:

- Ordinary task-style plaintext sync payloads: rejected by the journal privacy boundary.
- Separate journal database/sync service: rejected as unnecessary operational complexity.
- Last-write-wins: rejected because it silently loses private records.

## Decision 5: Strict conflicts with both encrypted variants preserved

**Decision**: Require exact `baseVersion` for every journal/profile/key-envelope update. On mismatch, keep the local ciphertext and remote ciphertext in `secureJournalConflicts`; after unlock the owner chooses local, remote, or manually reconciled content, then submits a mutation based on the current server version. Date-token conflicts link to the existing local day after pull/decryption. Cursor changes and ciphertext changes commit atomically.

**Rationale**: The server cannot safely merge encrypted fields or structured rich text. Whole-entry conflict resolution is explicit, testable, and consistent with existing visible conflict/reapply/discard patterns.

**Alternatives considered**:

- Field-level CRDT: rejected because it exposes more metadata and adds substantial date/rich-text merge complexity.
- Automatic client merge: rejected because mutually changed safety answers and notes have no universally correct merge.

## Decision 6: Split encrypted projections and bodies; compute dashboards locally

**Decision**: Store a compact encrypted entry projection (date and structured optional responses) separately from an encrypted body (general rich text, optional task ID, and task reflection). Sync projections for list/dashboard use and lazy-load bodies on entry open. Decrypt, sort, date-filter, aggregate, compare periods, and construct contributor sets only in the unlocked browser. Do not persist plaintext or server-side aggregates.

**Rationale**: At one small projection per day, arbitrary ranges and prior-period comparisons are inexpensive and work offline without creating derived-data disclosure or consistency problems. Body separation avoids loading unlimited rich text for a dashboard.

**Alternatives considered**:

- Server aggregates: rejected because answers and derived health values become server-readable.
- Homomorphic aggregation: rejected due cost and unjustified cryptographic/operational complexity.
- Precomputed encrypted period aggregates: rejected because arbitrary ranges and edits create invalidation complexity.

## Decision 7: Native controls and a journal-specific structural editor

**Decision**: Pair native range and number inputs against one nullable domain value and one canonical range/step validator. Wrap the existing `ReferenceCombobox` with locally authorized task eligibility. Build a separate journal document AST and Lexical editor supporting bold, italic, underline, strikethrough, ordered/unordered lists, and HTTPS links; add pinned `@lexical/link` 0.49.0. Render structural React nodes, never injected HTML. Implement dashboard cards as semantic buttons and details with native modal dialog focus restoration.

**Rationale**: Native controls provide the strongest Chrome/WebKit keyboard/touch baseline. Existing combobox, editor, report-state, and dialog patterns reduce custom-browser risk. A separate journal AST avoids changing the existing 20,000-character memo contract and adds required semantics.

**Alternatives considered**:

- Custom ARIA sliders or clickable `div` cards: rejected for accessibility/WebKit risk.
- Sanitized stored HTML: rejected because it broadens sanitizer and migration risk.
- Expanding MemoDocument v1: rejected because of missing link/underline and its product limit.

## Decision 8: Task references remain encrypted and confer no task access

**Decision**: Populate the selector from the owner's authorized local task cache: every open task plus tasks completed in the prior seven local dates. Store only the encrypted task ID and reflection. On read, resolve through current authorized task data; if unavailable, display “Task unavailable” and no former label. Confirm before clearing a reference with notes. The server treats the reference as opaque private prose and never uses it to authorize task access.

**Rationale**: This preserves offline use and prevents the journal store from becoming a task-disclosure channel. Owner-authored ciphertext cannot grant task access, so server-side inspection is unnecessary.

**Alternatives considered**:

- Plain task ID index or copied task label: rejected because it exposes associations or stale content.
- Online-only signed task capability: rejected because it breaks offline journaling and provides no authorization benefit for an opaque note.

## Decision 9: Bounded DynamoDB ciphertext with encrypted draft preservation

**Decision**: Reuse the on-demand single table. Keep each projection small and each body envelope at or below a conservative 300 KiB request/item budget. Paginate bootstrap/feed batches at up to 100 envelopes and decrypt incrementally; lazy-load bodies. If a body exceeds the safe budget, preserve the encrypted local draft, mark it unsynced, and show an actionable error without truncation. Consider private versioned S3 bodies only after measured content requires it.

**Rationale**: DynamoDB's 400 KiB item ceiling leaves headroom at 300 KiB. Thousands of daily records are inexpensive; S3 on day one adds atomicity, lifecycle, reconciliation, restore, and IAM complexity.

**Alternatives considered**:

- S3 bodies immediately: rejected until measured sizes justify the lifecycle.
- One growing journal blob: rejected because of item limits and conflict hotspots.
- Server scans: rejected as unbounded and costly.

## Decision 10: Two-party owner-bound recovery

**Decision**: Recovery is a five-minute, single-use state machine. The owner strongly reauthenticates, documents a reason, generates a one-use RSA browser key pair, and creates a request bound to owner, session epoch, wrap version, public-key fingerprint, expiry, and idempotency token. A designated recovery administrator performs fresh password plus TFA and approves that exact request. The isolated reserved-concurrency-one recovery Lambda validates both parties, decrypts only the recovery wrap, immediately encrypts it to the owner's ephemeral key, zeroes the buffer, and marks the request consumed. The owner sets a replacement PIN and commits a new owner wrap. Recovery cannot read/edit entries or return the JMK to the administrator.

**Rationale**: This generalizes the existing hidden-memo ephemeral-rewrap pattern while satisfying administrator assistance and user approval. Only the isolated recovery principal needs `kms:Decrypt`.

**Alternatives considered**:

- Administrator receives JMK/plaintext: rejected by FR-036.
- Administrator resets PIN unilaterally: rejected because it bypasses user approval.
- Existing owner-only recovery unchanged: rejected because it lacks administrator assistance.
- Dual-administrator approval: deferred as future regulated-deployment hardening.

## Decision 11: Tamper-evident audit and positive telemetry allowlists

**Decision**: Append recovery state events with opaque IDs, operation/state/outcome, reason digest, session/public-key fingerprints, key version, correlation ID, elapsed time, timestamp, previous hash, and event hash. Conditionally append and KMS-sign the terminal chain head. Locked backups retain evidence. CloudWatch receives bounded allowlisted fields only, with 90-day retention and alarms; it never receives content, dates, response names/values, notes, task associations, wraps, keys, public keys, reason text, ciphertext, or bodies.

**Rationale**: Existing recovery telemetry and permanent redaction favor positive allowlists. Signed DynamoDB audit rows plus independent CloudTrail KMS events provide alteration evidence without another store.

**Alternatives considered**:

- CloudWatch alone: rejected because it omits complete approval state.
- Unsigned audit rows: rejected because privileged table operators could mutate them without evidence.
- S3 Object Lock audit store: deferred unless compliance requires stronger independent immutability.

## Decision 12: Validation scope and required-runtime budget

**Decision**: Add domain/crypto/property, component, Dexie migration/repository, contract, API/integration, security, restore, observability, infrastructure, performance, and exhaustive browser/device coverage. Add exactly one representative Chromium journal journey to `test:e2e:quick`; keep WebKit/iPhone/iPad permutations and failure matrices in full/local gates. Baseline on the unchanged tree is 23 quick tests in 13 files, all passing in Playwright 21.4 seconds and `/usr/bin/time` real 21.78 seconds. Implementation must list the resulting count, remeasure before/after, and confirm the hosted PR check remains below ten minutes.

**Rationale**: The required gate needs one high-value proof without absorbing the exhaustive privacy, recovery, browser, and device matrix.

**Alternatives considered**:

- Put every journal browser scenario in the quick gate: rejected for hosted runtime risk.
- Keep journal out of the required browser gate: rejected because encryption/offline/UI integration is a primary journey.

## Decision 13: Compliance scope

**Decision**: Treat all journal material as highly sensitive private data and apply stronger encryption, least privilege, audit, backup, and disclosure controls. Do not claim HIPAA or other regulated-record compliance for this personal deployment. Require separate legal, threat, vendor, retention, incident-response, and deployment review before use by a covered or regulated organization.

**Rationale**: Regulatory applicability depends on actors and deployment context, not merely wellness data. The feature excludes diagnosis, alerts, clinician sharing, and emergency workflows.

**Alternatives considered**:

- Declare HIPAA compliance from feature requirements: rejected because administrative, contractual, operational, and vendor requirements are not established.
- Treat journal data like ordinary task content: rejected because owner-only and recovery constraints require a stronger boundary.
