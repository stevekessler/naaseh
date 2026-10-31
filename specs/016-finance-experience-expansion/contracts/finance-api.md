# Finance HTTP Contract Additions

Design contract, not implemented endpoints. Base path `/api/v1`; extend existing Finance contracts rather than replacing unchanged account/import/budget APIs. Auth operations route to the existing auth function. Finance operations route to Finance; receipt bytes route to the attachment function with explicit Finance parent handling. Existing browser clients should use shared Zod schemas generated/maintained with these contracts during implementation.

## Common rules

- Existing device-bound authenticated session and mutation-security checks apply. Mutations require `x-csrf-token`, a stable `x-client-mutation-id`, and expectedVersion for updates. Replays recheck current access before returning an earlier result. Grant/request bodies are never logged.
- Protected Finance operations additionally require an opaque `x-finance-unlock` grant when the actor's current `requirePin` is true. Grant is checked against current user/session epoch/security revision. No administrative role bypass.
- Default page size 50, maximum 200; opaque cursor binds user, authorized scope, filter fingerprint, ordering and projection revision. Tampered or mismatched cursor returns 400; expired projection cursor returns 409 with a restart instruction.
- Success reads use 200, creations 201, pending check/rebuild 202, successful no-content removal 204. Errors use the existing safe problem envelope `{code,message,correlationId,retryAfter?}`. 400 invalid fields, 401 invalid session, 403 `finance_locked`, 404 absent/inaccessible source, 409 version/uniqueness/relationship conflict, 413 oversized file, 415 unsupported content, 422 failed content policy, 429 throttled with Retry-After. Errors do not leak inaccessible targets.
- Paged query envelope: `{items,nextCursor?,asOf,projectionRevision,complete,rowsState,aggregateState,queryId?,coverage:{examined,scopeComplete},totalCount?,totalsByCurrency?}`. `rowsState` is searching/ready/confirmed-empty; `aggregateState` is pending/exact/failed. A queryId continues automatic bounded calculation independently of row pagination. Counts/totals are omitted/null until exact, or have an explicit partial label. An empty page with nextCursor is not proof of zero matching records. Match count and display-page count are distinct.
- Money fields are integer minor units. Positive eligible expense magnitude is used in spending results while transactions preserve signed debit/credit semantics. Date filters use named local calendar basis and inclusive endpoints. Filter dimensions combine AND, selected values within a dimension OR; budget/category/subcategory must match the same allocation.

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
