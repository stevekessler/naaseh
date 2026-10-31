# Navigation and UI Contract

## Main navigation and destinations

Primary order: Tasks, Lists, Finance, Journal, Search, Admin (Admin only when authorized). Existing secondary task/list tools remain reachable in their existing contextual menus; do not delete archive, stack, groups, or other tools to achieve primary order.

Finance dropdown: Dashboard, Accounts, New Account, Transactions, Upcoming Expenses, Budgets, Categories, Merchants, Receipts, Reports. `/finance` is the dashboard. Destinations:

- `/finance/accounts`, `/finance/accounts/new`, `/finance/accounts/:id`
- `/finance/transactions`, `/finance/transactions/:id`
- `/finance/upcoming-expenses`, `/finance/upcoming-expenses/new`, `/finance/upcoming-expenses/:id`
- `/finance/budgets`, `/finance/budgets/:id`, existing contextual reusable/matching/reconciliation journeys
- `/finance/categories`, `/finance/merchants`, `/finance/merchants/:id`
- `/finance/receipts`, `/finance/reports`, `/finance/reports/spend`

Specific `new` routes precede generic `:id` parsing. Transaction detail is a modal route with saved background location, query, table scroll and focus. Direct entry renders over Transactions. Closing restores background/history; following a budget link closes the modal and opens its full page. Every page loads through one route model; component-local subviews must not contradict the URL.

Current SimpleFIN requires no application-wide registration/credential, so the conditional Admin setup destination is intentionally absent. Per-connection protected token setup remains under Accounts/New Account according to scope permissions.

## Accounts and transaction entry

Account detail groups summary, balance/freshness/ownership, Include on my Finance dashboard, primary Add Transaction/Add Upcoming Expense actions, edit forms, scoped transaction table, and separately labeled destructive actions. The account list offers the New Account destination. Manual Add Transaction is available for all editable sources, including SimpleFIN; its status is visibly Provisional where relevant. Saving opens/updates the transaction and table exactly once.

Table fields and combined filters follow [finance-api.md](finance-api.md). At narrow widths use labeled rows/cards or a table with its own horizontal-scroll region; never page-wide scroll for core actions. Preserve active filters when a modal opens/closes. Receipt and related-task actions appear in transaction details. No source-budget access means no budget name/link/count decoration. Transaction details offer Link refund to original expense and versioned correct/remove actions when the viewer may edit the credit and read the original. Show original association defaults and explicit refunded-allocation amount confirmation for partial split refunds. Unlinked credits are not assumed refunds; pending/review links are labeled and only posted valid amounts reduce Spend on the received date. Never expose an inaccessible original or copy its private data into a shared view.

## Upcoming Expenses

Dashboard, account and list offer Add Upcoming Expense. Required labels: Description, Expected amount, Date, Account, Budget, Group. Group values come from memberships; budget/account choices show only valid options and retain entered values when another field requires correction. Account context preselects the account. Empty required reference selectors explain how to create a budget or obtain group membership. Save never creates an actual payment. Capture the creating browser local day/time zone at original confirmation; preserve the selected date if an offline entry syncs after it becomes overdue. Never force a new date solely because connectivity returned late. Ordinary new budgets save active immediately; budget detail offers Deactivate/Reactivate independently of Close/Reopen/archive. Inactive budgets are absent from new/reassigned expense choices but existing linked expenses stay manageable and visible in upcoming/overdue lists.

List/detail show due date, amount/currency, account, budget/group when authorized, status, posted fulfilled amount and remaining amount. Separate overdue from future rows. Edit/reschedule/cancel/reopen and explicit fulfillment linking use version checks and clear confirmation where their financial history changes. Add Task is a visible button on every expense transaction and upcoming-expense detail; related tasks remain navigable when authorized.

## Task creation and optional display

Reuse the task form for Finance shortcuts and normal task creation/editing. Add optional Link Finance Item searchable selector with Upcoming Expenses/Transactions types and multiple selections. No selection is required to create an ordinary task. Default task title from Finance is generic; the user can choose task content/sharing without automatic private-value copying.

Task column settings include Upcoming Expenses, initially off. Post-it display settings offer equivalent detail, initially off. Selected displays show linked description/date/amount/currency/account/status with accessible navigation and distinguish multiple records. They preserve existing per-user/layout preference behavior. Locked views show a generic Unlock Finance action without protected details; unauthorized viewers have neutral empty/hidden content rather than a count of hidden links. Unlock can occur in place for authorized viewers. Completing a task changes only the task.

## Dashboard, charts and Spend

Widgets independently distinguish loading, empty, stale, partial and failed. Include-on-dashboard flags are personal; no selections show a next action. Upcoming selector offers 5/10/15/20 (default 10). Account cards show currency and freshness. Budget status labels Percent used, Amount spent and Amount left; zero planned means Not applicable and negative left means Overspent. Inactive/closed budgets disappear from the open section without losing history or personal flags. New confirmed budgets start active; Reactivate restores activity only and does not reopen a separately closed/archived budget. Legacy drafts are preserved and expose explicit Save as active rather than requiring a hidden activation step.

Two recent-activity sections each show latest ten matching accessible transactions; matching multiple flags does not duplicate rows within one section. Category flags include historical child classifications. Trends use a simple line chart and readable values table, month/quarter/year modes with 12/8/5 periods, current-partial-period labels, explicit currency and multi-account selection. Spend opens current month/all accessible accounts, supports the contracted filters, and preserves scope on modal close. Never display a first-page subtotal as an exact full report total. Actual matching rows or confirmed full-scope empty state appear within the two-second target; exact connected transaction/report counts/totals complete automatically within ten seconds, and progress appears within one second. Progress alone and empty pages with continuation are not usable results. Keep loading/row readiness and aggregate readiness distinct, including on cold or zero-match scopes.

## Receipt UX and safety

Upload accepts the specified file formats and exact per-file limit with progress/cancel/retry. Keep locally pending distinct from uploaded/checking/available. View and Download are explicit actions; Office files show a clear download fallback. For supported preview, construct a local verified Blob after authorized chunk transfer, isolate PDF preview, and revoke Blob URLs on lock. Cached offline files show last-known availability and current connectivity limits. The browser's saved original is outside later app revocation.

## Interaction and layout acceptance

Use a shared 5px minimum action gap token on adjacent button/button and button/text-entry pairs across the application, including wrapped and modal controls. Do not apply indiscriminate margins to all elements and break layouts. Audit real computed bounding-box gaps at desktop, 375px phone and 768px tablet widths. Minimum gap is separate from usable touch target sizing.

Dialogs have accessible names, keyboard focus containment, dismissal and restoration; dropdowns are keyboard/touch operable. Errors identify what remains saved and the next safe action. Graph values are readable without color or pointing. Test current Chromium/WebKit plus phone/tablet responsive layouts; keep exhaustive combinations out of required quick validation unless its measured budget allows them.
