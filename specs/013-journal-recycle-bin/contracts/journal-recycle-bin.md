# Contract: Journal Lifecycle and Permanent Deletion

## Protocol negotiation

The Journal sync contract version is bumped once. The server advertises the current version and
explicit compatible versions. Clients lacking lifecycle/tombstone support receive
`426 journal_client_upgrade_required` before any state-changing Journal request is accepted.

## Apply mutations

`POST /api/v1/journal/mutations`

Request items contain mutation UUID, entry UUID, operation (`upsert`, `recycle`, `restore`), base
version, opaque date token, and encrypted projection/body as required. Responses are per-mutation:

- `applied`: authoritative version and safe server timestamp.
- `already_applied`: same authoritative outcome for idempotent retry.
- `conflict`: authoritative version/state plus ciphertext needed for local resolution.
- `hard_deleted`: no ciphertext; client must purge entry/outbox/conflicts.
- `invalid_transition`: safe current state and user-action code.

Authorization is owner-only. Request/response logging excludes bodies, ciphertext, date token,
entry UUID, and confirmation material.

## Pull Journal changes

`GET /api/v1/journal/changes?cursor={cursor}&limit={boundedLimit}`

Returns ordered, paginated `upsert`, `recycle`, `restore`, or `tombstone` changes and the next
cursor. State-bearing changes include encrypted projection/body; tombstones explicitly omit
payload. The client must continue until `hasMore=false` and must not overwrite a pending local
mutation.

## Preview Journal permanent deletion

`POST /api/v1/journal/entries/{entryUuid}/deletion-preview`

Requires online authenticated ownership and authoritative `recycled` state. Returns resource
type, UUID, target version, generic display label, content-free dependent counts, blockers,
irreversible flag, expiry, and HMAC confirmation token. It never returns the Journal date or
content; the unlocked client may render its locally decrypted date.

Failures include `404` for unavailable/unauthorized, `409 entry_not_recycled`, and stable
retryable service errors.

## Confirm Journal permanent deletion

`DELETE /api/v1/journal/entries/{entryUuid}`

Requires confirmation token, request mutation UUID, and `If-Match` target version. Revalidates
owner, recycled state, token binding/expiry, and deletion ledger. Returns `202` with durable job
status. Repeating the same mutation returns the same job; a completed ledger match returns a
content-free completed result.

## Deletion job status

The existing owner-authorized job endpoint returns status, integer progress, safe failure code,
and retry eligibility. It never returns a checkpoint containing identifiers, tokens, ciphertext,
or dates. Success is reported only after ciphertext absence is verified and ledger/tombstone
finalization succeeds.

## Compatibility and failure rules

- Recycle/restore may be queued offline; preview/delete may not.
- Base-version mismatch never overwrites either side.
- `hard_deleted` and tombstones dominate stale offline upserts.
- Recycled rows retain date reservation.
- Unsupported contract versions fail closed before mutation.
- A workflow start failure leaves a safely resumable job and visible failure state.
- DynamoDB unprocessed batches are retried with bounded backoff and checkpoint persistence.
