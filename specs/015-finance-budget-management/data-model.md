# Data Model: Finance and Budget Management

## Modeling Conventions

- IDs are Na'aseh ULIDs unless explicitly described as provider identifiers.
- Every mutable record has `version`, `createdAt`, and `updatedAt`; conditional writes require the expected version.
- Every state-changing command has a mutation/idempotency ID and produces an immutable revision or job event through existing patterns.
- Calendar dates use `YYYY-MM-DD`. Instants use UTC ISO 8601. SimpleFIN epoch seconds are converted at the adapter boundary.
- Monetary values use safe integer `amountMinor` plus `currency` and `currencyExponent`. The exponent is fixed by the account/budget currency; floating-point amounts are prohibited.
- Source-owned fields and user-owned fields are separated so imports cannot overwrite classifications.
- Protected entity values are encrypted in IndexedDB. Server records are encrypted at rest by the existing DynamoDB customer-managed key. Provider credentials receive additional application-layer KMS encryption.
- `FinanceScope` is exactly one of `{ type: "owner", ownerId }` or `{ type: "group", groupId }`.
- Lifecycle removal is explicit: referenced records transition to `archived` or a durable authorization-scoped tombstone; permanent deletion is valid only for an unreferenced `draft` or mistaken record after a current impact preview.

## Authorization Matrix

| Action | Individual account | Group account/budget | Global catalog |
|---|---|---|---|
| Read financial data | Assigned owner | Active group members | All active users see merchant/category identity only |
| Create/connect account | Assigned owner | Group owner or manager | N/A |
| Change account assignment | Assigned owner may move own account; target group owner/manager must accept | Group owner or manager | N/A |
| Refresh SimpleFIN | Assigned owner | Active group member; provider credential remains server-only | N/A |
| Add/edit manual transaction or commit CSV import | Assigned owner | Active group member | N/A |
| Record manual balance snapshot | Assigned owner | Active group member | N/A |
| Create/edit budget, allocation, match, reusable item, reconcile | Owner for personal transaction edits; budgets are group-owned | Active group member, subject to complete-view reconciliation | N/A |
| Preview/archive/delete financial record, including transaction | Owner | Group owner or manager | Creator/admin for manual catalog identity; bank catalogs cannot be deleted |
| Create merchant/category | N/A | N/A | Any active user |
| Rename/archive manual merchant/category | N/A | N/A | Creator or application administrator |

Application administrators do not gain access to protected finance activity merely because of their application role. Their catalog authority applies only to global merchant/category identity records.

## Entities

### FinanceConnection

Represents one claimed SimpleFIN Bridge Access URL and the scope allowed to use accounts discovered through it.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `scope` | FinanceScope | Owner or group; group creation requires owner/manager |
| `provider` | `simplefin-bridge` | Fixed in v1 |
| `encryptedAccessUrl` | bytes/string | KMS ciphertext only; never serialized to clients or logs |
| `credentialKeyId` | string | Existing runtime-secrets key identifier, not secret material |
| `credentialContextVersion` | integer | Positive; binds KMS context evolution |
| `providerConnections` | bounded array | `connId`, display name, organization identifiers/URLs; no credentials |
| `status` | `active`, `attention`, `revoked`, `archived` | See lifecycle |
| `lastAttemptAt` | instant? | Used for one-hour cooldown |
| `lastSuccessfulAt` | instant? | Data freshness |
| `lastSuccessfulStartDate` | date? | Five-day overlap basis |
| `lastErrorClass` | enum? | Sanitized provider/auth/partial/throttle/internal class |
| `version` | positive integer | Conditional mutation |

Validation:

- Claim input and returned Access URL must pass Bridge host, HTTPS, port, redirect, length, and credential-shape policy before encryption.
- Only one active connection may own a given encrypted provider connection identity within the same FinanceScope; duplicates produce a reviewable conflict.
- Moving a connection between scopes is not supported. Accounts may be reassigned only after disconnecting or explicitly accepting a new scope.

### FinancialAccount

Represents a manual or imported checking, savings, credit-card, or loan account.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `scope` | FinanceScope | Controls audience |
| `connectionId` | ULID? | Present only for SimpleFIN-managed accounts; absent for independent manual accounts |
| `providerConnectionId` | string? | Source-owned, bounded |
| `providerAccountId` | string? | Source-owned; unique within provider connection |
| `sourceName` | non-empty string | Required account name; source-owned for imported accounts and user-supplied for manual accounts |
| `organizationName` | non-empty string | Required organization name; source-owned when supplied by SimpleFIN and otherwise user-supplied before creation completes |
| `friendlyName` | string | User-owned; defaults to `organizationName - sourceName`; uniqueness is not required |
| `accountType` | `checking`, `savings`, `credit-card`, `loan`, `other` | User-confirmable classification |
| `currency` | ISO 4217 code | Immutable after transactions exist |
| `currencyExponent` | integer 0–6 | Derived and immutable after transactions exist |
| `currentBalanceMinor` | safe integer | SimpleFIN: latest accepted source balance. Manual: latest manual snapshot plus strictly later accepted transactions |
| `availableBalanceMinor` | safe integer? | Optional |
| `balanceAt` | instant | Effective time, not import time |
| `sourceExtra` | bounded JSON? | Sanitized, size-limited, source-owned |
| `status` | `active`, `attention`, `archived`, `deleting` | See lifecycle |
| `version` | positive integer | Conditional mutation |

Uniqueness: `(connectionId, providerConnectionId, providerAccountId)` identifies an imported account. A source identity-lock item prevents duplicates.

Creation invariant: an account is not persisted and its transactions are not imported until both `sourceName` and `organizationName` are non-empty. A SimpleFIN account missing either value remains in an attention state that requires the user to supply the missing value.

### BalanceSnapshot

Immutable history of every accepted balance change.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `accountId` | ULID | Parent account |
| `balanceMinor` | safe integer | Exact |
| `availableBalanceMinor` | safe integer? | Exact |
| `currency` / `currencyExponent` | value | Must match account |
| `effectiveAt` | instant | Provider balance date or manual effective time |
| `recordedAt` | instant | Na'aseh acceptance time |
| `source` | `simplefin`, `manual` | Immutable |
| `importJobId` | ULID? | Present for imported snapshot |

Snapshots with identical account, effective time, and values are idempotent duplicates and are not reinserted. For a manual account, the authoritative baseline is the snapshot with the greatest `(effectiveAt, recordedAt)` ordering. Its balance already includes activity through `effectiveAt`; only transactions whose `postedAt ?? transactedAt` is strictly later contribute to `currentBalanceMinor`. A later accepted snapshot changes the baseline and derived current balance without deleting transaction history.

### FinancialTransaction

Canonical transaction. Immutable origin records how it entered Na'aseh; optional provider identity records whether SimpleFIN later supplied or reconciled it. User classifications are stored as allocations, not by rewriting provider fields.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `accountId` | ULID | Immutable after creation |
| `origin` | `simplefin`, `manual`, `csv` | Immutable |
| `csvImportBatchId` / `csvRowOrdinal` | ULID? / integer? | Required together for CSV-origin records |
| `providerConnectionId` / `providerAccountId` | string? | Present after SimpleFIN import or reconciliation |
| `sourceTransactionId` | string? | Required whenever provider identity is attached |
| `entrySnapshot` | TransactionSourceSnapshot? | Immutable original manual/CSV fields; required for manual/CSV origin |
| `providerSnapshot` | TransactionSourceSnapshot? | Provider-owned fields; required for SimpleFIN origin and after reconciliation |
| `postedAt` | instant? | `null` while provider reports pending with zero posted time |
| `transactedAt` | instant? | Optional source field |
| `amountMinor` | safe integer | Positive credit/deposit, negative debit/withdrawal |
| `currency` / `currencyExponent` | value | Must match account |
| `description` | string | Source-owned when imported |
| `payee` | string? | Optional source-owned field |
| `memo` | string? | Optional source-owned field; manual memo is user-owned |
| `pending` | boolean | Source-owned when imported |
| `merchantCategoryCode` | string? | Optional provider field; do not infer if absent |
| `merchantId` | ULID? | User-owned association to global merchant |
| `transferId` | ULID? | User-owned; each transaction belongs to at most one transfer |
| `allocations` | TransactionAllocation[] | User-owned, maximum 100 |
| `sourceExtra` | bounded JSON? | Sanitized, size-limited |
| `reconciliationState` | `not-applicable`, `provisional`, `reconciled`, `review-required`, `kept-separate` | `provisional` only for manual origin on a connected account |
| `reconciledAt` / `reconciledBy` | instant? / `system` or user ID? | Required when reconciled; records automatic or explicit decision |
| `reviewState` | `none`, `identity-review`, `allocation-review`, `reconciliation-review`, `possible-duplicate` | Visible remediation state |
| `version` | positive integer | Conditional mutation |

`TransactionSourceSnapshot` contains posted/transacted times, signed amount, description, payee, memo, pending state, merchant category code, and bounded source metadata. API top-level date/amount/text fields are an effective projection: provider snapshot when attached, otherwise entry snapshot. Reconciliation never mutates or removes the entry snapshot, merchant association, allocations, transfer, matches, or audit events.

Identity: SimpleFIN identity uses `(connectionId, providerConnectionId, providerAccountId, sourceTransactionId)`. CSV identity uses `(accountId, csvImportBatchId, csvRowOrdinal)`. A provisional transaction may acquire a SimpleFIN identity without changing `id` or `origin` only through the unique reconciliation predicate or an explicit atomic lock-transfer decision. If a pending SimpleFIN transaction later uses a new ID, Na'aseh creates a new record and a review issue unless equivalence is proven by provider identity; amount/description similarity alone never merges automatically.

### CsvImportBatch

Durable receipt for one reviewed CSV import. Raw file bytes, filenames, and plaintext preview rows are never persisted.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `accountId` | ULID | Must reference a manually maintained account |
| `requestedBy` | user ID | Must be authorized for the account |
| `fileDigest` | SHA-256 digest | Unique with account ID; derived locally from normalized bytes |
| `mapping` | bounded object | Date, description, optional payee/memo, selected date format, and exactly one amount mapping: signed column or debit/credit columns |
| `status` | `staged`, `committing`, `partial`, `succeeded`, `cancelled`, `failed` | State machine below |
| `counts` | object | Total, accepted, rejected, suspected duplicates, duplicate-included, duplicate-excluded, committed, failed |
| `duplicateDecisionDigest` | SHA-256 digest | Canonical digest of every suspected row ordinal plus include/exclude decision; proves review completion without retaining excluded row content |
| `committedOrdinals` | compressed bounded receipt pages | Prevents duplicate row creation during chunk retries |
| `createdAt` / `completedAt` | instant / instant? | Audit timestamps |

An exact `(accountId, fileDigest)` replay returns the existing batch outcome. A row's durable identity includes its ordinal so two identical legitimate rows in one file remain distinct. Cross-file value similarity produces a suspected-duplicate decision rather than an identity collision. Confirmation is invalid until every suspected row ordinal appears exactly once in the decision digest; excluded rows are counted but their contents are not persisted.

### TransactionAllocation

Nested user-owned value allocating all or part of one transaction.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Unique within transaction |
| `amountMinor` | safe integer | Same sign convention and currency as source transaction |
| `financeCategoryId` | ULID | Active global finance category at assignment time |
| `budgetItemId` | ULID? | Actor must access item and its budget |
| `note` | string? | Maximum 1,000 characters |
| `createdBy` | user ID | Immutable |
| `createdAt` / `updatedAt` | instant | Audit times |

Invariants:

- An unsplit transaction may have zero allocations (unclassified) or one allocation equal to the transaction total.
- A completed split has 2–100 allocations and `sum(allocation.amountMinor) == transaction.amountMinor` exactly.
- Partial splits may exist only in a local draft; the server rejects an unbalanced submitted transaction.
- Allocation category and budget item histories remain interpretable after catalog archival.

### Transfer

Links two or more transaction legs representing movement between accessible accounts.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `scope` | FinanceScope | Must be visible to actor; cross-scope links require access to every leg |
| `legTransactionIds` | 2–10 ULIDs | Distinct, accessible, compatible currencies |
| `status` | `suggested`, `confirmed`, `broken`, `archived` | Suggested never changes totals until confirmed |
| `createdBy` | user ID | Immutable |
| `version` | positive integer | Conditional mutation |

Confirmed transfer legs are excluded from spending/income totals. Any source update that invalidates amount/currency relationships changes the transfer to `broken` and creates review work.

### FinanceCategory

Global finance-only category catalog, separate from existing task categories.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `name` | string | 1–100 chars; canonical name unique among active categories |
| `origin` | `bank`, `user` | Immutable |
| `merchantCategoryCode` | string? | Required for bank/MCC category when known |
| `creatorId` | user ID? | Required for user origin |
| `status` | `active`, `archived` | Archived stays readable historically |
| `version` | positive integer | Conditional mutation |

Any active user may create a user category. Only creator or application administrator may rename/archive it. Bank categories are source-maintained and cannot be changed through user-category commands.

### Merchant

Global authenticated merchant identity; it contains no transaction counts or user activity.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `name` | string | 1–200 chars |
| `city` | string? | Maximum 120 chars |
| `region` | string? | Maximum 120 chars |
| `canonicalKey` | normalized hash/key | Uniqueness candidate, not treated as infallible identity |
| `merchantCategoryCode` | string? | Optional bank classification |
| `financeCategoryId` | ULID? | Active global user category |
| `source` | `imported`, `manual`, `merged` | Audit source |
| `creatorId` | user ID? | Required for manual record |
| `status` | `active`, `archived`, `merged` | Merged points to survivor |
| `mergedIntoId` | ULID? | Required only for merged state |
| `version` | positive integer | Conditional mutation |

Canonical `(normalized name, city, region)` is used for suggestions and uniqueness locks. Ambiguous imported descriptions never auto-create or merge a merchant. Creator/admin may archive manual merchants; administrator-mediated merge preserves aliases and transaction links.

### Budget

Group-owned plan. Personal budgets are outside v1; individually owned accounts may be linked through audience-filtered links.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `groupId` | ULID | Required, immutable |
| `name` | string | 1–200 chars |
| `budgetDate` | date | User-facing anchor date |
| `startDate` | date | Required |
| `endDate` | date? | `null` means open-ended; otherwise `endDate >= startDate` |
| `status` | `draft`, `active`, `changed-since-reconciliation`, `archived` | Derived transition rules below |
| `lastReconciledAt` | instant? | Denormalized latest history time |
| `version` | positive integer | Conditional mutation |

Overlapping budgets are allowed. Automatic transaction-to-budget matching is prohibited when more than one eligible budget remains after account, merchant, and date filtering.

### BudgetAccountLink

Audience-sensitive association between a budget and account.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `budgetId` | ULID | Group budget |
| `accountId` | ULID | Actor must access account |
| `audience` | owner or group audience | Intersection of budget/account visibility |
| `status` | `active`, `removed` | Versioned |
| `createdBy` | user ID | Immutable |
| `version` | positive integer | Conditional mutation |

Group members who cannot access a private linked account receive neither the link nor its transaction totals; the budget response reports `totalsComplete: false` without identifying the hidden account.

### BudgetItem

Planned debit or credit copied into one budget or created directly.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `budgetId` | ULID | Required |
| `sourceReusableItemId` | ULID? | Reference only; copy remains independent |
| `description` | string | 1–300 chars |
| `merchantId` | ULID? | Active/global merchant |
| `financeCategoryId` | ULID | Required |
| `plannedAmountMinor` | non-zero safe integer | Sign encodes debit/credit |
| `currency` / `currencyExponent` | value | Budget totals grouped by currency |
| `applicableDate` | date? | Optional specific occurrence |
| `relatedAccountIds` | bounded ULID array | Only accounts actor can link |
| `creatorId` | user ID | Immutable |
| `lastReconciledAt` | instant? | Denormalized |
| `status` | `active`, `archived` | Historical references retained |
| `version` | positive integer | Conditional mutation |

Actual amount is the sum of authorized transaction allocations referencing this item. It is computed, not independently mutable.

### ReusableBudgetItem

Group-owned source for budget-item copies and future occurrences.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `groupId` | ULID | Required |
| `description`, `merchantId`, `financeCategoryId` | values | Same meaning as BudgetItem |
| `plannedAmountMinor`, `currency`, `currencyExponent` | values | Exact |
| `relatedAccountIds` | ULID array | Group-access validation |
| `applicableDate` | date? | One-time future item |
| `recurrence` | object? | `interval` positive integer, `unit` day/week/month/year, start/end dates |
| `status` | `active`, `archived` | Archived not offered for new budgets |
| `creatorId` | user ID | Immutable |
| `version` | positive integer | Conditional mutation |

An occurrence key `(reusableItemId, occurrenceDate, budgetId)` prevents duplicate offers/copies. Editing a copied BudgetItem never mutates this source.

### TransactionMatch

Audit record for automatic, suggested, accepted, rejected, changed, or undone matching.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `transactionId` | ULID | Required |
| `budgetItemId` | ULID | Required |
| `kind` | `exact`, `near`, `manual` | Basis |
| `scoreBasis` | bounded object | Merchant/date/account match flags and amount difference percent; no raw text |
| `status` | `suggested`, `accepted`, `rejected`, `undone`, `invalidated` | See transitions |
| `decidedBy` / `decidedAt` | optional | Required after user decision |
| `version` | positive integer | Conditional mutation |

Only one unique exact candidate may be accepted automatically. Near amount differences `(0%, 20%]` are suggestions. Accepting a match creates or updates a balanced allocation atomically. Ambiguous candidates remain suggestions.

### ReconciliationRecord

Immutable evidence of a complete budget review.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `budgetId` | ULID | Required |
| `reconciledAt` | instant | Required |
| `reconciledBy` | user ID | Active group member |
| `budgetVersion` | positive integer | Reviewed version |
| `sourceVersionDigest` | hash | Canonical digest of contributing accounts, transactions, allocations, and items |
| `totalsByCurrency` | bounded map | Exact planned/actual/variance values |
| `totalsByCategory` | bounded map | Exact values keyed by category and currency |

Creation is rejected if the actor lacks any active linked account or contributing transaction. Records are append-only and included in backup/restore validation.

### FinancialTaskLink

Finance-audience record connecting a task to a budget item without changing task visibility.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `budgetItemId` | ULID | Required |
| `taskId` | ULID | Required |
| `financeAudience` | group audience | Never copied to a broader task audience |
| `createdBy` | user ID | Must access both entities |
| `status` | `active`, `removed` | Versioned |
| `version` | positive integer | Conditional mutation |

Task reads do not expose this entity. Finance-authorized clients receive it from their finance feed and may decorate an already-readable task locally.

### ImportJob

Durable status and retry boundary for a SimpleFIN refresh.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `connectionId` | ULID | Required |
| `requestedBy` | user ID | Authorized actor |
| `requestMutationId` | string | Unique idempotency key |
| `windowStart` / `windowEnd` | date | Maximum 90 days |
| `status` | `queued`, `running`, `partial`, `succeeded`, `failed`, `cancelled` | Terminal rules below |
| `leaseOwner` / `leaseExpiresAt` | optional | Single-worker enforcement |
| `counts` | object | Accounts, snapshots, inserted, updated, duplicate-suppressed, review issues |
| `errors` | bounded sanitized array | Provider class and affected connection/account opaque reference |
| `startedAt` / `completedAt` | optional | Progress timestamps |
| `attempts` | nonnegative integer | Bounded retries |

The request mutation ID makes repeated refresh requests return the same job. A terminal partial job retains accepted valid account data and identifies incomplete accounts. Authentication/compromise errors disable automatic retry and set the connection to `attention`.

### ImportReviewIssue

Reviewable ambiguity that cannot be resolved without user judgment.

| Field | Type | Rules |
|---|---|---|
| `id` | ULID | Immutable |
| `accountId` | ULID | Required |
| `kind` | `possible-duplicate`, `pending-posted-identity`, `provisional-reconciliation`, `merchant-ambiguous`, `allocation-invalidated` | Required |
| `candidateIds` | bounded opaque IDs | Actor must access all candidates |
| `providerSourceIdentity` | bounded identity hash? | Required for provisional-reconciliation issues and keep-separate suppression |
| `status` | `open`, `resolved`, `dismissed` | Versioned |
| `decision` | `reconciled`, `kept-separate`? | Required for resolved provisional-reconciliation issue |
| `resolvedBy` / `resolvedAt` | optional | Required for terminal state |

## DynamoDB Access Patterns

The exact physical field names remain implementation details, but the design must support these bounded operations without table scans.

| Access pattern | Primary/index key strategy |
|---|---|
| Get account and its metadata | `PK=FIN_ACCOUNT#{id}`, `SK=META` |
| List account transactions by date/cursor | Same PK, `SK` range `TXN#{posted-or-transacted}#{id}` |
| List account balance history | Same PK, `SK` range `BALANCE#{effectiveAt}#{id}` |
| Recompute manual current balance | Latest `BALANCE#` snapshot plus bounded `TXN#` range strictly after its effective instant |
| List account review/match/transfer children | Same PK with typed sort-key prefixes |
| Deduplicate imported account/transaction | Conditional identity-lock item keyed by provider connection/account/source ID hash |
| Deduplicate CSV file and row retries | `PK=FIN_ACCOUNT#{accountId}`, `SK=CSV_BATCH#{fileDigest}` plus batch receipt pages keyed by row ordinal |
| List owner/group finance roots | Existing GSI1 using `FIN_SCOPE#{audience}` and typed/time sort keys |
| Get budget with items/history | `PK=FIN_BUDGET#{id}` with `META`, `ITEM#`, `ACCOUNT_LINK#`, `RECON#` sort keys |
| List group budgets/reusable items | Existing GSI1 scope projection |
| List active merchants/categories | Existing GSI1 catalog partitions ordered by canonical name |
| Enforce active catalog-name uniqueness | Conditional canonical-name lock item |
| Get connection/import jobs | `PK=FIN_CONNECTION#{id}` with `META`, `JOB#` children |
| Get account CSV batches | `PK=FIN_ACCOUNT#{id}` with `CSV_BATCH#` children |
| Pull authorized offline changes | Existing `FEED#{audience}` partitions and counters |
| Idempotent commands | Existing mutation receipt pattern |

No new GSI is planned. Measure read amplification and p95 latency before proposing one.

## State Transitions

### FinanceConnection

```text
claim -> active
active -> attention       provider auth/partial failure requiring action
attention -> active       successful authorized refresh/reconnection
active|attention -> revoked  provider access revoked or user disconnects
revoked -> archived       credential ciphertext removal confirmed
```

### FinancialAccount

```text
create/import -> active
active -> attention       incomplete source data or review issue
attention -> active       issue resolved and refresh succeeds
active|attention -> archived
archived -> active        owner/manager restore when references remain valid
archived -> deleting -> tombstone  confirmed resumable removal when references require durable audit evidence
active -> permanently-deleted      authorized mistake only when the impact preview proves zero references
```

### Budget

```text
create -> draft -> active
active -> changed-since-reconciliation  total-affecting change after reconciliation
changed-since-reconciliation -> active  successful new reconciliation
draft|active|changed-since-reconciliation -> archived
archived -> active        authorized restore
```

### TransactionMatch

```text
candidate -> suggested
suggested -> accepted | rejected | invalidated
accepted -> undone | invalidated
rejected -> suggested     only after material candidate/source change
undone -> accepted        explicit user action with current validation
```

### ImportJob

```text
queued -> running
running -> succeeded | partial | failed
queued -> cancelled       connection revoked before work begins
partial|failed -> queued  explicit idempotent retry creates a new attempt event
```

Terminal job history is retained according to application audit policy; raw provider payloads are never retained as logs.

### CsvImportBatch

```text
preview -> staged
staged -> committing -> succeeded | partial | failed
staged -> cancelled
partial|failed -> committing      idempotent retry of uncommitted rows
```

Raw file selection, parsing, and preview are transient browser states. Only an authorized confirmation creates `staged`; cancellation before that point creates no server record.

### Transaction Provider Reconciliation

```text
manual on SimpleFIN account -> provisional
provisional -> reconciled       one unique exact provider candidate or explicit accepted review
provisional -> review-required  ambiguous or incompatible provider candidate
review-required -> reconciled | kept-separate
provisional -> kept-separate    explicit user decision
```

Reconciliation preserves transaction `id`, immutable `origin`, entry snapshot, allocations, merchant and transfer links, matches, and audit history. Attaching provider identity and changing its conditional identity lock are atomic; an unexpected lock owner causes a version conflict and no partial merge.

Automatic reconciliation occurs before insertion, so the new provider identity lock can point directly to the provisional canonical transaction. Explicit reconciliation after an ambiguous import performs one DynamoDB transaction that condition-checks the provisional transaction, imported candidate, review issue, current authorization, and existing lock owner; copies the candidate's provider snapshot and identity onto the provisional record; repoints the lock from the candidate to the provisional record; converts the candidate to an authorization-scoped alias/tombstone; resolves the review issue; and emits both feed changes. If the candidate acquired user-owned allocations, merchant/transfer links, or matches, explicit reconciliation is rejected for conflict review rather than choosing which user state to discard.

A `kept-separate` decision resolves the exact `(provisionalId, providerSourceIdentity)` pair with actor and time. Later refreshes consult this durable decision and do not recreate the same suggestion unless the provider identity or provisional source fields materially change.

## Aggregate and Validation Rules

- Budget actuals are the sum of authorized allocations, never raw transaction totals.
- Confirmed transfers are excluded from income/spending and budget actuals unless a user deliberately allocates a fee leg.
- Planned, actual, and variance are grouped by currency. No cross-currency grand total is emitted.
- Budget reconciliation requires `totalsComplete=true` for the actor and a current version digest.
- A catalog archive blocks new references but never rewrites historical labels.
- A source transaction update that changes amount invalidates an unbalanced allocation set and accepted match, preserving both histories and creating review work.
- CSV import requires a manual account, exact account currency, a supported selected date format, non-empty description, and a row ordinal not already committed for that batch. A batch maps either one signed amount column or separate nonnegative debit/credit columns; a split-column row must contain exactly one nonzero value, converted to negative for debit or positive for credit. Every suspected duplicate must have one explicit include/exclude decision before confirmation.
- A manual account's current balance is the latest manual snapshot amount plus transactions with `postedAt ?? transactedAt` strictly later than the snapshot effective instant. Accepting a later snapshot recomputes from the new baseline without rewriting transactions.
- Automatic provider reconciliation requires exactly one provisional and one incoming candidate with the same account, currency, and signed amount. The manual effective date is `transactedAt`; the provider effective date is `transactedAt` when present, otherwise `postedAt`; UTC calendar dates must be within three days inclusive. Corresponding non-empty payee values or corresponding non-empty description values must be exactly equal after Unicode NFC normalization, Unicode-aware case folding, punctuation-to-space conversion, whitespace collapse, and trim. Empty, cross-field, substring, or fuzzy similarity never permits automatic reconciliation; any failed predicate or multiplicity creates review instead.
- Group membership revocation removes group feed access and triggers local tombstone purge; it does not rewrite immutable actor IDs in audit history.
- Deletion previews enumerate affected budgets, items, links, matches, and histories without returning inaccessible record details.
- A referenced account, transaction, budget, reusable item, merchant, category, match, or financial task link may be archived or represented by a durable tombstone but is never permanently deleted. Permanent deletion requires a current preview proving the target is an unreferenced draft or mistake; the decision receipt remains auditable.
- Provider `extra` objects are schema-bounded in depth, keys, string length, and total serialized size before persistence.
