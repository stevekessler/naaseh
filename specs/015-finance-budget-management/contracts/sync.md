# Finance Synchronization Contract

## Version

- Finance entities require synchronization contract version `7`.
- Clients below the minimum negotiated version receive the existing compatibility problem and must not receive partial finance payloads.
- A v7 client may still drain older durable outbox records under the existing compatibility rules.

## Entity Types

Version 7 adds:

- `financeAccount`
- `financeBalanceSnapshot`
- `financeTransaction`
- `financeTransfer`
- `financeCategory`
- `financeMerchant`
- `financeBudget`
- `financeBudgetAccountLink`
- `financeBudgetItem`
- `financeReusableBudgetItem`
- `financeTransactionMatch`
- `financeReconciliation`
- `financeTaskLink`
- `financeImportReview`
- `financeCsvImportBatch`

`financeConnection`, encrypted provider credentials, and raw `financeImportJob` internals are online-only. A sanitized import-status projection may be returned by the Finance API but is not placed in a general content feed.

## Audiences

| Record | Audience |
|---|---|
| Individual account and all children | `OWNER#{ownerId}` |
| Group account and all children | `GROUP#{groupId}` |
| Group budget, items, reusable items, reconciliation | `GROUP#{groupId}` |
| BudgetAccountLink to group account | `GROUP#{groupId}` |
| BudgetAccountLink to individual account | `OWNER#{accountOwnerId}` only |
| Global FinanceCategory and Merchant identity | authenticated `PUBLIC` |
| Merchant activity | Original account owner/group audience, never merchant catalog feed |
| FinancialTaskLink | Budget/account finance audience only; never task audience |
| Access revocation | Prior audience tombstone plus access-control feed change |

An application administrator receives no protected finance audience merely due to the application role. Administrator catalog maintenance uses direct authorized API commands and contains no merchant activity.

## Mutation Rules

- Every mutation contains the existing mutation ID, entity ID/type, operation, base version, encrypted local payload, creation time, and attempts count.
- Supported operations are existing `create`, `update`, `archive`, `restore`, and online-only `delete`, plus v7 `recordBalanceSnapshot`, `replaceAllocations`, `confirmTransfer`, `decideMatch`, `linkFinancialTask`, `commitCsvChunk`, and `decideProviderReconciliation`. A client must never queue `delete` while offline.
- The server rehydrates the authoritative entity, validates the actor against its FinanceScope and current group membership, and validates every referenced entity independently.
- Catalog create is allowed for active users. Catalog rename/archive requires creator or application administrator.
- Account connection, reassignment, and deletion of a group-owned financial record require group owner/manager. Any active group member may record a manual balance snapshot, create/edit a manual transaction, commit a CSV import, and manage routine group budgets, classifications, matches, provider-reconciliation reviews, and budget reconciliation.
- Budget reconciliation remains an online direct command and is not accepted from an offline outbox because it requires a current complete-view digest.
- A CSV batch is authorized against one manually maintained account. Each `commitCsvChunk` contains at most 100 validated rows, the batch/file digest, row ordinals, selected signed or debit/credit mapping, the duplicate-decision digest and counts, and a mutation ID; it never contains raw file bytes or a filename. `unresolved` must be zero. Chunks may queue offline and replay idempotently.
- A manual transaction created on a SimpleFIN-managed account is marked provisional. An explicit provider-reconciliation decision is online-only because it must lock the current provider identity.
- Bank/provider fields are never accepted from a client mutation for an imported record.
- An online `delete` requires a fresh impact-preview confirmation token. Referenced targets resolve to archive or durable tombstone; permanent deletion succeeds only when the server proves the target is an unreferenced draft or mistake. No Finance export mutation or feed type exists in v1.

## Field Ownership and Conflict Behavior

| Field class | Authority | Conflict rule |
|---|---|---|
| Provider account identity/balance | Import worker | User patches rejected; latest accepted source version wins only through import transaction |
| Provider transaction identity/text/amount/pending | Import worker | Preserve user fields; amount changes can invalidate allocations and matches |
| Manual/CSV entry snapshot | Authorized user | Immutable after creation; never overwritten by provider reconciliation |
| Provider snapshot attached to transaction | Import worker or atomic explicit reconciliation | Provider changes update only provider snapshot; effective projection preserves user-owned classifications/links |
| Manual balance snapshot | Assigned owner or active group member | Append-only; expected account version recomputes derived current balance |
| Friendly name, merchant link, allocations, transfer | Authorized user | Expected-version check; semantic conflict review on concurrent changes |
| Budget/item/reusable item | Active group member | Expected-version check; no last-writer-wins for amount/date/account/category |
| Global category/merchant identity | Creator/admin | Canonical-name lock plus expected version |
| Reconciliation | Append-only server command | Never edited or deleted by sync |

A conflict response contains only mutation ID, reason, current version, and safe correlation ID. It does not echo amounts, descriptions, memos, balances, merchant activity, or raw local/remote payloads. Authorized clients fetch/decrypt the current entity through the normal feed or Finance API before presenting conflict review.

## Import Changes

- Server-originated imports append ordinary authorized feed upserts after the canonical write succeeds.
- Source identity locks and mutation receipts make replay return the prior outcome.
- An account refresh can produce valid changes and a sanitized partial status. Valid changes remain durable; missing/failed accounts are not tombstoned.
- Pending-to-posted changes with the same source identity update the canonical record. A changed source identity creates a new record plus `financeImportReview`; no heuristic auto-merge occurs.
- Before inserting an incoming provider transaction, the worker evaluates provisional manual transactions. It attaches provider identity to the existing transaction only for one unique candidate satisfying the canonical exact reconciliation predicate: same account/currency/signed amount, UTC effective dates within three days, and exact normalized equality of corresponding non-empty payees or descriptions. Normalization is Unicode NFC, Unicode-aware case folding, punctuation-to-space conversion, whitespace collapse, and trim. All other plausible cases create `financeImportReview` and remain separate.
- Explicit reconcile is authorized only when the actor can access the provisional, candidate, account, and review issue. It condition-checks all three versions and atomically transfers the provider identity lock/snapshot from the candidate to the provisional, aliases/tombstones the candidate, and resolves the issue. Inaccessible references return generic not-found; stale accessible versions return conflict. A candidate with user-owned links or allocations cannot merge automatically.
- Keep-separate resolves and retains the exact provisional/provider-source-identity pair so refresh replay suppresses the same suggestion unless source identity or provisional fields materially change.
- Allocation or match invalidation is emitted in the same DynamoDB transaction as the source amount change when it fits. Oversized dependent updates create a checkpointed repair operation and keep affected records in review state.

## CSV Import Changes

- CSV parsing, mapping, and preview are transient browser operations and do not enter synchronization feeds.
- Confirmation remains disabled until every suspected duplicate has an explicit include/exclude decision. It creates `financeCsvImportBatch` and sends included transactions in chunks of at most 100 through the encrypted outbox, plus a content-free digest/count summary of included and excluded suspected rows.
- The server verifies manual-account eligibility, current owner/group membership, account currency, amount-mapping mode, zero unresolved duplicates, batch/decision digests, unique row ordinal, and every row invariant before atomically writing row receipts, canonical transactions, the recomputed manual balance projection, and audience feed entries.
- Replaying a file digest returns the existing batch. Replaying a committed row ordinal returns its existing transaction. The server rechecks accepted rows against authoritative data; a newly discovered suspect returns `duplicate_review_required` for a renewed user decision rather than committing. Similar values from another batch are never silently imported or suppressed.
- Invalid rows never enter the outbox. A partially failed chunk keeps its successfully committed earlier chunks and exposes bounded failed-row ordinals and safe reason codes for retry or correction.

## Bootstrap and Pull Ordering

Clients apply a bootstrap or pull in this dependency order:

1. Access-control changes and audience tombstones
2. Global finance categories and merchants
3. Accounts and balance snapshots
4. Budgets and reusable items
5. Budget account links and budget items
6. CSV import batches
7. Transactions and transfers
8. Matches and import-review issues
9. Reconciliation records
10. Financial task links

Within an audience, sequence numbers remain strictly increasing. Pull pages remain bounded to 200. The client may persist ciphertext in any arrival order but must not expose a child until its parent and authorization scope are valid.

## Offline Storage

- All finance entity values use the existing browser device-key encryption envelope.
- The finance IndexedDB store may expose only structural indexes: entity ID/type, opaque account/scope IDs, lifecycle, posted date, and update time.
- Amounts, balances, descriptions, payees, memos, merchant names, category names, budget labels, and provider metadata remain inside ciphertext.
- Plaintext MiniSearch indexes exist only in memory and are cleared on sign-out, access revocation, storage recovery, or explicit cache purge.
- CSV parsing and preview remain available offline, and confirmed chunks may queue in the encrypted outbox. External refresh, connection claim, provider-reconciliation decisions, budget reconciliation, and destructive deletion controls are disabled offline with an actionable explanation.

## Revocation and Scope Changes

- Account reassignment is an online owner/manager operation that atomically writes a tombstone to the old audience, an upsert to the new audience, and access-control changes.
- Children are transitioned with the existing checkpointed/resumable audience-change pattern when they exceed one DynamoDB transaction.
- On reconnect, clients apply tombstones and access-control changes before rendering cached finance routes or search results.
- A revoked user loses account, transaction, budget, match, reconciliation, and task-link cache entries from that audience. Global merchant/category identities remain because they are still authenticated-public.
- Pending mutations from a revoked audience are rejected as `authorization_changed`; protected payloads are purged only after preserving a content-free failure receipt.

## Invariants

- Submitted allocations are balanced exactly in minor units and use the transaction currency/exponent.
- Confirmed transfer legs are distinct, accessible, and currency-compatible.
- FinancialTaskLink never broadens task or finance access.
- Budget totals report `totalsComplete=false` when an audience lacks a private BudgetAccountLink; hidden account identity and contribution remain absent.
- Reconciliation cannot be queued offline and fails if `totalsComplete=false` or source versions changed.
- Permanent deletion cannot remove a referenced record; archive/tombstone transitions preserve required labels, actor IDs, reconciliation evidence, and relationship meaning.
- Global catalog feed payloads contain identity only and never transaction counts, totals, or relationship existence.
- CSV batch payloads contain digest/mapping/counts/status only; filenames, raw bytes, and preview rows never synchronize.
- Provider identity can attach to a provisional transaction only atomically with the identity lock, and doing so never changes immutable origin or user-owned fields.
- Recording a manual balance snapshot and recomputing `currentBalanceMinor` occur atomically from that snapshot plus strictly later accepted transactions; older imports remain historical and do not alter the projection.

### Account-dependent budget projections

- A budget-item payload may enter the owning group's feed only when every related account is
  assigned to that same group. Items involving private accounts emit a payload-free tombstone
  to remove any earlier group projection; their full values require an authorized budget read.
  This rule also applies to mixed private/shared account items and copied reusable items.
- Reconciliation group-feed records contain immutable history metadata with empty currency/category
  totals. Full totals are returned only by an authorized history read, including archived budgets.
- Stored reconciliation records retain server-only `sourceAccountIds` alongside the immutable
  evidence. Persistence and restoration must preserve these identifiers, even after budget links
  are removed. History access requires current access to every original source account as well
  as the budget. Records lacking source evidence, or referencing missing accounts, are withheld;
  no account identifiers from this evidence enter API or sync projections.
- Deletion confirmation rechecks the current record version and dependent references immediately
  before mutation. A changed version or a new reference invalidates a permanent-delete preview
  with a conflict response, even when the new reference did not increment the account version.
