# Phase 1 Data Model

Companion to [research.md](research.md) and [contracts/finance-api.md](contracts/finance-api.md). These are proposed additive changes, not implemented migrations.

## Shared invariants

All entity identifiers remain ULIDs; user identifiers retain existing identity format. Money is a safe integer in minor units, with explicit ISO currency/exponent and no implicit conversion. Mutable records have `version`, `createdAt`, `updatedAt`, creator where applicable, expected-version writes, immutable revisions and retry receipts. Date-only due dates are `YYYY-MM-DD`; transaction instants retain their original timestamp. Reporting stores both instant and calendar basis so local-day/month boundaries do not silently change semantics. All source references resolve canonical transaction aliases after provider reconciliation. Foundation shared `spend.ts` predicates determine eligible expense/refund slices, same-allocation matches and checked integer currency sums before any projection/widget/Worker consumes them; legacy budget aggregate types must expose posting/provisional state on their dashboard path.

Authorization is a predicate, not a new grant encoded in a relationship: account scope AND any required active group membership AND referenced budget access AND task access where relevant. Administrators do not gain private-account access solely from their role. Catalog edit rights remain creator/admin.

## 1. FinanceSecurityPreference (server-private)

| Field | Meaning / validation |
| --- | --- |
| userId | Acting user only; no editable target user |
| requirePin | Boolean, default false for legacy users |
| financePinHash | Separately salted Argon2id verifier; never returned or synchronized |
| revision | Monotonic integer; increment for every enrollment/reset/change/enable/disable |
| updatedAt / lastChangedBy | Security audit metadata without PIN/password |

Store under `USER#{id}` / `FINANCE_SECURITY`. A separate PIN may remain enrolled while requirement is disabled; no clear operation is required by this feature. Enabling requires an enrolled verifier. All management commands verify the current password online, including enable/disable. Reset replaces the verifier and revision without erasing pending Finance data. Existing Journal and password-recovery PIN records are unchanged.

`FinanceUnlockGrant`: hash of a random 256-bit opaque token, userId, sessionId, sessionEpoch, securityRevision, tabNonce, createdAt, expiresAt, revokedAt. Default maximum lifetime 30 minutes or the existing session's earlier expiry; leaving the protected visit revokes it immediately when online and always removes the local token. Expiry leads to a PIN prompt without losing form input. Expiration is enforced by reads, never merely by asynchronous TTL deletion. No token is persisted in browser storage, URLs, logs or shared task metadata. No grant is needed when protection is off, but current preference must be checked and source authorization still applies.

`OfflineFinanceVerifier` (local, per user/device): independent salt/KDF parameters, encrypted verification secret or verifier, known securityRevision/sessionEpoch, enrollment time, failureCount, retryAfter. Only established through verified connected setup/unlock. This gates app access to existing device-key-encrypted data; it is not a new encryption root. Missing or known-stale verification material fails closed. Known protection settings cannot be defaulted off because local material is absent.

## 2. UserFinanceDashboardPreference

Owner-only rows: userId, targetKind (`account|budget|category|merchant`), targetId, included, version, timestamps. Key `USER#{id}` / `FINANCE_DASHBOARD#{kind}#{targetId}`. A distinct settings row stores upcomingCount (`5|10|15|20`, default 10). Targets retain their own authorization; flags never grant access and may remain dormant when target access is lost. Reappearing eligible targets may reuse an existing personal flag. Catalog edits must not change flags belonging to others.

Task/post-it expense-column settings reuse existing per-user/per-layout preference behavior, default off. Do not imply cross-device synchronization if an existing display preference is browser-local; dashboard flags themselves are synchronized owner-only.

## 3. FinancialTransaction extensions

- `checkNumber?: string`: trimmed nonempty text when present, max 64 characters; preserve leading zeros. Not parsed as an integer and not globally unique.
- `paymentType?: cash|check|card|ach|digital-other`: UI labels Cash, Check, Card, ACH, Digital (Other); absent displays Unspecified.
- Provider-observed payment/check fields, when supported, remain source metadata. User corrections override for display and survive refresh/reconciliation.
- New manual transactions retain existing required date, amount/direction, account currency and description/payee validation. Account context is mandatory; any editable account source is eligible.
- `receiptCount` is an authorized derived field, never a public/task field. `taskLinks` and fulfillment relations are separate records, not embedded into shared task payloads.

Existing manual snapshot balance semantics remain unchanged. Provider-connected manual entry is provisional; provider balance is not recomputed from that observation. Atomic reconciliation preserves the stable transaction identity and all relationships.

## 3a. ExpenseRefundRelationship

Fields: id, refundTransactionId, originalExpenseTransactionId (both canonical), positive linkedAmountMinor, currency/exponent, confirmed refundedAllocations, source transaction/allocation versions, createdBy, version/timestamps, active/removed state and valid/awaiting-posting/needs-review calculation state. A refund transaction has at most one active original expense relationship; an original supports several partial refund transactions. Unlinked credit remains a credit and does not reduce spending. Same-currency cross-account refunds are allowed; reject self/cyclic links, currency mismatch and income/transfer/refund originals.

A refundedAllocation contains originalAllocationId (or an explicit unallocated slice identity), positive amountMinor, and immutable confirmed budget/category/subcategory association snapshots/revisions. Full refunds default to original associations. A partial split refund requires explicit user confirmation of allocation amounts; their sum must equal linkedAmountMinor. Do not silently prorate or fabricate a budget/category for an unallocated original. Confirmed snapshots do not change merely because the original is later recategorized; users may explicitly correct the refund link under current permissions.

Credit and original-allocation ledgers reserve accepted linked amounts, including awaiting-posting proposals. Conditional writes enforce credit remaining capacity and unrefunded original allocation principal across all links. Excess credit stays unchanged/unlinked; this does not prevent negative spending in a later reporting period. Link/correct/remove conditions on source versions, relationship version and capacity versions, releases old claims and applies new ones atomically, and uses mutation receipts to avoid double offsets. User source edits that invalidate claims return a relationship conflict. Provider corrections cannot be dropped: retain new source data, mark affected relationships needs-review, reverse their prior valid contributions and flag coverage until resolved. Source archival/deletion follows referenced-record policy, never orphaning an accepted link.

Linking requires edit permission on the refund plus independent read permission on original expense/selected original associations. Reads/feed projections/default selectors/derived facts enforce the intersection and omit inaccessible relationship identities, classifications and counts. Account/merchant reporting uses the refund transaction's own account/merchant/date; budget/category/subcategory report slices use confirmed refund associations. Pending/provisional/non-posted or invalid review-state relationships contribute zero; valid posted refund amounts contribute negative spending on their own received transaction date, never in the original period. Income/transfer credits contribute zero. Canonical provider merge preserves links/capacity identities on both sides; correction/unlink reverses contributions exactly once.

## 4. FinanceCategory, Allocation and BudgetItem

Category adds `parentId?: categoryId` for one child level, with canonical name locks scoped to parent (root names retain existing global lock rules). A parent cannot itself be a child; archived entries cannot receive new assignments. Duplicate normalized active child names under one parent are rejected.

Allocation and budget item add `subcategoryId?` and an immutable classification-history association (`categoryId`, `subcategoryId`, catalog revision/labels at assignment). Save requires the child to belong to the selected parent. Reparenting referenced catalog entries cannot rewrite historical meaning; use preserved associations or a separately reviewed migration. Filter parent membership follows the classification at the time of assignment, not today's reparented tree. Root and child values remain catalog identities visible to active users; allocation usage remains private.

Merchant editable fields reuse stable identity, canonical key lock, creator and lifecycle. Renames/city/region/default-category changes replace uniqueness locks conditionally without changing transactions' source descriptions. Collision returns a conflict with a permitted resolution path; merging is never implicit.

## 5. Budget closing

Budget adds independent `activity: active|inactive` (active on ordinary new confirmed save), `activityChangedAt` and `activityChangedBy`, plus `closedAt?: instant` and `closedBy?: userId`. Existing status still records draft/active/changed-since-reconciliation/archived/tombstone lifecycle and reconciliation history. New confirmed creation uses status active and activity active; no activation step is required. Migration retains legacy draft lifecycle and sets it inactive; an explicit Save as active through the existing versioned update promotes a valid legacy draft. Archived/tombstoned records remain unavailable without silent reactivation.

Deactivate/reactivate is permitted to current authorized budget editors, versioned, retry-safe and independent of close/reopen, archive and reconciliation. Reactivating an inactive-and-closed budget leaves it closed; flags/history/relationships survive all activity changes. `isEligibleForNewUpcoming` and dashboard-open eligibility require activity active, status active/changed-since-reconciliation, no closedAt, no archive/tombstone, and current permissions. Drafts are excluded until explicitly saved as active. Existing associated expenses retain review/reschedule/fulfillment after deactivation or closure; only new/reassigned budget selection requires current eligibility. Zero planned amount yields null/Not applicable percent, not division by zero.

## 6. UpcomingExpense

| Field | Meaning / validation |
| --- | --- |
| id | Canonical obligation identity |
| groupId | Required existing active group with current member editor |
| accountId | Required currently editable account; group account must match groupId |
| budgetId | Required active/open accessible budget for new/reassigned selection, belonging to groupId |
| description | Required trimmed text, 1–500 characters |
| expectedAmountMinor | Required positive safe integer in account currency |
| currency / currencyExponent | Taken from account; no conversion |
| dueDate | Required date-only value after the original entryContext.localDate; unchanged by delayed sync/travel |
| entryContext | Immutable `{enteredAt,localDate,timeZone}` captured at original browser confirmation; validated timestamp/date/IANA zone |
| dateChangeHistory | Separate date-change contexts for explicit reschedules; never replace original entryContext |
| plannedSource? | Typed budgetItem or reusable occurrence identity; explicit association only |
| lifecycle | active or cancelled; paid/partly-paid derived from current posted fulfillment |
| creatorId / version / timestamps | Standard mutation/audit metadata |

Create/edit requires group membership, budget permission and account edit permission. Only new/reassigned budget selection requires the active/open predicate; an unchanged existing association may still be reviewed/rescheduled/fulfilled when the budget later becomes inactive or closed. Validate original dueDate against the captured entry localDate, never server/reconnect today. Keep server acceptedAt separate from browser enteredAt. A syntactically valid original context must use a localDate consistent with enteredAt in its declared zone; it is user-entered calendar context, not proof of past authorization. Always recheck current permissions, reference compatibility and versions on sync. Retries reuse original context/mutation identity. A date-only expense that becomes overdue before reconnect is accepted unchanged if otherwise valid; ordinary field edits/payment actions do not rerun future-date creation checks. Explicit rescheduling records and validates its own date-change context without overwriting original creation history. A private account with a group budget stays private: only users meeting the full intersection receive the sensitive expense projection. Financial details must not be blindly placed in a group feed.

Derived `fulfilledAmountMinor` sums valid posted claims; `remainingAmountMinor=max(0,expected−fulfilled)`; `overpaidAmountMinor=max(0,fulfilled−expected)`. Display active as unpaid when fulfilled=0, partly-paid when 0<fulfilled<expected, paid when fulfilled>=expected. Overdue means dueDate is before the user's current local day and remaining>0. Today's expenses are upcoming/due today, not overdue. Cancellation preserves history and relationships; no transaction, actual balance, or task state is changed.

When unfulfilled, changing account/group/budget rechecks all relationships. Once claims exist, changing account/currency is rejected until claims are explicitly removed/reassigned; changing expected amount/date remains versioned and recalculates state. Cancelled records require an explicit reopen operation if rescheduled for active use; cancelled claims remain historical, not reused silently. Linking a planned source reserves a unique source occurrence identity; multiple representations cannot add a duplicate dashboard obligation. Expected amount does not automatically create another budget item or inflate planned totals.

## 7. ExpenseFulfillment and transaction claim ledger

Fields: id, upcomingExpenseId, transactionId (canonical), accountId, currency, positive amountMinor, createdBy, status (`active|removed`), version/timestamps and historical posting/undo references. Pending/provisional transactions may be linked but their amounts contribute zero until posted.

- Same account/currency as the expense; source transaction must represent a valid expense, not an internal transfer or credit-only record.
- A conditional transaction-level claim ledger reserves assigned amount, including claims awaiting posting, so total active claimed amounts cannot exceed that transaction's eligible expense magnitude.
- An expense may have multiple payments; a transaction may fulfill multiple expenses only within that ledger's remaining capacity. Source alias reconciliation does not duplicate claims.
- Transaction amount reduction, reversal, transfer reclassification or allocation changes recompute valid contribution and flag incompatible claims for review without retaining an overstated paid state.
- Concurrent claim/link/unlink operations condition on both expense version and claim-ledger version. Reverse prior contribution then apply current contribution exactly once.
- Overpayment beyond an expense expectation is allowed if actual eligible transaction amount supports it and is shown separately; it never produces a negative remaining obligation.

## 8. FinancialTaskLink v2

Fields: id, taskId, targetType (`budgetItem|transaction|upcomingExpense`), targetId, createdBy, status (`active|removed`), version/timestamps. Budget-item target additionally has budgetId for resolution; legacy budgetId/budgetItemId rows adapt to that target without losing IDs/history.

Unique relationship lock `(taskId,targetType,targetId)`; forward/reverse references allow many links per task and many tasks per target. Link target ownership predicates are stored as references and revalidated, not treated as an authorization shortcut. Reads return only links for which the viewer can see both sides. Target view includes links to authorized tasks; task view includes authorized Finance targets. A removed link is tombstoned; source/task deletion never cascades to financial payment state.

Task creation with link uses the existing normal task form and generic default text. Canonical task revision + link + uniqueness receipt commit atomically when possible; bounded saga state otherwise records taskCreated/linkPending and retries only the missing part. The task feed never contains the financial target ID. Financial target feed must not reveal a private task ID to users who cannot read the task.

## 9. FinanceReceipt and shared AttachmentBlob

FinanceReceipt extends attachment metadata with parentType=`financeTransaction`, parentId=canonical transactionId, id/blobId, safe originalFilename, accepted MIME/format, sizeBytes, SHA-256, uploader/timestamps, scope references, version and lifecycle. Blob retains immutable S3 object key/version, checksum, encryption metadata, malware result and receipt-policy result pinned to that same object version.

States: localPending → uploading → checking → available; interrupted/failed may retry; cancelIncomplete removes the pending intent without deleting an unrelated valid blob. Available requires complete upload, valid size/checksum, format-policy-clean and malware-clean. Failed/skipped/unsupported scan is never available. Duplicate retry uses the original mutation/receipt identity and byte checksum; selecting identical bytes intentionally for another transaction is a distinct authorized attachment, not a content-existence leak.

Receipt metadata and encrypted local byte blobs use Finance-only stores/audiences; ordinary task attachments stay unchanged. Reference counts govern cleanup; no committed receipt blob is purged through task-completion rules. Original file version remains recoverable under backup/retention policy. Historical receipt access follows the retained transaction policy; tombstones do not create public access.

## 10. Read projections and storage access patterns

Reuse the existing single table and existing GSIs; add explicit item-collection partitions rather than a table scan. New writes maintain bounded reference rows alongside canonical records. Authorization checks precede partition enumeration and again precede projection return. Indexed references contain only data appropriate to their restricted storage audience; client visible records are still access filtered.

| Access pattern | Proposed key / bound |
| --- | --- |
| Security preference and unlock grant | USER#id / FINANCE_SECURITY; FINANCE_GRANT#tokenHash / CURRENT |
| Personal flags | USER#id / FINANCE_DASHBOARD#kind#targetId |
| Canonical upcoming expense | FINANCE#UPCOMING#id / CURRENT + revisions |
| Upcoming by eligible account and due date | FINANCE#ACCOUNT#id / UPCOMING#date#id |
| Fulfillments / transaction ledger | FINANCE#UPCOMING#id / FULFILLMENT#id; FINANCE#TRANSACTION#id / CLAIM_LEDGER |
| Task links forward/reverse | FINANCE#TASK#taskId / LINK#type#target; FINANCE#TARGET#type#id / TASK#taskId |
| Receipt by transaction | FINANCE#TRANSACTION#id / RECEIPT#id |
| Receipt browsing by account/date | FINANCE#ACCOUNT#id / RECEIPT#transactionDate#receiptId |
| Canonical compact expense fact | FINANCE#FACT#transactionId / CURRENT |
| Account fact date index | FINANCE#FACT_ACCOUNT#accountId / DATE#instant#transactionId |
| Optional budget/category/merchant fact references | FINANCE#FACT_DIM#kind#id#accountId / DATE#instant#transactionId |
| Account/currency/calendar month summary | FINANCE#SUMMARY#accountId#currency / MONTH#calendarBasis#YYYY-MM |
| Contribution version lock | FINANCE#TRANSACTION#id / SPEND_CONTRIBUTION |
| Refund relationship/credit lock | FINANCE#TRANSACTION#refundId / REFUND_RELATIONSHIP; REFUND_CREDIT_LEDGER |
| Refund original allocation capacity | FINANCE#TRANSACTION#expenseId / REFUND_ALLOCATION#allocationId |
| Account-scoped token/check/amount probes | FINANCE#FACT_SEARCH#accountId#kind#normalizedValue / DATE#instant#transactionId |
| Owner-scoped query job/checkpoints | USER#userId / FINANCE_QUERY#queryId; scope/revision-bound, short expiry |

Facts include source version, validated refund relationship/capacity revision where relevant, signed eligible expense/refund contribution from shared predicates, currency, transaction date/instant, merchantId, normalized description/payee/memo/merchant text tokens, check-number/amount search fields, and per-allocation category/subcategory/budget identity/amount. Original refund source scope participates in authorization and revision checks; a readable refund account alone cannot expose a private original association. Catalog-level inverted partitions are also partitioned by account to enforce access before counting; do not answer private spending from the public catalog partition.

Select the narrowest eligible dimension and merge cursors; max 200 returned rows and 1,000 examined fact rows per call. Partial aggregate response includes asOf, projectionRevision, complete, examined/coverage and continuation; counts/totals remain null or explicitly partial until complete. Default account-month summaries provide exact unfiltered graph values when current. Date/time-zone changes invalidate or rebuild affected local-calendar summaries; never use UTC month sums as exact local-day sums. Filtered reports match budget/category/subcategory in the same allocation and sum qualifying amounts once. Do not sum independently filtered totals to answer intersections.

For large updates, use idempotent projection checkpoints rather than exceeding DynamoDB transaction limits. A projection revision tracks complete vs rebuilding; stale totals stay labeled until publication. Each query response distinguishes rowsState (searching/ready/confirmed-empty) from aggregateState (pending/exact/failed), and carries queryId where automatic bounded computation continues. Actual rows or verified empty state must satisfy 2s p95; exact connected transaction/report counts/totals satisfy 10s p95, independent of 1s progress. A maximum-five-partition query coordinator runs bounded fact/index steps automatically with current-source revision checks rather than relying on browser page clicks. Owner-scoped query checkpoints expire after 15 minutes (expiry enforced on read, TTL cleanup later); permission/security revision changes invalidate them. No stale/mismatched revision is presented as exact. Retrying a rebuild reuses transaction/version contribution identities. New feature services use targeted unit-of-work loads of only touched graph/lock records; the current full-scope hydration is not an acceptable read path at target scale.

## 11. Migration, sync and restore

- Negotiate a new compatible sync capability/version (planned v8 from current v7; recheck immediately before implementation if other work advances it). Add entity kinds for upcoming expense, fulfillment, receipt metadata and personal settings; extend task-link schema without removing legacy reads.
- New budget saves default active; migrate legacy draft/archived/closed states without silently making them eligible. Preserve absent legacy payment/subcategory fields. No inferred payment type, PIN enrollment, dashboard flags, expense fulfillment or links are fabricated.
- Backfill fact/index/summary rows with a checkpointed, restartable cursor and source-version checks. Current reads label unbuilt coverage incomplete; retain old data until new projections reconcile with reference calculations.
- Add encrypted local stores/indexes through the next unused Dexie migration version, determined at implementation time. Preserve pending outbox edits and attachments; never hardcode a database version already occupied by concurrent work.
- Canonical user security revision/session epoch is checked before Finance pull/replay. General task sync may continue while locked; it must not advance undisclosed Finance changes past the Finance cursor. See [sync-security.md](contracts/sync-security.md).
- Apply memberships/revocation, parents/accounts/groups/budgets, transaction/expense records, refund relationships/capacity snapshots and fulfillment/receipts, then task links. Original browser entryContext survives all outbox replay and restore steps; server acceptance time never overwrites it. Purge revoked source records, worker indexes, blobs and related projections together.
- Restore validation checks record counts, canonical transaction aliases, fulfillment/refund capacity and contribution conservation, link uniqueness, original calendar context, receipt metadata-to-objectVersion/checksum, policy/scan state, user-only preferences and closed/open budget semantics. Restore security records but do not reactivate prior unlock grants or reset stale session epochs to a weaker value. Preserve inherited Finance RPO ≤5 minutes for committed DynamoDB state and RTO ≤4 hours; document receipt-byte recovery separately against actual version/backup policy and never promise uncommitted local bytes are backed up.
