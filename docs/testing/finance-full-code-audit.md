# PR 84 full code audit

Audit scope: Finance domain rules, API handlers/services, provider and CSV ingestion, browser
components/cache/search, contracts, infrastructure and operational integration in PR 84, compared
with base `17fc0ee4d08cb6d9c3754e48e8445a5d4e737576`. This extends the earlier security audit.

**Disposition: the three production integration blockers are now implemented.** Local SDK-level
integration tests cover cold starts, conditional commits, import handoff, sync dispatch, authorized
client hydration and ordinary task reads. Deployment, a real AWS restore exercise, large-account
profiling, the cost gate and the remaining UI follow-ups below are still release acceptance work.

## Resolved production integration blockers

### Durable Finance state and import handoff

Both production entry points now use `DynamoFinanceRepository`. Canonical records, source identity
locks, receipts, deletion previews, CSV progress and reconciliation provenance are separate table
items. Conditional commits advance a scalar read-set epoch and atomically update changed records
and audience feeds; there is no serialized application-wide state blob. Record size and the
100-write transaction ceiling are enforced. Account reads/creation and simple transaction creation
load only their required collections and receipt, rather than every retained transaction.

Refresh requests persist an import-dispatch record together with the queued job. A once-per-minute
worker drains committed jobs, acquires a durable lease, imports bounded chunks, saves progress and
can resume after interruption. Completed deliveries are idempotent. Provider credentials use a
separate retained KMS key, since granting table access must not grant credential decryption.
The actual AWS Backup restore-testing path decodes and validates Finance relationships and task
references. The integration restore exercise uses a copied database fixture; no AWS restore job
was launched by this implementation.

### End-to-end Finance synchronization

The production `/sync/push` dispatcher now accepts version-7 Finance commands. Offline budgets,
links, items, reusable items and CSV imports use encrypted outbox commands with complete payloads.
Parent commands are acknowledged before dependent writes, and transient failures remain retryable.
Finance snapshots are authorized per viewer, paginated, validated before local replacement and
encrypted with the device key. Current membership is read consistently. Snapshot tokens allow an
unchanged response when no ordinary task policy needs refreshing, and include the actor's current membership/role, so revocation still
invalidates the cache. Removed permissions purge local projections, dependent outbox work, indexed
plaintext and tagged Finance conflicts. General content feeds do not deliver historical Finance
payloads; current authorized Finance snapshots are the hydration boundary.

### Atomic ordinary task persistence

A Finance task command now commits the ordinary task, validated revision, ordinary mutation receipt,
reporting/work-view projections, task audience feeds and Finance-only relationship in one database
transaction. The assignee must still be active at commit. Ordinary task API reads use the same
canonical task record. Finance metadata stays outside ordinary task feeds, and task-link snapshots
require both current task access and Finance access.

## Other functional gaps to complete

- `updateManualTransaction` and `completeSimplefinAccountIdentity` have service implementations but
  no registered HTTP routes. The corresponding correction and incomplete-provider-identity flows
  cannot be completed through the public API.
- Account and transaction removal components currently render impact previews without a final
  confirmation action. The secured deletion endpoints exist, but these UI journeys stop early.
- The router recognizes account/transaction/merchant Finance deep links, while the landing page
  initializes only the budget deep-link view. Direct links and browser navigation need end-to-end
  coverage rather than assuming route parsing alone opens the requested record.
- The account-transaction endpoint and merchant activity endpoint still return unbounded arrays.
  `listFinanceTransactionPage` is not used by the route. A large imported account can exceed API
  response/memory limits; wire pagination together with client consumption before claiming the
  large-account acceptance target.
- Several Finance dashboard metrics have no corresponding producer in the live services. Alarms
  and the backup selection alone do not establish operational coverage for unpersisted data.

## Fixed findings

| Area                   | Failure before this pass                                                                                               | Result                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| API routing            | API Gateway supplies a catch-all route key, while the registry expected an exact template                              | Matches the real path and extracts decoded parameters                                                       |
| Request handling       | Base64 bodies were parsed as JSON text; request bodies/receipt keys had no local bound                                 | Decodes bodies and bounds request size and idempotency key length                                           |
| Mutation replay        | Receipts were returned before fresh access checks                                                                      | Rechecks current account, group, budget-item, transaction and connection permissions for cached values      |
| Matching/task links    | A group member could reference an item that also involves an inaccessible private account                              | Checks every related account before suggesting, allocating or revealing a link                              |
| Identity completion    | Permission to assign a new account did not prove access to the original provider connection                            | Requires original-connection and destination-scope access                                                   |
| Manual balances        | Moving a transaction across the balance date kept the old contribution; provisional entries changed provider balances  | Applies safe integer deltas using both old/new dates; provider balances stay authoritative                  |
| Balance history        | An older snapshot could move the effective baseline date backwards; archived transactions were counted                 | Keeps the latest baseline and excludes inactive contributions                                               |
| Provider refresh       | Existing account balances and repeated transaction identities were never updated                                       | Updates snapshots/effective values while preserving classifications and immutable entry evidence            |
| Provider identity      | Source locks were keyed by remote provider IDs rather than the local Bridge connection                                 | Isolates otherwise identical provider identities across Bridge connections                                  |
| Refresh lifecycle      | Completed deliveries repeated work, active leases could run twice, windows repeatedly requested the initial history    | Makes terminal delivery idempotent, checks job/connection binding and leases, advances the five-day overlap |
| Import failure         | Raw errors could enter Lambda logs; a connection revoked during a request could be resurrected                         | Throws sanitized classifications and checks current connection state before importing/updating              |
| Streaming bounds       | Provider bodies were fully buffered before enforcing their byte limit                                                  | Counts streamed bytes and cancels oversized bodies                                                          |
| CSV retry/finalization | Failed review claimed a file receipt; changed chunk contents replayed silently; final chunks could finish out of order | Claims receipts after review, checks chunk content, tracks missing chunks and recoverable invalid dates     |
| CSV UI                 | Excluded duplicates were still submitted and large online files exceeded the 100-row endpoint limit                    | Applies include/exclude decisions and sends bounded chunks                                                  |
| Browser revocation     | Pending optimistic state could override a tombstone; in-flight indexing could repopulate removed accounts              | Deletes dependent pending mutations and stops stale indexing generations                                    |
| Catalog deletion       | Confirmation skipped creator/admin checks for permanent deletion and did not recheck new references                    | Rechecks permissions/references immediately before mutation; preserves referenced records                   |
| Money entry            | Floating-point multiplication rejected ordinary values such as 0.29                                                    | Uses exact decimal parsing with currency precision                                                          |
| Save feedback          | Failed budget-item requests were described as saved locally; account linking raced subsequent edits                    | Rolls back failed optimistic items and awaits account linking/refreshes the version                         |
| Cleanup                | Allocation code contained an impossible condition; CSV workers could outlive their component/file selection            | Removes the dead branch and terminates or supersedes stale workers                                          |

## Validation

The focused audit added 34 cases; production wiring adds another 24 SDK/client integration cases.
Required unit/integration validation now contains **410 files / 1,330 tests**. Browser quick-suite membership remains **31 tests**; no workflow
or browser-project expansion was made. The hosted target remains ten minutes with the existing
fifteen-minute safety timeout.

Before this pass, `/usr/bin/time -p npm test` passed in **44.80 seconds** and
`/usr/bin/time -p npm run test:e2e:quick` passed in **25.91 seconds**. Final after-change timings
are recorded in the implementation validation notes. The hosted PR check must also be inspected
on the pushed audit-fix commit; passing local tests alone does not establish its duration.

These checks test the fixed services and browser behaviors. They are not a deployed penetration
test or a substitute for the remaining production integration and two-user acceptance work.
