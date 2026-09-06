# Journal Crisis Plan Sync Protocol Delta

This contract advances the feature-010 journal sync contract from version `5` to `6`. Existing non-journal entities and clients retain their negotiated behavior. A client that does not advertise version 6 never receives or mutates crisis-plan entities.

## Entity and operation matrix

| Entity/operation | Actor | Offline queue | Durable recipient copy | Transport |
|---|---|---:|---:|---|
| `crisisPlan` create/update | Owner | Yes | N/A | Journal push/pull v6 |
| `crisisPlan` rekey/revoke intent | Owner | Yes, encrypted intent | N/A | Dedicated conditional endpoint |
| share create/re-share | Owner | Yes after plan synced | No | Dedicated conditional endpoint |
| recipient self-removal | Exact recipient | No; online only | No | Dedicated conditional endpoint |
| active share summaries | Owner/recipient as applicable | No | No | Live paginated read |
| shared plan open | Active recipient | No | No | Dedicated no-store broker endpoint |

## Owner `crisisPlan` mutation

Push payload contains only:

- opaque plan ID;
- exact base plan version;
- schema/key/share generation;
- bounded body ciphertext envelope;
- bounded owner key-wrap ciphertext envelope;
- `keyRotationRequired=false` for ordinary create/update;
- stable mutation ID and operation.

It must not contain normalized rich text, CPK/JMK, recipient grant, recipient identity, journal answers, trigger state, or plaintext-derived preview.

### Push invariants

1. Authenticate and derive owner ID from authorizer context.
2. Require CSRF, exact supported sync/schema algorithms, stable mutation ID, and bounded batch size.
3. Reject recognized plaintext plan/rich-text field names and unknown properties at the ciphertext boundary.
4. For create: require no existing plan, `baseVersion=0`, version/generation `1`, valid ciphertext/owner-wrap envelopes, and no delete operation.
5. For update: require exact current version and same key generation unless using the dedicated rekey contract.
6. If `keyRotationRequired=true`, reject ordinary content/share mutation with `rekey_required`.
7. Commit current plan, owner-feed change, and mutation receipt atomically.
8. Duplicate mutation returns original result without another write.
9. Conflict returns ciphertext through owner-only pull, never through logs/error detail.
10. Delete/tombstone/export/search/server-decrypt operations are rejected.

## Journal-entry prerequisite

Every `journalEntry` create (`baseVersion=0`) in sync v6 includes a DynamoDB condition check that the authenticated owner's current `CRISIS_PLAN` row exists. The plan mutation must drain before any later local new-entry mutation for the same owner.

- Missing plan: return stable `rejected` with `conflictKind=crisisPlanRequired`; do not create date pointer, projection, body, receipt, or feed change.
- Existing-entry update (`baseVersion>0`): do not require a plan, preserving clarified legacy read/edit behavior.
- Client receiving `crisisPlanRequired`: preserve encrypted entry draft, route to plan creation, and retry only after plan synchronization.

## Owner pull/bootstrap

- Owner feed adds `crisisPlan` ciphertext changes.
- Pull/bootstrap returns the current plan body envelope and owner wrap only to the exact owner.
- Owner local transaction writes plan ciphertext and journal cursor together unless a newer pending local mutation exists.
- Unsupported future schema/generation is retained encrypted and marked unavailable; older code must not overwrite it.
- Share relationships and grants do not enter the owner journal feed payload. Owner share management uses its dedicated online endpoint.

## Local atomic save

After owner unlock, a valid save must atomically:

1. normalize/validate the document;
2. encrypt body with CPK and exact next-version AAD;
3. create owner CPK wrap with exact next-version AAD;
4. write owner plan ciphertext record;
5. write encrypted outbox mutation; and
6. mark plan `saved_pending`.

Local acknowledgement means the transaction committed on the authorized device. `synced` appears only after an applied/already-applied server receipt.

Initial local plan save may unlock local new-entry creation. The outbox serializer must send the plan before the entry. If plan synchronization fails, entry remains encrypted and pending; no false server-synced state is shown.

## Owner update conflict

- Exact base-version mismatch preserves encrypted local and remote plan variants in `secureCrisisPlanConflicts`.
- After unlock, the owner chooses local, remote, or manual rich-text reconciliation.
- Resolution encrypts a new candidate against the remote version; it never silently concatenates or chooses by timestamp.
- Interrupted resolution leaves both variants and original pending intent recoverable.
- A generation mismatch requires refetch and may require rekey before content resolution.

## Share create/re-share

Preconditions:

- owner authenticated, online, unlocked, and owns current synced plan;
- target is an active registered user other than owner;
- no `keyRotationRequired` state;
- current signed sharing-key registry available;
- grant binding matches exact planned share version and current plan generation;
- active recipient count remains ≤90.

Commit share relationship/grant and mutation receipt atomically. State is immediately `active`; there is no invitation/acceptance. Recipient list query can see it after commit. Duplicate mutation returns the same active relationship.

## Owner revoke/rekey

Offline selection produces an encrypted local `revoke` intent and message “Revocation pending; recipient access may continue.” It is not applied to remote-visible state.

On reconnect/unlock, client fetches exact current plan/share snapshot, constructs [the full rekey package](crypto-sharing.md), and submits it. Server:

1. verifies owner, target, current versions/generation, active recipient set, grant count, mutation ID, and algorithms;
2. rejects packages with missing/extra/duplicate remaining recipients;
3. transactionally updates plan body/wrap/generation, all remaining grants, target state, and receipt;
4. returns applied current versions/generation.

If interrupted or conflicted, old generation remains current. Client retains intent and rebuilds only after owner review/unlock. Success removes target from recipient live list immediately.

## Recipient self-removal

Recipient must be online. Exact active recipient sends CSRF-protected stable mutation. Transaction:

- changes relationship to `recipient_removed`;
- removes active recipient index projection;
- sets plan `keyRotationRequired=true` if not already set;
- records receipt.

No owner plan ciphertext or other relationship changes. Recipient list/open denies immediately. Owner receives rekey-required state on next authorized refresh and cannot update/share until the rekey commits.

## Recipient live reads

- `Crisis Plans` shared summaries are queried live with bounded pagination; no IndexedDB/service-worker cache.
- Refresh on tab open, window focus, explicit retry, and after online transition.
- Offline returns an explicit online-required state and clears any rendered shared plan.
- Shared-open requires a fresh current authorization check and returns no-store response per [crypto-sharing.md](crypto-sharing.md).
- Revoked/removed/inactive/unknown plans return the same concealed response shape.
- Recipient relationship metadata never appears in owner journal entries, dashboards, exports, notifications, or trigger behavior.

## Retry ordering

For one owner, drain in this order:

1. initial/ordinary crisis-plan mutations;
2. required rekey;
3. owner revoke/rekey;
4. share create/re-share;
5. new journal-entry creates;
6. other journal mutations.

Serialize by plan/share identity. Use existing bounded exponential backoff for retryable failures and stop on auth/session lock. App start, focus, online, and explicit retry are triggers; service-worker background sync is optional and MUST NOT handle plaintext or recipient reads.

## Migration from sync v5

1. Add Dexie schema 13 stores without modifying schema-12 journal ciphertext.
2. Negotiate version 6 before emitting `crisisPlan`.
3. Existing feature-010 users initially have no plan; reads/edits of existing entries remain available, new entry create is gated.
4. No server backfill fabricates plan content or a CPK.
5. First valid plan save establishes owner row and generation 1.
6. Version-5 clients may continue entry reads/updates according to feature 010, but server MUST reject new-entry creates for any owner whose feature version requires crisis-plan gating. Feature-version rollout must prevent an old client from bypassing the prerequisite.
7. Migration/resume failures preserve all existing journal data and expose actionable upgrade state.

## Logging prohibition

Sync/share telemetry may include allowlisted operation, outcome, latency bucket, schema/key/share generation, retry/conflict category, safe correlation/mutation ID, and bounded counts. It must exclude plan content, normalized nodes, journal answers/trigger state, usernames/display names, raw owner/recipient/plan/share IDs, ciphertext, IVs, wraps, grants, public keys, nonces, raw request/response bodies, CPK/JMK, and exception serialization.
