# PR 84 full code audit

Audit scope: Finance domain rules, API handlers/services, provider and CSV ingestion, browser
components/cache/search, contracts, infrastructure and operational integration in PR 84, compared
with base `17fc0ee4d08cb6d9c3754e48e8445a5d4e737576`. This extends the earlier security audit.

**Disposition: the focused defects below are fixed, but the PR is not ready to release. Three
production integration blockers remain.** Passing mock-backed and service tests does not establish
that those integrations work in production. Completing them requires the larger implementation
scope described below, rather than a cosmetic cleanup.

## Remaining release blockers

### P1 — Production Finance state is not durable or shared with the import worker

`apps/api/src/finance/handler.ts` and `apps/api/src/finance/import-handler.ts` each instantiate a
separate `FinanceMemoryRepository`. The live paths do not call the DynamoDB persistence helpers.
API instances can return different data, cold starts lose state, and the import worker cannot
load a connection/job created in the API process. This also means the infrastructure backup
selection cannot back up the Finance data users entered in those processes. The corrected
service-level lease/version checks still need conditional durable writes when this is wired up.

Required completion: implement the durable repository and transactional unit of work; use it in
both entry points; persist source identities, mutation receipts, CSV row receipts, reconciliation
account provenance, and feed changes; verify cold-start reads, concurrent writes, API-to-worker
handoff, and a real restore. Do not resolve this with a serialized global in-memory snapshot.

### P1 — Offline Finance synchronization has helpers but no end-to-end dispatcher

The browser can enqueue Finance commands, but `apps/web/src/sync/sync-engine.ts` does not hydrate
Finance entities and rejects unsupported synchronized entity types. The server's production
`apps/api/src/sync/handler.ts` has no Finance mutation/bootstrap dispatch; unhandled non-task
mutations are rejected. `createFinanceSyncHandler`, hydration ordering and feed helpers are not
connected to these paths. Queued edits therefore cannot complete synchronization, and the local
Finance search/task-link stores are not populated by the production sync path.

Required completion: wire authorized Finance mutation dispatch, bootstrap and pull projections,
client decryption/hydration, receipt acknowledgements, conflicts and audience revocation. Verify
an actual browser outbox edit against the API and a second client, including membership removal.
CSV outbox commands must include every field required by the server contract, not just rows.

### P1 — Financial task creation does not create an ordinary persisted task

`apps/api/src/finance/task-link-service.ts` updates `repository.tasks` and appends in-memory feed
changes. It never calls `buildFinancialTaskCreationTransaction` or the ordinary task repository.
A successful Finance response therefore does not make the task available through normal task
reads/synchronization. The ordinary task and Finance-only relationship must commit atomically.

Required completion: use the shared task persistence/revision/feed transaction, retain separate
audiences, validate the assignee through the normal task policy, and test creation through Finance
followed by an ordinary task API read and a task-only viewer's sync pull.

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

Added 34 regression cases across integration, browser-component, local-cache and search tests.
Required unit/integration suite grows from **405 files / 1,272 tests** to
**408 files / 1,306 tests**. Browser quick-suite membership remains **31 tests**; no workflow
or browser-project expansion was made. The hosted target remains ten minutes with the existing
fifteen-minute safety timeout.

Before this pass, `/usr/bin/time -p npm test` passed in **45.13 seconds** and
`/usr/bin/time -p npm run test:e2e:quick` passed in **27.72 seconds**. Final after-change timings
are recorded in the implementation validation notes. The hosted PR check must also be inspected
on the pushed audit-fix commit; passing local tests alone does not establish its duration.

These checks test the fixed services and browser behaviors. They are not a deployed penetration
test or a substitute for the remaining production integration and two-user acceptance work.
