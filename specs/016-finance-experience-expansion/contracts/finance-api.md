# Finance HTTP Contract Additions

Design contract, not implemented endpoints. Base path `/api/v1`; extend existing Finance contracts rather than replacing unchanged account/import/budget APIs. Auth operations route to the existing auth function. Finance operations route to Finance; receipt bytes route to the attachment function with explicit Finance parent handling. Existing browser clients should use shared Zod schemas generated/maintained with these contracts during implementation.

## Common rules

- Existing device-bound authenticated session and mutation-security checks apply. Mutations require `x-csrf-token`, a stable `x-client-mutation-id`, and expectedVersion for updates. Replays recheck current access before returning an earlier result. Grant/request bodies are never logged.
- Protected Finance operations additionally require an opaque `x-finance-unlock` grant when the actor's current `requirePin` is true. Grant is checked against current user/session epoch/security revision. No administrative role bypass.
- Default page size 50, maximum 200; opaque cursor binds user, authorized scope, filter fingerprint, ordering and projection revision. Tampered or mismatched cursor returns 400; expired projection cursor returns 409 with a restart instruction.
- Success reads use 200, creations 201, pending check/rebuild 202, successful no-content removal 204. Errors use the existing safe problem envelope `{code,message,correlationId,retryAfter?}`. 400 invalid fields, 401 invalid session, 403 `finance_locked`, 404 absent/inaccessible source, 409 version/uniqueness/relationship conflict, 413 oversized file, 415 unsupported content, 422 failed content policy, 429 throttled with Retry-After. Errors do not leak inaccessible targets.
- Paged query envelope: `{items,nextCursor?,asOf,projectionRevision,complete,rowsState,aggregateState,queryId?,coverage:{examined,scopeComplete},totalCount?,totalsByCurrency?}`. `rowsState` is searching/ready/confirmed-empty; `aggregateState` is pending/exact/failed. A queryId continues automatic bounded calculation independently of row pagination. Counts/totals are omitted/null until exact, or have an explicit partial label. An empty page with nextCursor is not proof of zero matching records. Match count and display-page count are distinct.
- Money fields are integer minor units. Positive eligible expense magnitude is used in spending results while transactions preserve signed debit/credit semantics. Date filters use named local calendar basis and inclusive endpoints. Filter dimensions combine AND, selected values within a dimension OR; budget/category/subcategory must match the same allocation.

## Administrator ownership and membership clarification — 2026-11-09

An active application administrator may use personally owned Finance and actual
active member-group Finance. Apply the ordinary group-role restrictions and the
same canonical session/PIN requirements, including the existing administrator MFA
prerequisite. The application role supplies no foreign-owner or nonmember-group
audience, destructive group-role elevation, private-task override through Finance,
or operation on another person's PIN. This applies to legacy repository loading,
bounded replay/query paths, source reads, protected delivery and cache proofs.
Ordinary application administrative task auditing and catalogue maintenance retain
their existing separate policies. No HTTP envelope or Apple-facing contract changes.

Budget directory/detail retained views now request and merge existing source proofs,
recheck the retained snapshot before opening or saving, and replace write responses
with protected canonical reads. Lock/owner replacement disposes the snapshot and
clears dependent views and drafts. This is partial T029 coverage; reusable-item,
receipt and other retained subviews still require their own complete audit.

## Self-only Finance security

These endpoints accept no targetUserId. Caller's canonical authenticated identity is the target. Management requires current password online and strict rate limits; the existing password-recovery PIN is not an alternate credential.

| Method / path | Request | Success |
| --- | --- | --- |
| GET `/auth/finance-security` | None | `{requirePin,enrolled,revision}`; never verifier/hash |
| PUT `/auth/finance-security` | `{currentPassword,newPin,confirmPin,requirePin,expectedRevision}` | Sanitized preference; enrollment/change/reset replaces verifier, increments revision and revokes grants |
| PATCH `/auth/finance-security` | `{currentPassword,requirePin,expectedRevision}` | Sanitized preference; enabling requires enrolled PIN, increments revision and revokes grants |
| POST `/auth/finance-unlocks` | `{pin,tabNonce}` | `{grant,expiresAt,securityRevision,sessionEpoch,offlineEnrollment?}`; enrollment material only to this verified device/session |
| DELETE `/auth/finance-unlocks/current` | Grant header | 204; idempotent visit revocation |

PIN is 6–32 decimal digits and confirmation must match. Old PIN is not required for password-verified replacement. No operation returns another user's PIN settings. Grant lifetime is at most 30 minutes and at most existing session lifetime; expiry/relock preserves unsaved form input. Both security and unlock responses use `Cache-Control: no-store`. Auth dependency outages fail closed. Password reset keeps the Finance verifier but invalidates grants through sessionEpoch.

## Existing financial records

| Method / path | Contract change |
| --- | --- |
| GET `/finance/accounts/{accountId}/transactions` | Bounded account table, filters below; no full-scope hydration |
| POST `/finance/accounts/{accountId}/transactions` | Existing manual creation, explicitly available for every editable account; extend optional checkNumber/paymentType/subcategory fields. SimpleFIN result remains provisional |
| GET `/finance/transactions` | Multi-account table, same filters and query envelope |
| GET `/finance/transactions/{transactionId}` | Detail with authorized allocations/budget links, receipt metadata and task links; no inaccessible linked names/counts |
| PATCH `/finance/transactions/{transactionId}` | Versioned user-owned metadata correction; source ownership and allocations remain validated |
| PATCH `/finance/merchants/{merchantId}` | `{name?,city?,region?,financeCategoryId?,expectedVersion}`; creator/admin rules and canonical collision detection |
| GET/POST `/finance/categories` | Existing list/create plus optional parentId; one child level only |
| PATCH `/finance/categories/{categoryId}` | Existing edit plus explicit parent change; referenced history cannot be silently rewritten |
| POST `/finance/budgets/{budgetId}/deactivate` | `{expectedVersion}` sets activity inactive, preserving existing associations, flags/history and independent closure/archive |
| POST `/finance/budgets/{budgetId}/reactivate` | `{expectedVersion}` sets activity active only; never clears closedAt/archive/reconciliation |
| POST `/finance/budgets/{budgetId}/close` | `{expectedVersion}` sets closedAt without changing reconciliation history |
| POST `/finance/budgets/{budgetId}/reopen` | `{expectedVersion}` clears closedAt through a new revision |

Transaction query fields: `accountIds[]`, `text`, `date`, or `dateFrom/dateTo`; `timeZone` (validated IANA calendar basis, default current browser zone); `amount` or `amountMin/amountMax` (signed minor units plus currency when account scope spans currencies); `accountName`; `checkNumber`; `limit`; `cursor`. Text matches description, payee, memo and merchant without case sensitivity. Account name matches friendly/source/organization display identity without broadening a single-account endpoint. Date versus range and exact amount versus range are mutually exclusive modes. A reversed interval returns 400. Check number is exact text after trimming, preserving leading zeros. Ordering is descending effective transaction timestamp, then transaction ID.

Budget ordinary confirmed creation MUST save status active and activity active immediately. Existing versioned budget PATCH supports an explicit Save as active for migrated legacy drafts after normal validation; no migration silently activates them. Deactivate/reactivate is a separate versioned, idempotent current-member action; active means eligible only if not closed/archived/tombstoned. Existing linked expenses remain reviewable/reschedulable/fulfillable after deactivation. Budget form choices use existing `/groups` plus active membership, not a new Finance group registry. Show display names; accepting an empty account selection for a valid group is required. Account-less budgets are not a source of fabricated account balances.

## Linked expense refunds

| Method / path | Request / response |
| --- | --- |
| GET `/finance/transactions/{refundId}/refund-relationship` | Authorized relationship, confirmed allocations, source/capacity revisions and valid/awaiting-posting/needs-review state |
| PUT `/finance/transactions/{refundId}/refund-relationship` | `{originalExpenseTransactionId,linkedAmountMinor,refundedAllocations:[{originalAllocationId,amountMinor}],expectedRefundVersion,expectedOriginalVersion,expectedRelationshipVersion?,expectedCreditCapacityVersion,expectedAllocationCapacityVersions}` → canonical relationship and updated capacity revisions |
| DELETE `/finance/transactions/{refundId}/refund-relationship` | `{expectedRelationshipVersion,expectedCreditCapacityVersion,expectedAllocationCapacityVersions}` plus common mutation headers → tombstoned relationship and updated revisions |

Exactly one active original per refund credit; several refunds may reference an original expense. Full refunds offer original budget/category/subcategory defaults; partial split refunds require confirmed original allocation amounts summing to the linked amount. An explicit unallocated slice is allowed without fabricated classifications. Same currency is required; original and refund accounts may differ. Reserve only available credit and original-allocation refundable principal; preserve excess credit unlinked. Reject self/cycles, transfer/income originals, changed source/capacity versions and unauthorized source associations. Current refund edit permission and original/association read access are required on write and preview; hidden relationships have safe not-found behavior. Recheck access on replay/read and never put original private references in ordinary account/task feeds.

Only valid posted linked amounts reduce Spend on the refund transaction's own received date/account/merchant. Pending/provisional links remain proposals with zero current contribution. Linking/correcting/removing preserves source amounts/dates, versions and history; recompute prior contributions exactly once. User corrections conflicting with claimed capacity return 409; provider corrections are retained and mark incompatible relationships for review with stale/incomplete projection state. Confirmed association snapshots do not silently change on original recategorization. These operations are also supported as protected semantic offline proposals; server capacity/access validation decides final acceptance.

## Upcoming Expenses

| Method / path | Request / response |
| --- | --- |
| GET `/finance/upcoming-expenses` | Filters accountIds/groupIds/budgetIds, state active/overdue/paid/cancelled, due date bounds; ascending dueDate/ID by default; query envelope |
| POST `/finance/upcoming-expenses` | `{id?,description,expectedAmountMinor,dueDate,entryContext:{enteredAt,localDate,timeZone},accountId,budgetId,groupId,plannedSource?}` → full authorized record with derived fulfilled/remaining/state |
| GET `/finance/upcoming-expenses/{expenseId}` | Record, authorized fulfillment and task links; independently check required source intersection |
| PATCH `/finance/upcoming-expenses/{expenseId}` | Editable fields plus expectedVersion; dueDate edits include dateChangeContext and keep original entryContext immutable; changing account/currency with active claims returns 409 |
| POST `/finance/upcoming-expenses/{expenseId}/cancel` | `{expectedVersion}` → cancelled record/history, no payment/task cascade |
| POST `/finance/upcoming-expenses/{expenseId}/reopen` | `{expectedVersion,dueDate,dateChangeContext}` → active record, validated date/relationships; preserve original entryContext |
| POST `/finance/upcoming-expenses/{expenseId}/fulfillments` | `{transactionId,amountMinor,expectedExpenseVersion,expectedTransactionVersion,expectedClaimVersion}` → record + fulfillment state; conditional capacity ledger |
| DELETE `/finance/upcoming-expenses/{expenseId}/fulfillments/{fulfillmentId}` | Version preconditions in body/header contract → tombstone + recalculated expense state |

All four requested references/date and immutable original entryContext are required. Currency derives from account. Validate ISO enteredAt/localDate and IANA timeZone with localDate consistent with enteredAt in that zone, and require dueDate > entryContext.localDate. Never compare original creation to reconnect/server today. Valid delayed offline creation keeps its date and becomes overdue if unpaid; retries retain the original context/mutation ID and ordinary field edits/fulfillment do not re-run future-date creation checks. An explicit reschedule supplies its own dateChangeContext and records that event without rewriting creation context. Browser/server time-zone differences, travel and DST never shift the date-only dueDate. These are user-supplied calendar semantics, not proof of historical authorization: current permissions/versions still apply. Inactive/closed/incompatible budgets are rejected for new or reassigned selection; an existing unchanged association remains manageable after deactivation/closure. A group-owned account from another group returns a safe field error. A valid personally owned account is allowed only under existing budget access rules; no sharing expansion occurs. Actual spending only changes through accepted posted transactions. Link pending/provisional payment as awaiting posting, never as paid. A claim conflict returns 409 without partially fulfilling another expense.

## Task relationships

| Method / path | Contract |
| --- | --- |
| POST `/finance/transactions/{transactionId}/tasks` | Confirmed ordinary task form fields + mutation ID → `{task,link}` or explicit `{task,linkStatus:pending,retryToken}` |
| POST `/finance/upcoming-expenses/{expenseId}/tasks` | Same, defaults generic editable title and optional suggested dueDate |
| GET `/tasks/{taskId}/finance-links` | Array of links and authorized display projections; no inaccessible link counts |
| POST `/tasks/{taskId}/finance-links` | `{targetType,targetId,expectedTaskVersion}`; source and task checks; unique task-target pair |
| DELETE `/tasks/{taskId}/finance-links/{linkId}` | Expected link version; tombstone only, no financial side effects |
| POST `/finance/task-links/query` | `{taskIds:[...max50]}` read-only batch projection for visible rows; CSRF and grant since POST; authorization independently per task/target |

Task creation/update must additionally accept optional `financeLinkSelections` referencing accessible targets as part of its confirmed semantic command. Existing budget-item task action remains compatible. Pending link retry references the same saved task and never repeats task creation. Ordinary task list/sync/export responses contain no new Finance target fields. Reverse Finance detail projections return only tasks the viewer may read. Empty and denied results avoid distinguishing hidden financial targets.

## Dashboard and report projections

| Method / path | Contract |
| --- | --- |
| GET `/finance/dashboard-preferences` | Caller-owned flags/settings only |
| PUT `/finance/dashboard-preferences/{kind}/{targetId}` | `{included,expectedVersion?}`; target must be currently accessible |
| PATCH `/finance/dashboard-preferences` | `{upcomingCount:5|10|15|20,expectedVersion}` |
| GET `/finance/dashboard` | Independent widget states `{status,data?,asOf,complete,error?}`; flagged balances/open budgets; next N canonical upcoming expenses; separate overdue section; latest ten merchant/category transactions |
| GET `/finance/spend-trends` | `accountIds[]`, `period:month|quarter|year`, `timeZone`; latest 12/8/5 periods including labeled current partial period; distinct currency series plus readable values |
| GET `/finance/reports/spend` | date/date range, timeZone, budgetIds/accountIds/merchantIds/categoryIds/subcategoryIds, limit/cursor; matching rows, exact or explicitly pending/partial totals per currency |
| POST `/finance/budgets/{budgetId}/forecast` | `method`, `timeZone`, optional paired inclusive dates, and historical-only `includeNonBudgetedHistory`. Returns one model, its period, source revision, coverage, and currency-separated actual and projected flows. |

The forecast uses the existing Finance session, PIN and mutation request guards.
The computation is read-only and has no retained response cache or export.
Known-plan and historical scenarios are separate. Historical non-budgeted data
requires opt-in and current access to a linked account. Both scenarios keep
actuals budget-assigned. Bounded reads can yield partial coverage or insufficient
history. The result is withheld if a relevant source or the active visit changes.

Spend defaults current calendar month/all accessible accounts. Budget widgets supply planned, spent, remaining, percentUsed (`null` when planned=0), effective period and currency; negative remaining is overspent. Parent category selections include historical children under that parent association. Receipt count/amount indicators remain access filtered. No export endpoint is added.

Actual matching rows or a confirmed full-scope empty state MUST be available at p95 within two seconds for the specified cold/warm workloads. A `complete=false` response includes progress/coverage, but progress/placeholder/empty intermediate pages do not satisfy row readiness. Exact connected transaction-list and Spend report matching counts/totals MUST complete automatically at p95 within ten seconds, with progress within one second; the user must not have to page through every result to trigger totals. Reference report completion is a cursor-consistent projection revision; if source changes invalidate the revision, client restarts or shows labeled stale results. Authorization must be rechecked even for prebuilt facts/summaries.

### Automatic query completion

`GET /finance/queries/{queryId}` returns the same source-authorized query scope with current rows/aggregate states, coverage/revision, exact counts/totals only when ready, and safe failure/restart instructions. The browser begins bounded status polling automatically when a queryId is returned; protected server read steps may run asynchronously in the existing Finance function. Mutation/read jobs are distinguished by trusted invocation envelope, never by a user-controlled bypass flag. At most five source partitions execute concurrently and each query step examines at most 1,000 facts; selective indexes and common summaries avoid full sequential scope hydration. Query checkpoints/results are owner-only, expire after 15 minutes, bind filter fingerprint/account and refund-source version vector and are invalidated on source authorization/revision change. Only an authenticated currently unlocked read may return data; background computation never grants access. Both deadlines remain hard acceptance gates; failure cannot be converted into a passing progress-only result. Offline queries show cached scope and cannot claim exact totals for missing records.

## Receipts

| Method / path | Contract |
| --- | --- |
| POST `/finance/transactions/{transactionId}/receipts/uploads` | `{filename,mediaType,sizeBytes,checksumSha256,clientReceiptId}` → 201 upload session with signed PUT constraints, required headers, expiry and receipt checking state |
| POST `/finance/receipts/{receiptId}/complete` | Exact uploadSessionId, objectVersionId, ETag; idempotent → checking or available only after both checks |
| GET `/finance/receipts/{receiptId}` | Authorized metadata/status, immutable content ETag/checksum and size when available |
| POST `/finance/receipts/{receiptId}/retry` | Existing failed/checking intent, expectedVersion; returns same receipt identity |
| DELETE `/finance/receipts/{receiptId}/pending` | Cancel incomplete intent; never deletes an existing available receipt |
| GET `/finance/receipts` | Date/date-range (transaction date), budgetIds/categoryIds/subcategoryIds/merchantIds, limit/cursor; deduplicated receipt metadata and safe transaction destination |
| GET `/finance/receipts/{receiptId}/content` | Same-origin authenticated binary range; never returns an S3 GET URL |

Receipt content requires one `Range: bytes=start-end` with raw range ≤1,048,576 bytes and `If-Match` from available metadata. Invalid/multiple/oversized ranges return 416; changed ETag returns 412. Valid response 206 includes `Content-Range`, `Content-Length`, `Accept-Ranges: bytes`, stable ETag, fixed approved Content-Type, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`. Read the exact clean/policy-approved S3 version. Every chunk independently checks current permissions/security revision; abort on any denial. Assemble at most 10,000,000 bytes and verify SHA-256 before a locally created Blob preview/download. Lock/revocation aborts pending requests and revokes Blob URLs. Client saves original bytes under a sanitized recognizable filename.

Signed PUT sessions are upload-only, checksum-bound, expiring and limited to a new receipt blob; upload completion checks current edit/unlock rights and never publishes metadata from an abandoned upload. Generic attachment metadata/download/retry/completion routes must enforce the same Finance parent policy. Finance receipt objects are never reachable through the generic profile-media CDN origin. Office preview is a labeled download fallback; PDF/image preview does not execute active content. Content scanners must inspect actual file structure, not MIME alone.


### Local foundation implementation: targeted transaction evidence

Additive GET `/finance/transactions/{id}` point-reads the current canonical row
and its authorized parent graph using existing locators, before any legacy scope
hydration. Missing locator/source, withdrawn source or inaccessible parent returns
no Finance body; there is no scan/history fallback. IDs support ULIDs and legacy
CSV `batchULID:ordinal` (1..50,000, matching canonical CSV metadata). Session/PIN
checks apply independently of optional snapshot support. `x-finance-cache-protocol:
1` opts into the existing opaque proof response header and current source checks.
GET `/finance/merchants/{id}` and `/finance/tasks/{id}/link` also opt in; the task
response's final canonical task authority is included in private proof dependencies.
Legacy responses stay unchanged. Post-save web views point-read affected rows
(two for a transfer), merge proof evidence without advancing ordinary/Finance
cursors, and derive retained views only from same-controller/same-generation
verified contexts. No mutation-response DTO alone becomes trusted cached data.
Other budget/reconciliation routes still require explicit proof integration.


### Local protected feed continuation (November 9)

The v8 sync response adds `financeHasMore`. True indicates that another raw
feed query is needed, including ordinary-only pages traversed by the independent
Finance cursor; it does not promise additional authorized Finance records.
Production uses the SDK continuation metadata rather than inferring exhaustion
from fewer than 200 returned rows. SDK keys remain server-private. Locked,
unsupported-source and refresh-required responses withhold the hint (false) and
preserve the last acknowledged Finance cursor while ordinary sync progresses.
Existing arrays/cursors and legacy DTO fields retain their shape.

The PWA runs at most five sequential protected pages per foreground sync cycle,
committing each page's encrypted records/proof/Finance cursor before requesting
the next one. A continuation without cursor progress, a malformed hint, failed
request, lock or controller replacement stops the burst. A missing hint from an
older server permits one page with continuation unknown. There is no speculative
idle follow-up, new polling timer, scan or historical-bootstrap fallback. A feed
frontier is not proof that all retained Finance history has been bootstrapped.


### Protected current-state bootstrap (local foundation, November 12)

A fresh v8 PWA sends `financeCacheProtocol:1` and
`financeBootstrapProtocol:1` to the existing POST `/sync/pull` route. The opt-in
response contains `financeBootstrap:{records,frontier,complete,nextCursor?}` and
the existing current cache proof. Legacy/Apple requests and response DTOs are
unchanged. The route requires the current user/session/tab/PIN gate and derives
catalogue, owner and active-group partitions server-side; the client cannot name
a partition or account to widen access.

The server captures strongly consistent canonical scope revisions and feed
counters once, then returns at most 100 current canonical rows from one authorized
partition per page. It uses direct partition `Query`, never table Scan, filtered
scope fallback, history replay or Lambda whole-scope hydration. The encrypted,
15-minute continuation is bound to the user, exact partition set, all captured
revisions, feed frontier and exclusive key. Every page checks all revisions before
and after its query and rechecks source/membership/task authority. A canonical,
membership or task-authority change returns a restart requirement rather than
mixing snapshots. At most 64 proof scopes are supported, matching the existing
cache-proof closure.

The PWA encrypts each page and atomically commits its cache proof plus opaque
bootstrap continuation in IndexedDB. The Finance delivery cursor remains unchanged
until `complete:true`; that final transaction clears the bootstrap continuation and
advances the independent Finance cursor to the captured frontier. Subsequent
protected pulls deliver changes after that frontier. Pending encrypted outbox
records win collisions and are never removed by snapshot pages. A restart-required,
expired or invalid continuation purges only downloaded cache/proof/checkpoint data,
retains pending intent and begins again. No new AWS resource, index, migration,
polling timer or Apple field is introduced.


### Protected reusable creation replay (local foundation)

Sync v8 now accepts `financeReusableItem` / `create` with baseVersion0 and a stable
ULID entity ID. Business fields use the existing strict reusable-item input schema.
Optional local projection fields are accepted only when consistent: id matches the
entity, version1, status active, and creator pending/current principal. They are
not forwarded as authoritative server fields. Unknown fields or inconsistent local
metadata are rejected; unsupported operations remain retry/pending.

The sync adapter invokes the existing protected Finance handler through the
header-gated bridge POST `/finance/reusable-items/{reusableItemId}` with
`x-finance-sync-replay: reusable-create-v1`. This header selects the bounded loader
and exact-intent receipt; it does not replace authentication, mutation security,
current memberships or Finance unlock checks. The bridge requires this opt-in;
ordinary POST `/finance/reusable-items` keeps its original server-generated IDs
and request/response schema. The existing gateway proxy/function/IAM are reused.

Replay point-reads the authorized group, named account parents, active catalogue
sources and their reference counters; there is no history or whole-catalogue
fallback. Missing locator evidence stays retryable. Foreign pointers are denied
before foreign metadata/body reads. The canonical record, locator, reference-count
updates, feed and fingerprinted receipt commit together under existing conditional
scope revisions. An exact retry acknowledges the original creation; changed intent
or a pre-existing conflicting identity cannot create a second item. Sync outcomes
contain IDs/status/version and safe problems, never a private response model.

After a successful creation acknowledgement, the PWA atomically removes only the
unverified version1 draft projection if no later queued edit or verified server
projection exists. It then receives the canonical copy through protected delivery;
an acknowledgement response alone never grants a cache generation. Conflicts,
newer drafts, other queued edits and unrelated receipt bytes are retained, and a
lock aborts the acknowledgement transaction. This is local proof initialization,
not completion of the deferred full-history bootstrap or other replay families.


For a replay into a scope with missing metadata, a known canonical row holds the
operation pending for trusted repair. Otherwise one strongly consistent key-only
Query (`PK = :pk`, `Limit:1`, projection `PK, SK`) checks the namespace. Any row,
surviving publication state or continuation also keeps replay retryable without
writes. Only an empty namespace may initialize metadata, fenced by conditional
META creation. This is not a history fallback or automatic metadata repair.
Legacy state remains unchanged and the migration remains unrun. The conditional
query is additional to the point-Get formula and must be included in metered cost
acceptance. Existing-metadata replay fixtures use zero Finance history queries.


Client-selected reusable IDs are also fenced against the other supported Finance
source-locator namespaces in the canonical transaction. At this checkpoint these
are13 additional negative condition checks for a new creation; their transactional
read cost is separate from the point-Get formula. A known cross-type ID conflicts
without foreign body reads or any partial canonical/counter/feed writes. Exact
saved retries do not create or charge those checks again. No new registry table,
namespace migration or IAM permission was introduced.


### Protected budget creation replay (local foundation, November 12)

Sync v8 accepts `financeBudget` / `create` with baseVersion0 and the queued
budget's stable ULID. The payload uses the existing strict budget input schema;
optional local `id` and `version` metadata must match the entity and version1.
Archived creation and unknown fields are rejected. The adapter invokes replay-only
POST `/finance/budgets/{budgetId}` with
`x-finance-sync-replay: budget-create-v1`. Direct requests to that path are
rejected, while ordinary POST `/finance/budgets` continues to generate its ID on
the server with the existing contract.

The targeted loader verifies current group edit access, reads group metadata,
the exact budget locator and at most the exact canonical retry row. It does not
hydrate group Finance history. A foreign locator is denied before any foreign
scope read; incomplete locator/row evidence remains retryable. When metadata is
absent, the same strongly consistent key-only `Limit:1` namespace proof described
above is required before initializing an empty scope. The stable budget ID is
fenced in the `budgets` locator namespace by the canonical transaction.

The canonical budget, locator, protected feed change and fingerprinted receipt
commit with the existing scope revision fence. An exact retry returns version1
without another write. A changed intent conflicts, and sync results never echo
the protected budget model. This adds no route, function, table, index, IAM grant,
migration or Apple DTO. Other creation/link/item/archive replay families remain
held until their own bounded source loaders and validation exist.

When the retained budget source is still trusted but the PWA is offline, a budget
form with no selected account links may generate the stable ULID and atomically
encrypt a version1 draft plus its create intent. After exact acknowledgement, the
client removes only that unverified draft and queue entry in one transaction; a
later edit, conflict, verified projection or lock preserves it. The canonical copy
still arrives through protected delivery. If the form has selected accounts, the
client keeps the form and selections and requires reconnection because account-link
replay is not yet implemented; it never silently drops those choices.
