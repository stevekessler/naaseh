# Feature Specification: Finance and Budget Management

**Feature Branch**: `015-finance-budget-management`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Add a Finance area for shared and individual accounts, accounts maintained without SimpleFIN, manual and CSV-imported transactions, provisional transactions on SimpleFIN accounts that reconcile with later provider data, merchants and categories, reusable and date-flexible budgets, reconciliation, matching, finance-linked tasks, and finance-aware search while reusing Na'aseh users, groups, security, and infrastructure where possible."

## Clarifications

### Session 2026-10-22

- Q: What finance permissions should group owners, managers, and members have? → A: All active group members may manage budgets and classifications; only owners and managers may connect accounts, change account assignments, or delete financial records.
- Q: May one transaction be split across multiple categories and budget items? → A: Yes. A transaction may have multiple allocations, and their amounts must equal the transaction total.
- Q: Are user-defined categories personal, group-specific, or global? → A: Every user-defined category is global and available to all active Na'aseh users.
- Q: Who may create, rename, or archive a global user-defined category? → A: Any active user may create one; only its creator or an application administrator may rename or archive it.
- Q: Are merchants global or scoped to a user or group? → A: Merchants form a global catalog visible to active users; each merchant page shows only transactions the viewer may access.
- Q: Who may manually add, edit, or CSV-import transactions in a group-owned account? → A: Any active group member may add, edit, and CSV-import transactions; only owners or managers may delete them.
- Q: Which CSV amount layouts must the first release accept? → A: Either one signed amount column or separate debit and credit columns; the user chooses one mapping method per import.
- Q: How should likely duplicate CSV rows behave during preview? → A: Walk through each suspected duplicate; every one must be explicitly included or excluded before confirmation.
- Q: How should transactions affect a manually maintained account's current balance? → A: Start from the latest dated manual balance snapshot and apply only later transactions; older imported transactions do not change the current balance.
- Q: What should compatible text mean for automatic SimpleFIN reconciliation? → A: Exact normalized equality between either payee or description; normalization ignores case, punctuation, and repeated whitespace.

### Session 2026-10-24

- Q: What deletion policy should v1 use for financial records? → A: Archive or tombstone referenced records; permanently delete only unreferenced drafts or mistakes after showing an impact preview.
- Q: What operating-cost ceiling should Finance use at the specified household scale? → A: Target no more than $5 per month in incremental AWS cost under normal household usage and flag any higher forecast for explicit approval.
- Q: How should the human usability criteria be validated? → A: Test two representative users; both users must pass each timed workflow and rate the specified status information as clear.
- Q: How should Finance performance be validated? → A: Run 20 measured Chromium iterations using a mid-range mobile profile, 4× CPU slowdown, 10 Mbps bandwidth, and 100 ms latency; require p95 useful content within two seconds and refresh progress within one second.
- Q: Should v1 include any Finance export capability? → A: No Finance exports in v1; add them only through a future specification.
- Q: Can an account be created when its organization name or account name is missing? → A: No. Both values are required; if SimpleFIN omits either value, account creation pauses until the user supplies it.
- Q: How should account deletion previews be exposed, and may deleting a transaction remove its categories? → A: Use one shared deletion-preview behavior for all financial record types to avoid drift; deleting a transaction must not delete category records.

### Session 2026-10-25

- Q: Does “SimpleFIN” mean the hosted SimpleFIN Bridge specifically? → A: Yes. V1 integrates only with official SimpleFIN Bridge hosts, using the one-time Setup Token claim flow, encrypted credential-bearing Access URLs, HTTP Basic authentication, and the version 2 `/accounts` response model. Arbitrary SimpleFIN servers remain out of scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect and Organize Financial Accounts (Priority: P1)

An authorized user opens the Finance tab, adds or imports checking, savings, credit-card, or loan accounts, gives each account a recognizable name, and assigns it to themselves or an existing group so only the intended people can use it.

**Why this priority**: Accounts and their access boundaries are the foundation for every other finance workflow.

**Independent Test**: Add one manual account and one imported account, assign them to a user or group, edit a friendly name, refresh their balances, and verify that authorized and unauthorized users see the correct results.

**Acceptance Scenarios**:

1. **Given** an authenticated group owner or manager, **When** they add an account and assign it to that group, **Then** current group members can access the account and non-members cannot.
2. **Given** an account has both a non-empty organization name and account name, **When** it is first saved, **Then** its friendly name defaults to "organization - account name" and an authorized user can edit it; the account cannot be created without both values.
3. **Given** a connected account has a new reported balance, **When** the account refresh succeeds, **Then** the current and available balances are updated and a dated balance-history entry is retained.
4. **Given** a supported account is available through SimpleFIN Bridge, **When** an authorized user imports it, **Then** the account and its available transactions appear without duplicating records already known to Na'aseh.
5. **Given** an account is not available through SimpleFIN, **When** an authorized user creates it manually, **Then** it can be maintained independently with balances and transactions entered by the user.
6. **Given** a manually maintained account and a supported CSV file, **When** an authorized user maps the required columns using either one signed amount column or separate debit and credit columns, reviews validation, explicitly includes or excludes every suspected duplicate, and confirms the import, **Then** accepted rows become transactions in that account and rejected or excluded rows remain uncommitted with actionable reasons.
7. **Given** a manually maintained account has a dated balance snapshot, **When** manual or CSV transactions are added, **Then** the displayed current balance applies only transactions after that snapshot and importing older history does not change it.

---

### User Story 2 - Review, Classify, and Find Transactions (Priority: P1)

An authorized user reviews transactions across one account or all accessible accounts, searches them, assigns categories and budgets, identifies transfers, and visits a merchant page to understand activity associated with that merchant.

**Why this priority**: Accurate, searchable transaction data is required before budgets can be useful or reconciled.

**Independent Test**: Import and manually add representative transactions, classify them, mark a transfer, search within one and all accounts, and verify the merchant detail view and access controls.

**Acceptance Scenarios**:

1. **Given** an account contains newly available transactions, **When** a refresh completes, **Then** new transactions are added with their source identifiers, dates, descriptions, amounts, pending state, merchant data, and available source metadata while existing transactions are not duplicated.
2. **Given** an authorized user views a transaction, **When** they assign all or part of it to a global user-defined category or budget item, **Then** the resulting allocation is retained and reflected in relevant totals.
3. **Given** two accessible accounts contain the two sides of a transfer, **When** the transfer is imported or marked by a user, **Then** both sides are linked and excluded from spending or income totals where double counting would occur.
4. **Given** an active user opens a merchant detail page, **When** it loads, **Then** the global merchant identity is visible but transactions, counts, and totals include only accounts the user may access.
5. **Given** finance search is enabled, **When** a user limits transaction search to one account or expands it to all accessible accounts, **Then** results respect both the selected scope and the user's access rights.
6. **Given** a purchase covers multiple categories or planned items, **When** an authorized user splits the transaction, **Then** each allocation can use a different category and budget item and the allocations cannot be completed until their amounts equal the transaction total.
7. **Given** an authorized user records a transaction on a SimpleFIN-managed account before the provider reports it, **When** a later refresh contains one unambiguous matching transaction, **Then** Na'aseh reconciles the existing provisional transaction with the provider identity without creating a duplicate or losing user-entered classifications.
8. **Given** multiple or materially different SimpleFIN transactions could correspond to a provisional transaction, **When** refresh completes, **Then** no automatic merge occurs and the user receives a review item that can be resolved without losing either record.
9. **Given** an authorized owner or manager previews and confirms deletion of an eligible transaction, **When** the transaction is removed, **Then** its category assignments stop contributing to finance totals but the category records remain available for other transactions and future use.

---

### User Story 3 - Build Flexible Budgets (Priority: P1)

An authorized group member creates one or more budgets for a pay period, an ad-hoc date range, or no fixed end date, adds planned debit and credit items across multiple accounts, and tracks planned versus actual amounts by item and category.

**Why this priority**: Creating and monitoring budgets is the primary user value of the new Finance tab.

**Independent Test**: Create bounded and unbounded budgets, add items directly and from reusable items, associate multiple accounts and transactions, and verify totals and variance by category.

**Acceptance Scenarios**:

1. **Given** an authorized user selects an existing group, **When** they create a budget with custom dates or without an end date, **Then** it is available only to authorized group members and clearly displays its applicable period.
2. **Given** a budget spans several accessible accounts, **When** debit and credit items are added, **Then** planned totals and actual totals include the selected accounts without double counting transfers.
3. **Given** a category has a planned amount of $700 and linked transactions totaling $800, **When** the budget is viewed, **Then** the category variance is shown as $100 over budget.
4. **Given** a budget item represents a category total, **When** multiple transactions are assigned to it, **Then** their combined amount is compared with that item without requiring one-to-one matching.

---

### User Story 4 - Reuse and Match Planned Items (Priority: P2)

An authorized user defines recurring or future planned items once, adds them to applicable budgets, adjusts a copied item for a specific period, and receives safe automatic matches or suggestions when transactions arrive.

**Why this priority**: Reuse and matching reduce repetitive work while preserving user control over uncertain associations.

**Independent Test**: Create reusable and future-dated items, generate an applicable budget, import exact and near-amount transactions, and verify copying, editing, automatic matching, and suggestions.

**Acceptance Scenarios**:

1. **Given** a reusable item for T-Mobile is planned for $500, **When** one unmatched T-Mobile transaction for $500 is imported in the applicable period, **Then** it is matched automatically and the user can review or undo the match.
2. **Given** a reusable item for Apple is planned for $41, **When** an Apple transaction for $45 is imported, **Then** it is suggested as a match rather than automatically linked because the amount differs but remains within 20 percent.
3. **Given** a future item is scheduled for September 15, 2027, **When** a budget is created whose period includes that date, **Then** the item is offered for inclusion and is not added to unrelated budgets.
4. **Given** a reusable item is copied into a budget, **When** an authorized user changes its amount for that budget, **Then** the budget-specific copy changes and the reusable source remains unchanged.

---

### User Story 5 - Reconcile and Audit Budgets (Priority: P2)

An authorized group member reconciles a budget after reviewing its linked transactions and can later see who reconciled it and when.

**Why this priority**: Reconciliation establishes confidence in budget totals and preserves accountability for shared finances.

**Independent Test**: Reconcile a complete budget, inspect its history, change a linked transaction afterward, and verify that reconciliation status and history remain truthful.

**Acceptance Scenarios**:

1. **Given** a budget's accessible transactions have been reviewed, **When** an authorized member reconciles it, **Then** the budget records the reconciliation date and actor and adds an immutable history entry.
2. **Given** a reconciled budget changes in a way that affects its totals, **When** it is next viewed, **Then** it is clearly identified as changed since reconciliation while the prior history remains available.

---

### User Story 6 - Create Tasks from Financial Items (Priority: P2)

An authorized user creates a task such as "Pay Xcel Energy" from a budget item and can navigate between the task and its related financial item without exposing financial details to someone who lacks finance access.

**Why this priority**: Connecting planned expenses to actionable work integrates finance into Na'aseh's core task-management value.

**Independent Test**: Create a task from a budget item, display its related financial item, and verify behavior for users with task access but without access to the budget.

**Acceptance Scenarios**:

1. **Given** an authorized user views a budget item, **When** they create a task from it, **Then** the task records the relationship and offers navigation back to the item for users authorized to view both.
2. **Given** a user can see a related task but not its financial item, **When** they view the task, **Then** protected financial details and navigation are not exposed.

---

### User Story 7 - Search Across Na'aseh Content Types (Priority: P3)

An authenticated user chooses which content types to include in search so they can add transactions or merchants when needed without making financial data appear unexpectedly.

**Why this priority**: Unified search improves discovery but must preserve existing defaults and financial privacy.

**Independent Test**: Open search, verify default toggles, enable finance types, and confirm results across tasks, lists, merchants, and transactions with access controls applied.

**Acceptance Scenarios**:

1. **Given** a user opens search for the first time, **When** filters are displayed, **Then** tasks and lists are included by default while transactions and merchants are excluded by default.
2. **Given** a user enables transaction or merchant results, **When** they search, **Then** transactions remain limited to accessible accounts while matching global merchant identities may appear without revealing protected transaction activity.

### Edge Cases

- A refresh returns the same transaction with corrected pending status, description, or other source details; the existing record is updated without losing user allocations, transfer links, or match decisions.
- A source transaction identifier is missing, reused, or changes; the system avoids silent duplication and asks for review when identity cannot be determined safely.
- A SimpleFIN account is missing its organization name or account name; creation pauses and prompts the user to supply both required values before the account is saved or transactions are imported.
- A CSV is re-imported, contains duplicate rows, or overlaps an earlier file; the system identifies exact file replays, flags likely row duplicates, requires an explicit include-or-exclude decision for each suspected duplicate, and never silently creates the same accepted transaction twice.
- A CSV has missing required columns, malformed quoting, an unsupported date or amount, both debit and credit populated for one row, neither populated, an invalid encoding, more than 50,000 rows, or exceeds 10 MB; preview reports bounded row-level or file-level errors without committing invalid rows.
- Two legitimate transactions have identical dates, amounts, and descriptions; duplicate detection presents them for review rather than discarding one solely because their visible values match.
- A provisional transaction on a SimpleFIN account has no exact normalized payee-or-description match, has several possible matches, has a changed amount, or has a provider date more than three calendar days away; it remains visible and unmerged until a unique safe match exists or a user resolves it. Fuzzy text similarity may inform review ordering but never permits automatic reconciliation.
- A transaction is dated exactly at a manual balance snapshot, or a later-dated balance snapshot is entered after transactions already exist; the snapshot is the authoritative balance at its effective instant and only transactions strictly after it contribute to the displayed current balance.
- An account, transaction, budget, reusable item, merchant, category, match, or financial task link is removed while referenced; the system archives or tombstones it so historical transactions and reconciliation records remain understandable. Permanent deletion is allowed only for an unreferenced draft or mistake after an impact preview and confirmation. Removing a transaction never removes its category records.
- A user loses group membership while finance data is cached or changes are pending; access is revoked at the next authorization check and protected cached data is no longer available to that user.
- A group-owned budget references an individually owned account that other group members cannot access; inaccessible account details and transactions are omitted, and the resulting incomplete totals are clearly disclosed.
- More than one reusable item could match a transaction; no automatic match occurs and the user receives ranked suggestions.
- A near match is exactly 20 percent above or below the planned amount; it qualifies for suggestion, while a larger difference does not qualify by amount alone.
- A transaction is split into allocations, refunded, reversed, or changes from pending to posted; the original transaction remains intact and linked category and budget totals update without counting both temporary and final records.
- Currency codes differ across accounts in a budget; amounts are not silently combined and each currency is reported separately unless an explicit conversion basis exists.
- A budget has no end date or overlaps another budget; transactions are never assigned automatically when the applicable budget is ambiguous.
- The user goes offline during editing; readable cached finance data remains labeled with its last refresh time, edits are queued locally, and imports and final reconciliation wait for connectivity.
- Reconnection produces concurrent edits to the same assignment or budget item; no value is silently overwritten, and the user is shown a resolvable conflict.
- Partial refresh, matching, or synchronization failures preserve previously valid data, identify the affected account or operation, and allow a safe retry without duplication.
- Finance journeys remain usable with touch input and narrow iPhone and iPad viewports in current Safari/WebKit, as well as current Chrome, without hidden totals or inaccessible actions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Na'aseh MUST provide an authenticated Finance tab that brings together accounts, transactions, merchants, categories, budgets, reusable items, reconciliation, and finance search.
- **FR-002**: The system MUST use existing Na'aseh users, groups, membership, and authorization rules for finance ownership and access.
- **FR-003**: A group owner or manager MUST be able to connect an account and assign it to an individual user or an existing group, and only the assigned user or current active group members MUST be able to access it.
- **FR-004**: Every active group member MUST be able to create and manage group-owned budgets, reusable budget items, manual transactions, CSV transaction imports, transaction classifications, matches, and reconciliations; a budget MUST be visible only to current active members of its group.
- **FR-004a**: Only a group owner or manager MUST be able to change an account assignment or delete a financial record owned by the group, including a manually entered or CSV-imported transaction.
- **FR-005**: The system MUST represent each account with a Na'aseh identifier, optional source identifier, required non-empty account name, required non-empty organization name, editable friendly name, currency code, current balance, available balance when provided, balance date, account type, source metadata, ownership assignment, and related transactions. Account creation MUST NOT complete until both required names are present; when SimpleFIN omits either one, the system MUST require the user to supply it before saving the account or importing its transactions.
- **FR-006**: A new account friendly name MUST default to "organization name - account name" using the two required values, and an authorized user MUST be able to edit it after creation.
- **FR-007**: An active user MUST be able to add and maintain checking, savings, credit-card, and loan accounts that have no SimpleFIN connection and assign them to themselves; a group owner or manager MUST be able to add such an account for that group, and connecting or importing an external account for a group MUST remain limited to that group's owners or managers.
- **FR-008**: The system MUST retain every accepted account balance and its effective date as history rather than replacing the prior history with only the latest value.
- **FR-008a**: For a manually maintained account, the displayed current balance MUST equal the latest dated manual balance snapshot plus all accepted transactions whose effective timestamps are strictly later than that snapshot. Transactions at or before the snapshot MUST remain in history without changing that displayed balance, and accepting a newer snapshot MUST replace the calculation baseline without deleting transactions.
- **FR-009**: An authorized user MUST be able to refresh an imported account and see whether the refresh fully succeeded, partially succeeded, or failed.
- **FR-010**: The system MUST represent each transaction with a Na'aseh identifier, source transaction identifier when available, amount and currency, posted timestamp, description, payee, memo, transaction time, pending state, source metadata, merchant category code, zero or more user allocations, transfer relationship, and associated account.
- **FR-011**: Refreshing imported transactions MUST add new records and update recognized records without creating duplicates or overwriting user-entered classifications and relationships.
- **FR-012**: An individual account owner or any active member of the assigned group MUST be able to add and edit manual transactions for manually maintained accounts, including future-dated obligations for loans, credit cards, and other known payments, and MUST be able to add a provisional manual transaction to a SimpleFIN-managed account they can access.
- **FR-012a**: An individual account owner or any active member of the assigned group MUST be able to import transactions into a manually maintained account from a UTF-8 comma-separated CSV by selecting a date format and mapping date, description, optional payee and memo, and either one signed amount column or separate debit and credit columns. A signed amount uses positive for credit/deposit and negative for debit/withdrawal; separate debit and credit values are nonnegative and exactly one MUST be populated with a nonzero value per row. Imported amounts MUST use the account currency.
- **FR-012b**: Before a CSV commit, the system MUST show the mapped preview, accepted-row count, rejected rows and reasons, exact-file replay status, and likely duplicate warnings. Every suspected duplicate MUST be reviewed and explicitly included or excluded before confirmation is enabled; confirmation MUST import only valid, explicitly accepted rows, and cancellation MUST import none.
- **FR-012c**: CSV processing MUST be retry-safe. Re-importing the same file into the same account MUST return the prior result without duplicating transactions, while value-similar rows from different files MUST be presented for individual include-or-exclude decisions rather than silently imported or discarded.
- **FR-012d**: A manual transaction on a SimpleFIN-managed account MUST remain provisional until reconciled or explicitly retained as unmatched. A later refresh MAY reconcile it automatically only when there is exactly one candidate on the same account with the same currency and signed amount, a provider date within three calendar days, and exact normalized equality between either payee or description. Normalization MUST ignore letter case, punctuation, and repeated whitespace; fuzzy or partial text similarity MUST NOT permit automatic reconciliation.
- **FR-012e**: Reconciliation with a SimpleFIN transaction MUST attach the provider identity and provider-owned fields to the existing canonical transaction, preserve its Na'aseh identifier and all user-owned allocations, merchant links, transfer links, matches, and audit history, and prevent creation of a second transaction for that provider identity. Ambiguous or incompatible candidates MUST create review work instead of merging automatically.
- **FR-013**: Authorized users MUST be able to classify imported or manual transactions as transfers between accessible accounts, and linked transfer sides MUST not inflate spending or income totals.
- **FR-014**: Every active user MUST be able to create a user-defined category and assign any active category consistently to authorized transaction allocations and budget items.
- **FR-014a**: Every user-defined category MUST be available for use by every active Na'aseh user, regardless of account or group ownership.
- **FR-014b**: Only a user-defined category's creator or an application administrator MUST be able to rename or archive it; archiving MUST prevent new assignments without changing its name or meaning on existing financial records.
- **FR-015**: The system MUST retain bank-provided merchant categories separately from user-defined categories and identify whether a category came from a bank or a user.
- **FR-016**: Each category MUST have a Na'aseh identifier, display name, origin indicator, creator when user-defined, active or archived state, creation date, and last-updated date; user-created category changes MUST NOT alter bank-provided source values.
- **FR-017**: The system MUST represent each globally visible merchant with a Na'aseh identifier, name, city, state or region, bank merchant category code when available, user category, creator when manually created, active or archived state, creation date, and last-updated date.
- **FR-018**: Each merchant MUST have an authenticated detail page that shows its global catalog identity while listing all and only the merchant's transactions, counts, and totals accessible to the current user; the page does not require a human-readable address.
- **FR-019**: Every active user MUST be able to create a merchant and associate authorized transactions with a merchant without losing their original source descriptions.
- **FR-019a**: A manually created merchant MUST be editable or archivable only by its creator or an application administrator; archiving MUST prevent new associations while preserving historical transaction meaning.
- **FR-020**: Authorized users MUST be able to create multiple budgets, each with a name, owning group, applicable accounts, start date, optional end date, budget date, items, reconciliation state and history, and calculated variance.
- **FR-021**: A budget MUST support an arbitrary date range, a single applicable date, or no end date, and its displayed transaction totals MUST state the effective period used.
- **FR-022**: A budget MUST be able to include authorized transactions from multiple related accounts while keeping amounts in different currencies distinct unless an explicit conversion basis is recorded.
- **FR-023**: A budget item MUST include a Na'aseh identifier, description or merchant, planned amount, debit-or-credit direction, category, related accounts, creator, creation date, last-updated date, optional applicable date, linked transactions, and last-reconciled date when applicable.
- **FR-024**: Authorized users MUST be able to add budget items directly to a budget or copy them from reusable budget items.
- **FR-025**: Authorized users MUST be able to create reusable budget items for recurring or future planned activity, including items dated beyond any current budget.
- **FR-026**: When a budget's period includes a future reusable item's applicable date, the system MUST offer that item for inclusion and MUST NOT silently add it to an unrelated period.
- **FR-027**: Editing an item copied into a specific budget MUST NOT change its reusable source unless the user explicitly chooses to update the source as a separate action.
- **FR-028**: The system MUST automatically match a newly imported transaction only when merchant, amount, applicable period, account access, and uniqueness produce one unambiguous exact candidate.
- **FR-029**: When merchant and context match but the amount differs by no more than 20 percent, the system MUST suggest rather than automatically make the match; ambiguous candidates MUST always require user selection.
- **FR-030**: Authorized users MUST be able to accept, reject, change, and undo automatic matches and suggestions, with resulting budget totals updated accordingly.
- **FR-031**: Authorized users MUST be able to link multiple transactions to one budget item, and the system MUST compare their aggregate amount with the planned amount.
- **FR-031a**: Authorized users MUST be able to divide one transaction among multiple allocations, each with an amount, user category, and optional budget item; allocation amounts MUST use the transaction's currency and MUST equal the transaction total before the split is accepted.
- **FR-031b**: Splitting a transaction MUST preserve the original imported or manually entered transaction as the source record, and edits, refunds, reversals, or pending-to-posted changes MUST keep its allocations consistent or flag them for review.
- **FR-032**: The system MUST calculate planned, actual, and variance amounts for each budget item, each category, and the whole budget, keeping debit, credit, transfer, and currency treatment explicit.
- **FR-033**: Authorized group members MUST be able to reconcile a budget, and each reconciliation MUST store an immutable Na'aseh identifier, reconciliation date and time, actor, and budget state reference sufficient to identify later changes.
- **FR-034**: A change affecting totals after reconciliation MUST be visible as a post-reconciliation change and MUST NOT erase or rewrite earlier reconciliation history.
- **FR-035**: Authorized users MUST be able to create a task from a budget item, and a task MUST support a related financial item reference.
- **FR-036**: A related task MUST reveal the linked financial item only when the current user is independently authorized to access that financial item.
- **FR-037**: Search MUST offer independent include toggles for tasks, lists, transactions, and merchants; tasks and lists MUST default on, while transactions and merchants MUST default off.
- **FR-038**: Transaction search MUST support one selected account or all accounts accessible to the user, and merchant search MUST search the global active merchant catalog without revealing whether other users have transactions for a merchant.
- **FR-039**: Searches, transaction counts and totals, merchant transaction views, matches, suggestions, and task relationships MUST enforce the same account and group access boundaries as direct financial-record views; global merchant and category identities are the explicit exceptions.
- **FR-040**: Destructive or access-changing actions MUST use one shared impact-preview behavior across all financial record types and explain affected accounts, transactions, budgets, reusable items, matches, tasks, histories, categories, and cached access before confirmation. A referenced financial record MUST be archived or tombstoned so its audit context and historical meaning remain available. Permanent deletion MUST be limited to an unreferenced draft or mistake and requires confirmation after the impact preview. Deleting a transaction MUST remove its category assignments from transaction and budget calculations without deleting the category records themselves. Existing role-specific deletion and archive permissions continue to apply.
- **FR-041**: Finance views MUST show data freshness, pending local changes, refresh progress, incomplete totals, and actionable failure information without presenting stale or partial data as current and complete.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: Financial accounts, balances, transactions, merchant activity, category assignments, budgets, matches, and reconciliation history are protected data. The merchant and user-defined category catalogs are visible to all active users, but their use on financial records remains protected. Access MUST be authenticated and authorized against the assigned user or current group membership for every protected-data read and change, including indirect access through search and tasks. Merchant pages and search MUST NOT reveal inaccessible transaction existence, counts, totals, dates, or relationships. Data MUST be protected in transit and at rest; least privilege applies; secrets and protected financial content MUST never appear in client-visible diagnostics or logs. Membership removal MUST revoke subsequent access, including access to locally cached protected data.
- **NFR-002 Data Durability & Recovery**: Account refresh, manual and CSV transaction import, provider reconciliation, matching, budget editing, assignment, and budget reconciliation MUST be validated and retry-safe. Partial failure MUST preserve the last valid state and MUST NOT duplicate transactions, erase user classifications, corrupt histories, or silently overwrite concurrent edits. Financial data and reconciliation history MUST be included in documented backup and restoration procedures, with periodic restoration tests.
- **NFR-003 Offline Support**: Previously synchronized, authorized finance data MAY remain readable offline with a visible last-refreshed time. Supported edits MUST be stored locally as pending changes and synchronized after reconnection. CSV selection, parsing, mapping, and preview MAY work offline, and a confirmed CSV commit MAY wait as a pending encrypted change; SimpleFIN connection/import, source refreshes, provider-reconciliation decisions, and final budget reconciliation require connectivity. Connectivity, pending changes, conflicts, failed synchronization, and access revocation MUST be visible, and conflicts MUST require resolution when automatic merging could change financial meaning.
- **NFR-004 Browser & Responsive Support**: Primary Finance journeys MUST work in current stable Chrome and Safari/WebKit, including supported iPhone and iPad sizes. Tables and totals MUST remain understandable on narrow screens; all actions MUST be operable by touch and keyboard; layouts MUST account for mobile viewport and storage constraints; and no workflow may rely on unsupported background execution.
- **NFR-005 Errors & Observability**: User-facing failures MUST identify the affected account or action, what remains saved, and the next safe action. Production operations MUST produce structured CloudWatch records with safe correlation identifiers, outcome, timing, source category, and actionable error context, while excluding credentials, raw protected financial content, and session data. Import, synchronization, authorization-denial, duplication-prevention, and reconciliation failures MUST support cost-conscious metrics, alarms, and retention.
- **NFR-006 Performance**: Under realistic household data volumes of up to 50 accounts, 100,000 accessible transactions, 20 active budgets, and five concurrent group members, the Finance landing page, merchant view, budget view, and filtered transaction search MUST show useful content within two seconds at the 95th percentile across 20 measured Chromium iterations using a mid-range mobile profile, 4× CPU slowdown, 10 Mbps bandwidth, and 100 ms latency. Long refreshes MUST show progress within one second under the same profile and MUST not block use of already synchronized data. Current Safari/WebKit and iPhone/iPad journeys remain subject to the functional browser criteria in NFR-004 and SC-008.
- **NFR-007 AWS Architecture & Cost Impact**: Planning MUST evaluate existing Na'aseh storage and managed serverless AWS options before introducing any new database or always-on service. At the specified normal household usage, Finance MUST target no more than $5 per month in incremental AWS operating cost above Na'aseh's existing baseline while satisfying financial-data security, durability, query, backup, and recovery needs. A forecast above $5 per month MUST be flagged before implementation or release and requires Steve's explicit approval with the cost drivers and lower-cost alternatives documented. Development, migration, and restore-test costs MUST be estimated and reported separately. Any provisioned relational database, including MySQL-compatible storage, requires a documented comparison showing why lower-cost serverless or existing-storage options do not satisfy the requirements; free-tier availability MUST be treated as temporary rather than a durability or architecture guarantee.

### Key Entities *(include if feature involves data)*

- **Finance Access Assignment**: Connects an account or budget to an existing individual or group and determines who may read or change its financial data.
- **Financial Account**: A manual or connected checking, savings, credit-card, or loan account with identity, display details, currency, ownership, source metadata, current balances, balance history, and transactions.
- **Balance Snapshot**: An account's balance, available balance when known, currency, and effective instant captured at each accepted update; the latest manual snapshot is the authoritative baseline for calculating a manually maintained account's displayed current balance.
- **Transaction**: A posted, pending, manual, imported, or future financial event associated with an account and optionally with a merchant, transfer, and one or more user allocations.
- **CSV Import Batch**: Account-scoped metadata for one reviewed CSV import, including a content fingerprint, column/date mapping, row outcomes, duplicate warnings, commit state, and counts without retaining the raw file.
- **Transaction Reconciliation**: The state and evidence linking a provisional manual transaction on a connected account to a later provider transaction while preserving the canonical transaction and its user-authored data.
- **Transaction Allocation**: A portion of one transaction assigned an amount, user category, and optional budget item; all allocations for a split transaction must total the source transaction amount.
- **Transfer**: A relationship between transaction records representing movement between accounts, used to prevent double counting.
- **Merchant**: A normalized global catalog identity for a payee or business; its identity is visible to active users while its transaction activity is filtered independently by account and group authorization.
- **Category**: A bank-provided classification or a globally available user-defined classification usable by merchants, transaction allocations, and budget items while preserving its origin, creator, lifecycle state, and historical meaning.
- **Budget**: A group-owned financial plan spanning one or more accounts and an explicit or open-ended period, with items, totals, variance, and reconciliation state.
- **Budget Item**: A planned debit or credit associated with a merchant or description, category, accounts, dates, creator, linked transactions, and reconciliation information.
- **Reusable Budget Item**: A reusable or future-dated source from which budget-specific items can be copied without coupling later edits.
- **Transaction Match**: An automatic, suggested, accepted, rejected, or undone association between transactions and budget items, including the basis for the decision.
- **Reconciliation Record**: Immutable evidence of who reconciled a budget, when it occurred, and which budget state was reviewed.
- **Financial Task Link**: A relationship from a task to a financial item that does not grant access beyond the user's existing finance authorization.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability testing with two representative users covering the individual-owner and group-owner-or-manager perspectives, both users can add or import an account within their permitted scope, assign it correctly, and confirm its latest balance in under three minutes without assistance.
- **SC-002**: In usability testing with the same two representative users, both users can create a date-appropriate multi-account budget, add reusable or direct items, and identify total and category variance in under five minutes without assistance.
- **SC-003**: In a reference set of imports, 100 percent of unambiguous exact merchant-and-amount matches are either matched or clearly presented for review, zero ambiguous matches are made automatically, and all qualifying differences up to and including 20 percent are suggestions rather than automatic matches.
- **SC-004**: Across supported SimpleFIN refresh, CSV re-import, and retry scenarios, no accepted transaction is duplicated and no user allocation, transfer relationship, or reconciliation record is silently lost.
- **SC-005**: For the defined household-scale dataset, the Finance landing page, merchant view, budget view, and filtered transaction search each display useful content within two seconds at the 95th percentile across 20 measured Chromium iterations using a mid-range mobile profile, 4× CPU slowdown, 10 Mbps bandwidth, and 100 ms latency; long refreshes display progress within one second.
- **SC-006**: Authorization tests demonstrate that 100 percent of attempted direct, search-based, task-linked, offline-cached, and aggregate access by unauthorized users reveals no protected finance data.
- **SC-007**: Every simulated partial import, synchronization conflict, and reconciliation failure leaves prior valid data usable, tells the user what was affected, and provides a safe retry or resolution path.
- **SC-008**: All primary Finance journeys complete successfully in current Chrome and Safari/WebKit at desktop, iPhone, and iPad viewport sizes using keyboard and touch interaction as applicable.
- **SC-009**: In acceptance testing with the same two representative users, both users rate account freshness, budget status, match state, and reconciliation history as clear without developer explanation.
- **SC-010**: At the specified normal household usage, the approved estimate targets no more than $5 per month in incremental AWS operating cost above Na'aseh's existing baseline and adds no always-on infrastructure unless a documented review establishes that existing or serverless choices cannot satisfy the requirements. Any forecast above $5 is flagged for Steve's explicit approval; development, migration, restore-test, and unusual one-time costs are reported separately.
- **SC-011**: In acceptance testing with the same two representative users, both users can map, preview, correct, and commit a supported CSV into a manual account without assistance, and 100 percent of invalid rows remain uncommitted with an actionable reason.
- **SC-012**: In the reconciliation fixture set, 100 percent of unique candidates satisfying the exact reconciliation rule attach to the existing provisional transaction, zero ambiguous candidates merge automatically, and no reconciled transaction loses user-owned data.

## Assumptions

- Initial usage is household-scale, with Steve as the primary user and a small number of trusted members in groups such as "Kessler Family."
- Existing Na'aseh authentication, user accounts, groups, membership administration, task access controls, and search experience remain the sources of identity and authorization.
- User-defined category names are part of a global catalog visible to every active Na'aseh user and therefore must not contain private financial details.
- Merchant names and locations are part of a global catalog visible to every active Na'aseh user and therefore must not contain private financial details. By default, any active user may create a merchant, while only its creator or an application administrator may edit or archive a manually created entry.
- Group membership does not automatically expose an individually assigned account; an account must be assigned to the group before other members may access it.
- All active group members may create and edit group budgets, reusable items, manual transactions, CSV imports, classifications, matches, and reconciliations. Only group owners and managers may connect accounts, change account assignments, or delete group-owned financial records, including transactions.
- SimpleFIN Bridge is the initial external account source. Users provide or authorize any required connection through a protected setup flow, and source credentials are never stored in user-visible content.
- Imported source data remains distinguishable from user edits so refreshes can update source fields without discarding classifications or relationships.
- CSV import is account-specific and limited to manually maintained accounts in this release. Files are UTF-8, comma-delimited, at most 10 MB and 50,000 data rows; supported date formats are ISO `YYYY-MM-DD`, `MM/DD/YYYY`, and `M/D/YYYY` selected during mapping. The user maps either one signed amount column or separate debit and credit columns for the entire import. Raw files are parsed locally for preview and are not retained after commit.
- A manual transaction entered on a SimpleFIN-managed account represents an expected or already-observed transaction and is provisional until provider reconciliation. Automatic reconciliation uses the unique same-account, same-currency, same-signed-amount, exact-normalized-payee-or-description, plus-or-minus-three-day rule. Text normalization ignores case, punctuation, and repeated whitespace; fuzzy or partial matches remain separate for review.
- A manually maintained account may receive later balance snapshots from a statement or user observation. The latest snapshot establishes the authoritative balance at its effective instant, so transactions at or before it are historical and only later transactions alter the displayed current balance.
- A transaction amount is a required financial attribute even though it was omitted from the pasted field list; debit and credit direction must be unambiguous. Splits are represented as allocations while the source transaction and its total remain unchanged.
- Exact automatic matching means one unique candidate with the same normalized merchant, amount, relevant account context, and applicable budget period. Near matching includes amount differences from greater than zero through 20 percent inclusive and always requires confirmation.
- No currency conversion is assumed for the first release; mixed-currency totals remain separated unless a later specification defines conversion rules.
- Existing search may be extended rather than replaced, provided the required toggles, defaults, access rules, and account scope are met.
- Offline use prioritizes safe review and queued edits. External refreshes and reconciliation completion wait for a confirmed connection because presenting incomplete data as final would create financial risk.
- Storage technology is a planning decision. MySQL-compatible Amazon storage is a candidate, not a requirement; existing or managed serverless storage is preferred when it meets security, durability, search, backup, recovery, and cost needs.
- Financial report export, bill payment initiation, investment tracking, tax preparation, currency conversion, and bank-account credential management beyond the SimpleFIN connection are outside this feature's scope.
