# Finance UI Contract

## Navigation and Routes

- Add a top-level authenticated **Finance** tab at `/finance`.
- Finance child routes are:
  - `/finance/accounts` and `/finance/accounts/{accountId}`
  - `/finance/transactions`
  - `/finance/merchants` and `/finance/merchants/{merchantId}`
  - `/finance/budgets` and `/finance/budgets/{budgetId}`
  - `/finance/reusable-items`
- Opaque ULIDs are used in merchant and finance detail routes; no friendly slug is required.
- Unauthorized protected records resolve to the existing not-found presentation, not an existence-revealing forbidden page.

## Finance Landing Page

- Shows accessible accounts with friendly name, type, current balance, available balance when present, currency, balance date, and freshness state.
- Shows current group budgets with period, planned/actual/variance totals by currency, reconciliation state, and `Complete` or `Incomplete totals` status.
- Provides clear actions for creating an account without SimpleFIN and, when the actor is eligible, connecting SimpleFIN.
- Never waits for all transaction history before showing account and budget summaries.

## Connection and Refresh

- The connection form explains that the setup token is one-time sensitive data and is sent directly to Na'aseh for server-side claim; it is never redisplayed.
- Group selection includes only groups where the actor is owner or manager. Individual scope selects the current user.
- A successful claim replaces the token field with sanitized connection identity and starts an initial import job.
- Refresh shows `Queued`, `Refreshing`, `Partially refreshed`, `Up to date`, or `Needs attention`, with last successful time and safe retry guidance.
- A one-hour cooldown disables repeat refresh and announces the next eligible time. Offline state disables claim/refresh with an explanation.
- Partial provider errors identify only the affected accessible connection/account and what data remains valid.

## Accounts and Transactions

- Account detail supports friendly-name editing, balance history, data freshness, transaction date filtering, cursor pagination, and authorized archive/delete preview. Every destructive preview states whether the result is archive, durable tombstone, or permanent deletion and lists authorization-filtered impact counts. Permanent deletion is offered only for an unreferenced draft or mistake. A manual account offers **Record balance** to the owner or any active assigned-group member and explains that the new dated snapshot becomes the baseline while older transactions remain history.
- Transaction rows/cards show posted/transacted date, pending state, description/payee, amount, merchant, category allocations, budget links, transfer status, and review state.
- Narrow screens use labeled cards or responsive rows without horizontal dependence for primary actions; desktop may use a table.
- Transaction search can target one selected account or all accessible accounts and reports when local indexing is still in progress.
- Split editing keeps the original transaction total visible, shows allocated and remaining amounts, prevents submit until the exact minor-unit sum balances, and supports keyboard/touch add/remove/reorder actions.
- Imported source fields are visually distinct from editable user classifications.
- A manually maintained account offers **Import CSV** to its owner or any active assigned-group member. The wizard validates the 10 MB/50,000-row limit, lets the user map date, description, optional payee/memo, date format, and either one signed amount column or separate debit/credit columns, then shows sample rows, accepted/rejected counts, row reasons, exact-file replay status, and suspected duplicates.
- Suspected duplicates open a sequential review step showing only authorized row/candidate values. Each requires **Include** or **Exclude**; confirmation remains disabled while any are unresolved. If the server discovers a new suspect at commit, the wizard returns to that review without committing the row.
- CSV confirmation states that only valid included rows will be committed. Progress survives chunk retries, cancellation before confirmation stores nothing, and the UI never uploads or retains the raw file or filename.
- A SimpleFIN-managed account permits **Add provisional transaction**. Provisional, reconciled, review-required, and kept-separate states are visible without conflating provider reconciliation with budget reconciliation.
- An automatic provider reconciliation shows the preserved canonical transaction, original entry snapshot, attached provider snapshot, and the exact criteria that matched. Ambiguous candidates provide an authorization-filtered comparison with reconcile and keep-separate actions. Fuzzy, substring, empty, or cross-field text matches never appear as automatic; a stale version or identity-lock conflict asks the user to refresh instead of partially merging.
- Any active assigned-group member may add/edit manual transactions, import CSV, record balances, and resolve provider reconciliation. Transaction deletion and destructive previews appear only for the individual owner or group owner/manager.
- Referenced transactions, budgets, reusable items, matches, and financial task links expose archive/tombstone behavior rather than permanent deletion; catalog archive remains creator/admin-only and preserves historical labels.

## Merchants and Categories

- Merchant search is opt-in from general search and lists global active merchant identities without activity counts.
- Merchant detail shows global name/location/category and a separate authorized activity section. A user with no accessible activity receives an ordinary empty state; no hidden count or total is shown.
- Category and merchant creation warns that names/locations are visible to all active users and must not contain private financial details.
- Rename/archive controls appear only to the creator or application administrator. Archived identities remain on historical records and are excluded from new pickers.

## Budgets

- Budget creation requires group, name, start date, budget date, and optional end date. Open-ended status is explicit.
- Account selection clearly distinguishes group accounts from private accounts. Adding a private account warns that other group members may see incomplete totals but no private identity or amount.
- Budget detail groups totals by currency and category; it never shows a cross-currency grand total.
- Each item shows planned, actual, variance, category, merchant/description, occurrence date, source reusable item, and linked-transaction count visible to the viewer.
- Reusable items may be copied or offered for an applicable future/recurring occurrence. Editing a copy states that the reusable source is unchanged unless a separate source edit is chosen.
- Exact unique matches are labeled automatic and undoable. Near/ambiguous matches appear as suggestions with accept/reject controls and their safe basis, without exposing inaccessible candidates.
- Reconcile is enabled only when totals are complete, allocations are valid, refresh is not pending, and the client is online. Failure explains the missing prerequisite.
- A post-reconciliation change displays `Changed since reconciliation` and retains prior history.

## Financial Tasks

- A budget item offers **Create task** and pre-fills only user-approved non-sensitive fields such as label and due date.
- Finance-authorized task viewers see a related-financial-item control supplied by the finance cache.
- A task viewer without finance access sees no link, finance label, amount, merchant, budget name, or inaccessible-state hint.

## General Search

- Search has independent include toggles:
  - Tasks: on by default
  - Lists: on by default
  - Transactions: off by default
  - Merchants: off by default
- Transaction results obey account scope and finance authorization. Merchant results come from the global active catalog but contain no activity signal.
- Toggle state is represented in safe URL state or preferences without placing the query text in telemetry.
- Results announce count, content types being searched, local-index progress, offline completeness, and empty/error states.
- Finance provides no export action, route, or downloadable data format in v1.

## Offline, Sync, and Conflict States

- Every finance page shows connection state, last synchronization time, pending change count, and conflicts relevant to the current view.
- Supported local edits and CSV commit chunks display `Pending sync` until accepted. CSV parsing/preview remains available offline; connection, refresh, provider-reconciliation decisions, budget reconciliation, reassignment, and deletion remain visibly online-only.
- Conflicts compare only values the current user may access and provide Keep mine, Use current, or Review later where semantically safe. Account/source identity and reconciliation conflicts require online refresh rather than blind overwrite.
- Revocation immediately closes an open protected route after tombstone processing, clears in-memory search, and returns to Finance with a generic access-changed message.

## Accessibility and Responsive Behavior

- All forms have persistent labels, field-level errors, error summaries, and logical focus movement.
- Status changes use restrained `aria-live` announcements; balances and amounts are not repeatedly announced during background refresh.
- Tables have semantic headers at desktop and equivalent labels in mobile card layouts.
- Charts, if later added, are supplemental and require equivalent textual totals; charts are not required for v1.
- All primary actions work by keyboard and touch with at least the existing application target size.
- Verify current Chrome and Safari/WebKit at desktop, iPhone, and iPad viewports. Do not rely on background sync execution unavailable to Safari.

## Error and Empty-State Language

- Errors state what action failed, what remains saved/current, and the next safe action.
- Provider messages are sanitized and never display Access URLs, credentials, raw payloads, internal stack traces, or unrelated account details.
- `Incomplete totals` never identifies a hidden account or contribution.
- Empty states distinguish no records, filters with no match, local index still building, offline cache incomplete, and access removed.
- CSV errors distinguish file-level failures from row-level validation and identify the safe correction without echoing other rows or protected content into telemetry.
