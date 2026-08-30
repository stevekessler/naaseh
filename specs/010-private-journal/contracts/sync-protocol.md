# Journal Sync Protocol Delta

## Negotiation

- Journal entities require sync contract version `5`.
- Existing clients and non-journal entities retain their current behavior; a client that does not advertise version 5 never receives journal changes.
- Unsupported versions fail before any mutation is applied.

## Entity types

| Entity | Identity | Operations | Payload |
|---|---|---|---|
| `journalEntry` | Random stable entry UUID | `upsert` only | Opaque date token plus projection/body ciphertext envelopes |
| `journalProfile` | Owner-stable opaque profile ID | `upsert` only | Preferences ciphertext envelope |

The JournalKeyEnvelope uses the dedicated key-envelope/recovery contract because it must be retrievable before journal unlock and updated atomically during recovery. Delete, tombstone, export, search, server aggregation, and plaintext journal fields are rejected.

## Push invariants

1. Authenticate the session and derive `ownerId` only from authorizer context.
2. Require CSRF protection and at most 100 mutations per request.
3. Reject unknown properties and any recognized plaintext journal field name at the ciphertext boundary.
4. Bind owner, entity type/ID, date token, base version, and mutation ID in the conditional transaction.
5. For entry create, require `baseVersion=0` and absence of both entry and date pointer.
6. For entry update, require exact current version. If the date token changes, conditionally reserve the new pointer and release the old pointer in the same transaction.
7. Commit entry ciphertext, date pointer, mutation receipt, and owner-feed change atomically.
8. Replaying a mutation ID returns the original `applied`/`alreadyApplied` entity version without another write.
9. A version mismatch returns `conflict` and current ciphertext through the owner-only pull/feed path; a date pointer collision returns `conflictKind=dateToken` without revealing a date.
10. A rejected or failed transaction leaves no pointer, partial body, receipt, or feed change.

## Pull and bootstrap

- The owner journal feed is separate from shared/public/task audiences and contains only that owner's journal ciphertext.
- Pull takes an opaque monotonically increasing journal cursor and returns at most 100 changes plus `hasMore` and the next cursor.
- Bootstrap paginates current ciphertext records with a signed owner-bound cursor and returns the current feed cursor for subsequent pull.
- The browser transaction writes all returned ciphertext records and the new cursor together. It does not replace a locally pending newer mutation.
- Projection and body share one entity version. Bodies may be omitted from a projection-only warm path only when the API exposes a separate owner-only lazy fetch with the same version/AAD contract; a body is never plaintext.

## Local transaction

An offline save must atomically:

1. validate the unlocked plaintext domain value;
2. calculate the opaque date token;
3. encrypt projection and body with fresh IVs and canonical AAD;
4. write the local ciphertext entity;
5. write an encrypted outbox mutation; and
6. mark the entry `pending` for UI presentation.

Local acknowledgement means this transaction committed. `synced` is shown only after an accepted server receipt.

## Retry and conflicts

- Drain sequentially per journal entity and use existing bounded exponential backoff for retryable failures.
- Retry on app start, focus, `online`, and explicit user action; do not promise suspended-browser background delivery.
- Preserve the encrypted outbox item until an accepted/duplicate receipt.
- On `version` conflict, retain both encrypted variants. After unlock the owner chooses local, remote, or manual reconciliation and queues a new mutation against the remote version.
- On `dateToken` conflict, pull/decrypt the existing entry and direct the owner to that date. Never synthesize a second daily entry.
- Authentication/authorization failure locks journal state and prevents further decryption; logout/session revocation clears unlocked keys and purges owner-local journal ciphertext per existing privacy-purge policy.

## Logging prohibition

Sync telemetry may include operation, outcome, latency bucket, schema/key version, retry/conflict kind, safe correlation ID, and bounded counts. It must not include dates, tokens, entity IDs unless specifically hashed/allowlisted, ciphertext, IVs, sizes, field names/values, notes, task IDs, DBT selections, dashboard values, or request/response bodies.
