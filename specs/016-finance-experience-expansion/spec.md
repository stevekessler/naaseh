# Feature Specification: Finance Experience Expansion

**Feature Branch**: No new branch requested or created; specification authored on `codex/task-item-creation-uploads`.

**Feature Directory**: `specs/016-finance-experience-expansion`

**Created**: 2026-10-30

**Status**: Draft — validated and ready for planning.

**Input**: Expand Na’aseh Finance with reordered navigation, dedicated Finance pages and conditional application-wide SimpleFIN administration, a separate user-controlled Finance PIN, improved accounts and transaction browsing, check numbers and payment types, merchant editing, working existing-group budget selection, application-wide button spacing, transaction receipts and receipt browsing, subcategories, personal dashboard inclusion flags, a default Finance dashboard, and a filterable Spend report. This specification covers all 26 original requests and the six follow-up requests for manual transactions, first-class upcoming expenses, and task/post-it integration.

## Clarifications

### Session 2026-10-30

- Q: How should refunds reduce reported spending? → A: Link each refund to its original expense; default to that expense’s budget/category, support partial refunds, and count the refund on the date it was received.
- Q: When should a newly created budget become active? → A: New budgets are active immediately after saving; authorized budget editors can deactivate and reactivate them.
- Q: How quickly should transaction lists and reports show usable results? → A: Show the first results or a confirmed no-results state within two seconds; complete exact totals within ten seconds, with progress while calculating. A loading indicator alone is not usable results.

### Session 2026-10-31

- Q: What should happen if an upcoming expense entered offline becomes overdue before it syncs? → A: Keep the date selected in the browser’s local calendar, synchronize it with that original date, and show it as overdue if it is still unpaid; do not require a new future date just because synchronization was delayed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate Finance and Manage Accounts (Priority: P1)

As a user, I can find Finance in a predictable main menu, open its dashboard, and create or inspect financial accounts on dedicated pages with clear information and controls.

**Why this priority**: These entry points make the rest of Finance discoverable and resolve the crowded account interface.

**Independent Test**: Navigate the main menu, open Finance, use New Account, save an account, and return to its detail page without using dashboard data beyond its empty state.

**Acceptance Scenarios**:

1. **Given** an administrator, **When** the main menu appears, **Then** its primary entries are Tasks, Lists, Finance, Journal, Search, Admin in exactly that order; a non-administrator sees the same order with Admin omitted.
2. **Given** a user permitted to enter Finance, **When** they select Finance itself, **Then** the Finance dashboard opens; the Finance dropdown offers Dashboard, Accounts, New Account, Transactions, Upcoming Expenses, Budgets, Categories, Merchants, Receipts, and Reports.
3. **Given** New Account is selected, **When** the user enters valid account information, **Then** creation occurs on its own page and opens the saved account; incomplete input remains available with field-specific errors.
4. **Given** a saved account, **When** its detail page opens on desktop or phone, **Then** its identity, formatted balance and currency, freshness, dashboard flag, relevant actions, and transaction table are clearly separated and usable.
5. **Given** application-wide SimpleFIN configuration is required, **When** an administrator opens Admin, **Then** a dedicated SimpleFIN Setup page exposes the needed configuration and status without revealing connection secrets; ordinary users cannot access it.

### User Story 2 - Protect Finance with My Own PIN (Priority: P1)

As a user, I can choose to require my own Finance PIN, manage it using my password, and keep Finance locked until I supply that PIN.

**Why this priority**: The additional privacy boundary must work before new Finance entry points expose data.

**Independent Test**: Enable protection for one user, visit Finance through menu and direct links, reset the PIN using that user's password, and verify another user and an administrator cannot manage that PIN.

**Acceptance Scenarios**:

1. **Given** protection is off, **When** I verify my password and set and confirm a Finance PIN, **Then** I can enable Require PIN for Finance; enabling without a valid PIN is prevented.
2. **Given** protection is on and Finance is locked, **When** I use the menu, a saved Finance link, search, a linked task, browser history, or a receipt link, **Then** Finance content remains hidden until I enter the correct Finance PIN, after which my intended destination opens.
3. **Given** Finance is locked, **When** I supply an incorrect PIN or cancel, **Then** protected content stays hidden; repeated incorrect submissions are limited and the retry guidance is visible.
4. **Given** I forgot my Finance PIN, **When** I verify my own current password and set and confirm a replacement, **Then** Finance data remains intact, prior Finance unlocks are invalidated, and my Journal PIN is unaffected.
5. **Given** an administrator viewing another user's settings, **When** they use account management, **Then** they may reset that user's password under existing rules but cannot read, set, clear, reset, or disable that user's Finance PIN or requirement.
6. **Given** Finance has been unlocked, **When** I leave Finance, explicitly lock it, sign out, or end the browser session, **Then** a subsequent Finance entry requires the PIN; moving between Finance pages during the same unlocked visit does not.

### User Story 3 - Inspect Transactions from an Account (Priority: P1)

As a user, I can filter an account's transactions, open a transaction in a modal, and follow its budget relationship to a full page.

**Why this priority**: Transaction review is the core daily account workflow.

**Independent Test**: Seed an accessible account with transactions and budget links; filter its table, open a row, inspect details, and follow a budget link.

**Acceptance Scenarios**:

1. **Given** an account with transactions, **When** its page opens, **Then** a transaction table appears below the account summary with date, description/payee, merchant, amount/currency, category/subcategory, payment type, check number, and receipt availability.
2. **Given** populated transactions, **When** I combine text, a single date or inclusive date range, exact amount or inclusive amount range, account name, and check-number filters, **Then** only matching accessible transactions appear; clearing filters restores the account's records.
3. **Given** a filtered table, **When** I follow a transaction link, **Then** transaction details open in a labeled modal; closing it restores the original filters, position, and keyboard focus.
4. **Given** a transaction allocated to one or more budgets, **When** I open its modal, **Then** every accessible linked budget has a link that opens its full budget page and closes the modal; inaccessible budget details are absent.
5. **Given** the Transactions menu page, **When** I select one or more accessible accounts and apply the same filters, **Then** I can review transactions across that scope using the same detail behavior.

### User Story 4 - Record Payment Details and Classify Spending (Priority: P1)

As a user, I can record check numbers and payment types, use category/subcategory pairs, and correct merchants with the permissions already established for the catalog.

**Why this priority**: Accurate transaction metadata supports reliable searching, receipt discovery, and reports.

**Independent Test**: Edit a transaction's payment details, assign Food → Eating Out, and edit a merchant as an authorized catalog editor.

**Acceptance Scenarios**:

1. **Given** an editable transaction, **When** I save a check number such as `000123` and payment type Check, **Then** both values survive reopening and synchronization with the leading zeros intact.
2. **Given** a new or existing transaction, **When** I choose its payment type, **Then** Cash, Check, Card, ACH, and Digital (Other) are available; an existing or imported transaction without a known type remains visibly unspecified rather than being misclassified.
3. **Given** Food and its Eating Out subcategory, **When** I classify an allocation or budget item, **Then** the subcategory belongs to the selected parent, both labels appear together, and incompatible combinations cannot be saved.
4. **Given** a merchant I created or administrator privileges, **When** I edit its name, city, region, or default category, **Then** allowed changes persist without losing transaction relationships or original provider descriptions; an unauthorized user cannot edit it.

### User Story 5 - Save Budgets Using Existing Groups (Priority: P1)

As a group member, I can select a group I already belong to and save a budget even when that group has no Finance accounts or budgets yet.

**Why this priority**: The current group-selection behavior prevents budget creation.

**Independent Test**: Use an active existing group with no Finance records, select it by name, save an immediately active budget, and deactivate/reactivate it while retaining its history and existing relationships.

**Acceptance Scenarios**:

1. **Given** I belong to existing active groups, **When** I create or edit a budget, **Then** the group selector lists eligible groups by their display names independently of existing accounts or budgets.
2. **Given** an eligible group with no accounts, **When** I submit a valid budget with no account association, **Then** it saves as active for that group, is immediately eligible for upcoming-expense selection and dashboard inclusion, and can receive authorized accounts later.
3. **Given** I have no eligible groups, **When** I open the form, **Then** it explains the missing membership and provides an available group-management path without requiring me to type an identifier.
4. **Given** membership is revoked before saving, **When** I submit, **Then** the save is denied with an actionable explanation and my unsaved input remains available without granting access to the group.
5. **Given** an active budget I may edit, **When** I deactivate it, **Then** it is clearly marked inactive, is excluded from open-budget dashboard status and new upcoming-expense budget choices, and retains its transactions, reconciliation history, dashboard flag, and existing upcoming-expense/task links.
6. **Given** an inactive budget I may edit, **When** I reactivate it, **Then** it becomes eligible again where otherwise open and authorized, using its existing records and saved dashboard flag rather than creating a copy.

### User Story 6 - Attach and Find Receipts (Priority: P2)

As a user, I can attach receipts to any transaction I may edit, view or download them, and find them together on a Finance receipt browser page.

**Why this priority**: Receipts complete the transaction record and make financial follow-up easier.

**Independent Test**: Attach supported documents to a transaction, view/download them, then find the same documents using receipt-browser filters.

**Acceptance Scenarios**:

1. **Given** any editable manual, imported, provisional, or posted transaction, **When** I upload a valid PDF, JPG/JPEG, PNG, Word, or Excel file no larger than 10 MB, **Then** it becomes a named receipt attached to that transaction, with visible completion status.
2. **Given** an oversized, unsupported, corrupt, or unsafe file, **When** I attempt attachment, **Then** it is rejected with an actionable reason and existing receipts and transaction details remain intact.
3. **Given** an accessible receipt, **When** I open the transaction modal, **Then** I can see its name, type, size, upload status, and View and Download actions; PDF/images preview when supported, and documents without preview offer a clear download alternative.
4. **Given** multiple receipts, **When** I combine transaction date/range, budget, category/subcategory, and vendor/merchant filters on Receipts, **Then** matching receipts and links to their transactions appear without exposing inaccessible records.
5. **Given** revoked transaction access or a locked Finance visit, **When** I reuse a receipt link or try downloading, **Then** receipt content and protected metadata are denied until all required access and unlock conditions are satisfied.

### User Story 7 - Personalize and Use the Finance Dashboard (Priority: P2)

As a user, I can flag accounts, budgets, categories, and merchants for my dashboard and see upcoming obligations and relevant recent activity at a glance.

**Why this priority**: A useful default landing page reduces repeated navigation and makes important Finance information visible.

**Independent Test**: Flag representative records for one user, open Finance, and compare the dashboard with known balances, budgets, due dates, and transactions; another user's flags remain unchanged.

**Acceptance Scenarios**:

1. **Given** accessible accounts, budgets, categories, and merchants, **When** I toggle Include on my Finance dashboard on each relevant page, **Then** my choice persists across visits/devices and changes only my dashboard.
2. **Given** upcoming expenses, **When** the dashboard opens, **Then** the next 10 expenses appear ordered by due date and I can choose 5, 10, 15, or 20; fewer available expenses produce fewer rows with an understandable empty state if none exist.
3. **Given** flagged accounts and open budgets, **When** I view the dashboard, **Then** each account shows its current balance, currency, and freshness, and each open budget shows percent of budget used, amount spent, and amount left including overspending.
4. **Given** flagged merchants and categories, **When** I view recent activity, **Then** I see the latest 10 matching transactions in each of the merchant and category sections, with transaction links; overlapping flags do not duplicate a transaction within a section.
5. **Given** a flagged record becomes inaccessible or a budget closes, **When** the dashboard refreshes, **Then** inaccessible data disappears and closed budgets are excluded from the open-budget section.

### User Story 8 - Compare Spending Over Time (Priority: P2)

As a user, I can compare month, quarter, or year spending on the dashboard for one or more accounts.

**Why this priority**: Trends explain changes in spending that balances alone cannot show.

**Independent Test**: Use known transaction totals across period boundaries and switch accounts and period modes; verify the line graph and its readable values agree with those totals.

**Acceptance Scenarios**:

1. **Given** accessible transaction history, **When** I open the trend panel, **Then** a month-over-month spending line graph shows the latest 12 calendar months including the current partial month, identifies the current partial period, and includes a readable equivalent of its values.
2. **Given** the graph, **When** I select one or several accounts or switch to quarter-over-quarter or year-over-year, **Then** it recalculates for exactly those accounts and shows the latest 8 calendar quarters or 5 calendar years respectively.
3. **Given** transfers, refunds, pending transactions, split transactions, or mixed currencies, **When** trends are calculated, **Then** they follow the explicit spending rules below without double counting or silently combining currencies.
4. **Given** an accessible expense and a later partial refund, **When** an authorized editor links the refund to that expense and confirms the refunded allocation amounts, **Then** the original budget/category associations are offered by default, spending decreases on the refund’s received date, the original expense period is unchanged, and retries do not count the refund twice.

### User Story 9 - Run a Spend Report (Priority: P2)

As a user, I can open Finance Reports and inspect spending filtered by date, budget, account, merchant, category, and subcategory.

**Why this priority**: The report supports focused questions beyond the personalized dashboard.

**Independent Test**: Open Spend, combine every supported filter using a known fixture, and compare the totals and linked transactions with the expected result.

**Acceptance Scenarios**:

1. **Given** Reports is opened, **When** I select Spend, **Then** I see its date scope, matching transactions and totals, and filters for a date or inclusive date range, budget, account, merchant, category, and subcategory.
2. **Given** filters across several dimensions, **When** I apply them, **Then** all dimensions must match and totals reflect only matching amounts, including allocation-level budget and category amounts without duplicating a transaction.
3. **Given** a matching transaction, **When** I follow its link, **Then** it opens in the transaction modal and closing it preserves the report filters; zero results show a clear empty state and zero totals for the selected currency.
4. **Given** a large connected Spend report at the specified household scale, **When** I apply filters, **Then** matching rows or a verified full-scope no-results state appear within the two-second target, exact counts/totals complete within ten seconds, and visible progress/partial labels distinguish calculation from final values; showing only progress does not pass the results target.

### User Story 10 - Manually Add a Transaction to Any Account (Priority: P1)

As an authorized account editor, I can manually enter a transaction for any accessible account, including an account connected to SimpleFIN.

**Why this priority**: Every account needs a usable manual-entry path, even when provider data has not arrived.

**Independent Test**: Add a manual transaction to a manually maintained account and a SimpleFIN account, reopen each record, and reconcile the latter with a later provider import.

**Acceptance Scenarios**:

1. **Given** an account I may edit, **When** I choose Add Transaction from its page, **Then** a transaction form opens with that account selected; the Transactions page also offers Add Transaction with a selector for all accounts I may edit.
2. **Given** valid date, amount/direction, currency, and description/payee, **When** I save, **Then** the transaction appears once under the selected account and in Transactions, retains payment details and classifications, and follows existing balance rules.
3. **Given** a SimpleFIN account, **When** I save a manual transaction, **Then** it is visibly provisional and does not alter the provider-reported balance; later provider reconciliation preserves its identity, user metadata, receipts, and task links without duplicating spending.
4. **Given** invalid input or revoked edit access, **When** I save, **Then** no transaction is created and a clear error preserves my entered values for correction or authorized reassignment.

### User Story 11 - Enter and Manage Upcoming Expenses (Priority: P1)

As a user, I can enter a future expense called an Upcoming Expense, assign its date, account, budget, and group, and find that same record on the Finance dashboard.

**Why this priority**: The dashboard needs explicitly entered future obligations, separate from transactions that already occurred.

**Independent Test**: Create an upcoming expense, verify its required relationships and dashboard appearance, reschedule it, then link an actual transaction and verify it is not counted twice.

**Acceptance Scenarios**:

1. **Given** eligible accounts, budgets, and groups, **When** I choose Add Upcoming Expense from the dashboard, account page, or Upcoming Expenses page, **Then** I can enter its description, expected amount, future date, account, budget, and existing group; account entry preselects that account.
2. **Given** all required fields and compatible relationships, **When** I save, **Then** one Upcoming Expense is stored and appears in the Upcoming Expenses page and the dashboard's next-expenses list when within the selected count; no posted transaction or balance change is created.
3. **Given** missing date/account/budget/group or a budget from another group, **When** I save, **Then** the form explains what must change and preserves my input; missing eligible budgets/groups provide a path to the existing creation/membership workflow rather than an empty unexplained selector.
4. **Given** an upcoming expense, **When** I change its future date or cancel it, **Then** the dashboard reflects the same record's updated state; an unpaid record whose date passes remains visible as overdue.
5. **Given** a payment transaction for an upcoming expense, **When** I explicitly link it as fulfillment, **Then** the expense's paid/remaining state updates, fully paid expenses leave the active upcoming list, and reporting counts the actual transaction rather than the planned amount.
6. **Given** I entered an upcoming expense offline with a date future in my browser’s local calendar at that time, **When** I reconnect after that date has passed, **Then** synchronization preserves the original selected date and accepts the otherwise valid expense, shows it as overdue if unpaid, and does not require a new date; changing time zones does not shift its selected calendar date.

### User Story 12 - Connect Tasks and Post-its to Expenses (Priority: P2)

As a user, I can create a related task from any expense transaction or upcoming expense, link a task while creating it, and optionally show upcoming expense details in task tables and post-it views.

**Why this priority**: These links turn planned financial obligations into actionable work without creating separate copies of financial data.

**Independent Test**: Create a task from an upcoming expense and an expense transaction, create another task using the Finance link selector, and toggle the Upcoming Expenses display in task and post-it views for authorized, locked, and unauthorized users.

**Acceptance Scenarios**:

1. **Given** an accessible expense transaction or upcoming expense, **When** I select Add Task, **Then** the task creation form opens with that financial record selected, allows normal task editing, and saves a task linked to the existing record; cancelling creates neither a task nor a link.
2. **Given** I am creating or editing a task, **When** I use Link Finance Item, **Then** I can search eligible upcoming expenses or transactions by type and select one or more; saving preserves the relationships without creating duplicate financial records.
3. **Given** linked tasks and financial records, **When** I view either side with permission, **Then** I can navigate to the other; an expense transaction opens in its transaction modal and an upcoming expense opens its detail view.
4. **Given** task-column or post-it display settings, **When** I enable Upcoming Expenses, **Then** linked upcoming expenses show description, date, amount/currency, and account with navigation; disabling hides the column or equivalent post-it detail, and the preference persists per user under existing display-preference behavior.
5. **Given** a task viewer without financial access or with Finance locked, **When** the task/post-it renders or is exported, **Then** no protected expense details, identifiers, counts, or financial metadata are disclosed; a permitted locked viewer can unlock the embedded Finance view without leaving the task.
6. **Given** a task linked to an upcoming expense, **When** I complete or delete that task, **Then** the expense is not automatically paid, cancelled, deleted, or posted as a transaction; changing the financial record updates its linked display independently.

### Edge Cases

- An offline expense was validly future-dated when entered but becomes overdue before reconnection, or the user/server changes time zones; validate against the original entry’s local calendar context and preserve the date-only obligation rather than rejecting, moving, or duplicating it solely because synchronization was delayed.
- A budget is deactivated while a new upcoming expense is being saved; reject the new association with retained input, while preserving and allowing authorized management of pre-existing linked obligations. Reactivation must not reopen a separately closed budget or duplicate historical records.
- Manual transaction entry is retried offline or a provider import arrives during editing; the canonical transaction and all task/receipt relationships survive without duplicate records.
- A new upcoming expense has a missing required budget/group, incompatible account scope, past date, wrong-currency amount, revoked permissions, or a budget closed during editing; saving fails with actionable guidance and retained input.
- An upcoming expense passes its due date, is partly paid, is overpaid, or links to a transaction later reversed; remaining amount and overdue/paid status stay explicit, and unmatching restores the correct outstanding amount.
- A budget item/reusable occurrence and an upcoming expense describe the same obligation; the dashboard uses the canonical Upcoming Expense identity rather than counting both sources. Similar text/amount alone must not merge distinct obligations.
- A shared task has viewers without account/group access, task creation is cancelled, or task save succeeds while financial linking fails; no financial details leak and partial success has an explicit retry path without a duplicate task.
- A task has several upcoming-expense links, the same expense has several tasks, or a linked record is cancelled/archived; optional columns and post-its remain readable and show only authorized current status.
- An account's first transaction, an empty dashboard, no upcoming expenses, no eligible groups, or no receipts offers a useful next action rather than a broken layout.
- An amount range is reversed, a date range is reversed, a check number has leading zeros, or a single date crosses a time-zone/day boundary; invalid ranges do not silently produce misleading results.
- Split allocations match several selected budgets/categories; reports count each qualifying allocation once and account totals count the source transaction once.
- A refund arrives in a later reporting period, several partial refunds reference one expense, a partial refund covers only selected original allocations, or a link is removed/retried; classify the offset from confirmed refunded allocations on the refund’s received date without changing original-period totals or exposing inaccessible expense details.
- Refunds exceed spending, a budget has zero planned expenses, a budget is overspent, a period has no transactions, or the current period is incomplete; labels and calculations remain explicit.
- A transaction links to several budgets or an inaccessible budget; only accessible links appear, with no private names or totals disclosed.
- Finance is opened through a saved transaction or receipt link, another tab remains open during a PIN reset, or cached content is restored through browser history; lock and authorization rules still apply.
- A password reset by an administrator does not itself reset or disable a Finance PIN. Password recovery still permits the account holder's password-authenticated PIN reset; this is an account recovery boundary, not an additional identity-proofing system.
- Connectivity is lost during upload, local storage is full, a receipt finishes uploading after its transaction is deleted, or a retry repeats a completed upload; no false success, orphaned accessible receipt, or duplicate attachment results.
- A disguised executable uses an allowed extension, an Office document contains active content, or preview is unsupported; unsafe content never runs in Na’aseh and safe download fallback remains available for accepted files.
- Membership, account assignment, or transaction access changes while a modal, receipt, report, or dashboard is open; subsequent reads/actions obey current access and cached protected content is removed under existing revocation rules.
- Concurrent merchant edits, category archival/reparenting, or provider refresh during transaction edits preserve relationships and present conflicts without silent overwrite.
- Chrome and Safari/WebKit differ in download, preview, local storage, or mobile modal behavior; keyboard/touch journeys remain usable on desktop, iPhone, and iPad.

## Requirements *(mandatory)*

### Functional Requirements

#### Navigation and Account Experience

- **FR-001**: The main menu MUST order its primary entries Tasks, Lists, Finance, Journal, Search, Admin; Admin MUST appear only for authorized administrators.
- **FR-002**: Finance MUST provide a keyboard- and touch-operable dropdown with Dashboard, Accounts, New Account, Transactions, Upcoming Expenses, Budgets, Categories, Merchants, Receipts, and Reports. Selecting Finance itself MUST open Dashboard after any required PIN check.
- **FR-003**: Each Finance page MUST have a distinct navigable destination that supports direct entry and browser back/forward navigation; existing reusable-item, matching, reconciliation, and account-import journeys MUST remain reachable from the relevant Finance pages.
- **FR-004**: New Account MUST be a dedicated financial-account creation page under Finance, retain existing account validation and ownership rules, and take the user to the created account upon success. This is financial-account creation, not Na’aseh user registration.
- **FR-005**: Account lists/details MUST present readable account names, organization, type, balance/currency, freshness, ownership scope, and dashboard inclusion controls; primary actions, editing forms, transaction review, and destructive actions MUST occupy distinct labeled areas. At a 375-pixel viewport, controls and summaries MUST remain readable without page-wide horizontal scrolling; the transaction table may scroll within its own region.
- **FR-006**: If application-wide SimpleFIN configuration is necessary, it MUST live on a dedicated Admin → SimpleFIN Setup page with administrator-only access and actionable setup/health status. If existing per-connection setup is sufficient, planning MUST document that finding and MUST NOT invent application-wide configuration. Personal/group connection setup MUST remain in the authorized Finance account workflow and MUST NOT require ordinary users to become administrators.
- **FR-007**: Throughout Na’aseh, separate adjacent buttons MUST have at least 5 CSS pixels between their visible boundaries, and a button adjacent to a text-entry field MUST have at least the same gap, including wrapped layouts, dialogs, and mobile views.

#### Personal Finance PIN

- **FR-008**: User settings MUST provide Require PIN for Finance, defaulting off for existing users, with a separately managed Finance PIN belonging to that user and independent of all Journal PINs.
- **FR-009**: Setting, changing, resetting, or disabling the Finance PIN requirement MUST require online verification of the acting user's own current password. PIN creation/replacement MUST require confirmation of a 6–32 digit PIN; reset MUST work without the old PIN and without deleting Finance data. Enabling protection MUST require an established PIN.
- **FR-010**: When protection is enabled, all entry into protected Finance content MUST require a valid Finance unlock, including direct links, transaction modals, receipts/downloads, search results/snippets, and Finance information reached from tasks or other pages. The PIN MUST NOT substitute for account/group authorization or grant any additional access.
- **FR-011**: Unlock MUST apply only to the acting user's current Finance visit in the current tab/session. Leaving the active Finance page or explicitly unlocked embedded Finance view for an unrelated page, explicitly locking, signing out, or ending that session MUST relock it. Task views MUST remain usable while Finance is locked; users MAY unlock their embedded Finance details in place, with the same visit/session and revocation rules. A page reload MUST require unlocking again; navigation between Finance pages MUST retain the current visit's unlock. A PIN reset/change, requirement change, or password reset MUST invalidate prior unlocks on connected sessions and require revalidation before offline sessions regain connected access.
- **FR-012**: Administrators MUST retain existing password reset capabilities but MUST have no administrative action that reads, sets, clears, resets, or disables another user's Finance PIN or requirement. A password reset alone MUST NOT change the PIN or disable protection.
- **FR-013**: Failed unlocks MUST reveal no protected content and MUST be rate-limited online and offline, with at least a 30-second delay after five consecutive failures and increasing delays for continued failures. Cancellation MUST return to a safe non-Finance destination; a successful unlock MUST resume the intended authorized destination.

#### Transactions, Categories, Merchants, and Budgets

- **FR-014**: Each account detail MUST contain a transaction table beneath its account information, scoped exclusively to that accessible account, with the columns described in User Story 3 and clear loading, empty, filtered-empty, and failure states.
- **FR-015**: Account tables and the Transactions page MUST support combined case-insensitive text search across description, payee, memo, and merchant; single-date or inclusive date-range filtering; exact signed amount or inclusive signed amount range in account currency; account-name filtering; and exact check-number filtering. Different filter dimensions MUST combine with AND; clearing filters MUST restore the authorized scope. Account-name filters MUST NOT broaden an account-detail table beyond its account.
- **FR-016**: Transactions MUST be a dedicated Finance page with selection of one or several accessible accounts, defaulting to all accessible accounts, the same table/filter behavior, and a visible result count. Results MUST use bounded pages with a default of 50 records, ordered newest first with a stable tie-breaker.
- **FR-017**: Every transaction row MUST contain a navigable link to that transaction's detail destination. In-app selection and direct entry MUST present that destination in an accessible modal over the originating page, or Transactions when there is no originating Finance page. Closing MUST restore filters, position, and focus; keyboard users MUST be able to dismiss it and must not lose focus behind it.
- **FR-018**: Transaction modals MUST show all accessible linked budgets from their allocations/matches; each budget link MUST navigate to a full budget page and close the modal. Missing budgets MUST be indicated without fabricating a link; inaccessible budget identity MUST NOT be exposed.
- **FR-019**: All transaction origins MUST support an optional check number as text, preserving leading zeros, and an optional payment type from Cash, Check, Card, ACH, Digital (Other). New manual entry MUST prompt for payment type without inventing one; legacy or imported unknown values MUST display as Unspecified. Check number MUST remain optional, including for payment type Check.
- **FR-020**: Authorized transaction editors MUST be able to add/correct these fields. Provider refresh and provisional-to-provider reconciliation MUST preserve user-owned check numbers, payment types, receipts, and classifications; missing provider metadata MUST NOT clear them. Import workflows MUST preserve supported source metadata without guessing unknown payment types.
- **FR-021**: Categories MUST be a dedicated Finance page supporting the existing catalog actions and parent/subcategory management. User-defined categories MUST support one child level, such as Food → Eating Out, with no cycles, self-parenting, or duplicate active child names within the same parent.
- **FR-022**: Allocations and budget items MUST allow an optional subcategory belonging to the selected parent category. Selecting a different parent MUST require clearing or replacing an incompatible child. Parent-category filters MUST include that parent's children; a selected child MUST narrow the result further. Existing uncategorized and parent-only records MUST remain valid.
- **FR-023**: Subcategories MUST follow existing global category visibility and creator/administrator editing rules. Archival MUST preserve historical labels and assignments and prevent new assignments. Reparenting a referenced child MUST NOT silently alter historical financial meaning; affected records MUST retain their historical parent association or require explicit migration review.
- **FR-024**: Merchant pages MUST allow authorized editors to update name, city, region, and default category, validating required names and detecting catalog collisions. Existing creator/administrator permissions MUST remain; provider-owned catalog entries without a creator MUST be editable only by administrators. Edits MUST retain merchant identity, linked transactions, source descriptions, and audit history; merges MUST remain an explicit existing workflow.
- **FR-025**: Budget group selectors MUST use existing active Na’aseh memberships as the source of eligible groups and show group display names, independent of whether those groups already have Finance accounts or budgets. All active members MUST retain existing budget editing rights.
- **FR-026**: A valid budget MUST save as active immediately for an eligible existing group even when it has no associated account yet; later account associations MUST obey existing scope rules. All current authorized budget editors MUST have explicit Deactivate and Reactivate actions. Deactivation MUST mark the budget inactive and preserve its identity, transaction and allocation relationships, reconciliation history, dashboard flag, and upcoming-expense/task links; it MUST NOT cancel, delete, or pay any existing obligation. Inactive budgets MUST be excluded from open-budget dashboard status and new or reassigned upcoming-expense budget choices. Existing linked expenses MUST remain visible and manageable under their current permissions. Reactivation MUST restore eligibility only where otherwise open/authorized and MUST NOT change a separate closed/archived state or reconciliation history. No eligible groups, a group-list loading failure, and membership revoked during save MUST produce distinct actionable states without silently discarding input.

#### Receipts

- **FR-027**: Any transaction a user may edit MUST accept one or more receipt attachments regardless of transaction origin or posting state. Each receipt MUST be no larger than 10,000,000 bytes, inclusive; zero-length files MUST be rejected.
- **FR-028**: Accepted file formats MUST be PDF (`.pdf`), JPEG (`.jpg`, `.jpeg`), PNG (`.png`), Word (`.doc`, `.docx`), and Excel (`.xls`, `.xlsx`). Extension, claimed type, and actual content MUST be checked; unsupported, mismatched, unsafe, or macro-enabled documents MUST be rejected with an actionable reason. Embedded active content MUST never execute in Na’aseh.
- **FR-029**: Receipt attachment status MUST distinguish locally pending, uploading, checking, available, and failed. Retry MUST NOT create duplicate attachments, a failed upload MUST NOT damage its transaction, and unavailable files MUST NOT appear successfully attached. A user MUST be able to cancel an incomplete attachment.
- **FR-030**: A transaction modal MUST list receipt name, format, size, and status, and offer View and Download for available files. View MUST preview supported PDF/image content and otherwise clearly explain that preview is unavailable with a download action. Download MUST preserve the original accepted file content and a safe recognizable filename.
- **FR-031**: Finance → Receipts MUST list accessible attached receipts with transaction date, merchant/vendor, category/subcategory, linked budgets, and a transaction link, and offer combined date/date-range, budget, category/subcategory, and vendor/merchant filters plus View/Download. Date MUST mean transaction date and be labeled accordingly; upload time MUST remain separately visible in details. Split-transaction receipts MUST appear once even if several allocations match.
- **FR-032**: Receipt metadata, originals, previews, and downloads MUST inherit their transaction's current authorization and Finance unlock requirements. Global merchant/category visibility MUST NOT expose receipt existence or content. A receipt link MUST NOT become a public permanent bypass, and retained files for deleted/tombstoned transactions MUST follow the existing retention/access policy rather than becoming orphaned or broadly accessible.

#### Dashboard and Spend Report

- **FR-033**: Accounts, budgets, categories, and merchants MUST each expose Include on my Finance dashboard on their relevant list/detail or management page. Flags MUST be stored per user and record, default off, synchronize across that user's devices, and MUST NOT modify another user's dashboard or grant record access. A category flag MUST include its child categories.
- **FR-034**: The Finance dashboard MUST be the default Finance page and MUST provide upcoming expenses, flagged-account balances, flagged open-budget statuses, recent transactions for flagged merchants, recent transactions for flagged categories, and the spending trend graph. Each section MUST handle no selections, no results, loading, stale/partial data, and failures independently.
- **FR-035**: Dashboard upcoming expenses MUST come from the authorized active Upcoming Expense records defined in FR-046–FR-050, including explicitly linked planned-item occurrences where applicable, exclude cancelled/fully paid records, and sort by next due date then stable identity. Budget items or reusable occurrences MUST NOT appear as a second expense beside their linked Upcoming Expense; linking an existing source MUST preserve a single canonical obligation, and similar descriptions alone MUST NOT merge distinct records. It MUST initially show 10, allow 5/10/15/20, show due date, description, expected amount/currency, and source link, and persist the count preference per user. Overdue items MUST be clearly separated from the future-dated upcoming list rather than consuming its limit.
- **FR-036**: Flagged account balances MUST use existing current-balance calculations and show currency and balance freshness for each accessible flagged account. Different currencies MUST NOT be added into a single unqualified balance.
- **FR-037**: Each flagged open budget MUST show planned expense amount, amount spent, percent used as the explicit interpretation of budget adherence, and amount left to spend. Percent used MUST equal 100 × spent / planned; amount left MUST equal planned − spent, with negative values labeled overspent. A zero planned amount MUST show percent as Not applicable; an inactive, closed, or archived budget MUST be excluded. For open-ended budgets, the effective calculation period MUST be shown.
- **FR-038**: Flagged-merchant and flagged-category sections MUST each show the latest 10 accessible matching transactions, ordered by transaction date with a stable tie-breaker and links opening transaction modals. A transaction matching multiple flags MUST appear once per section, though it may appear in both sections.
- **FR-039**: The dashboard MUST display spending as a line graph, defaulting to monthly totals for the latest 12 calendar months including the current month, with toggles to the latest 8 calendar quarters or 5 calendar years. It MUST support one or multiple accessible accounts, default all accessible accounts independently of dashboard flags, and show selected scope, currency, period totals, zero-activity periods, and incomplete-period labels. Values MUST also be readable without interpreting the graph.
- **FR-040**: Dashboard spending and Spend report calculations MUST use posted expense transactions within the labeled transaction-date period, offset linked expense refunds, exclude internal transfers and pending/provisional transactions, and retain negative net spending when refunds exceed expenses. Each refund MUST link to its original expense before reducing reported spending; partial refunds and multiple refund transactions against one expense MUST be supported. Authorized transaction editors MUST be able to create, correct, and remove the link while independently having access to the original expense. Refund allocations MUST default to the original expense’s budget/category associations, including its subcategory when present; for a partial refund of a split expense, the user MUST confirm which original allocations and amounts are refunded. Accepted refunds MUST count on their own received transaction date rather than rewriting the original expense’s reporting period. An unlinked credit MUST NOT automatically be treated as an expense refund; linking or unlinking MUST recalculate affected totals without duplicating the refund or changing either transaction’s original amount/date. Mixed currencies MUST have distinct totals/series. Split transactions MUST contribute their total once to account/merchant totals and only matching allocation amounts to category/budget-filtered totals.
- **FR-041**: Finance → Reports MUST initially provide a Spend report with a matching-transaction table, net spending totals per currency, labeled date scope, and combined filters for date/date range, budget, account, merchant, category, and subcategory. Each selection dimension MUST support one or several eligible values; values within a dimension MUST combine with OR and dimensions with AND. Budget/category/subcategory criteria MUST match the same allocation when more than one applies.
- **FR-042**: Spend MUST default to the current calendar month and all accessible accounts; applying or clearing filters MUST update visible scope, rows, and totals consistently. Transaction links MUST open the same modal and preserve report state on close. The initial report MUST provide no financial-data export, while allowing receipt-file downloads explicitly described above.
- **FR-043**: All new calculations, filters, flags, receipt operations, and transaction links MUST enforce existing individual/group authorization and newly required Finance locks. Hidden or inaccessible financial information MUST NOT influence visible counts, chart values, reports, receipt results, budget status, or recent-activity rows.

#### Manual Entry, Upcoming Expenses, and Task Integration

- **FR-044**: Every account an individual owner or active assigned-group member may edit MUST offer Add Transaction, including manual, checking, savings, credit-card, loan, and SimpleFIN-connected accounts. The Transactions page MUST offer the same action with an eligible account selector. Entry MUST support date, amount and debit/credit direction, account currency, description/payee, and existing optional merchant, allocation, payment-type, check-number, memo, and receipt fields; account-context entry MUST preselect that account.
- **FR-045**: Manual transactions MUST follow existing snapshot balance rules for manual accounts and provisional reconciliation rules for SimpleFIN accounts. Provisional entry MUST NOT overwrite provider balances; provider reconciliation MUST preserve the canonical transaction identity, user edits, receipts, upcoming-expense fulfillment relationships, and task links without duplicate transactions or double-counted spending. Retrying a save MUST return the existing result or a clear conflict rather than create a duplicate.
- **FR-046**: Finance MUST provide an Upcoming Expenses page with an active/overdue list and access to paid/cancelled history and an Add Upcoming Expense action. The dashboard and each editable account MUST also offer Add Upcoming Expense; its detail view MUST support review, editing, and related-task navigation. These MUST manage the same saved records used by the dashboard, not a separate dashboard-only projection of arbitrary future transactions.
- **FR-047**: An Upcoming Expense MUST have an identifier, required description, positive expected amount in account currency, required calendar date that is future when originally entered in the creating browser’s local calendar, required account, required budget, required existing group, creator, status, and update history. Date, account, budget, and group MUST be labeled selectable fields rather than manually entered identifiers. Account entry MUST preselect that account; group/budget/account eligibility and dependencies MUST be explained before save. Existing unpaid expenses MAY become overdue without being discarded. The original entry’s local calendar date and time-zone context MUST be retained for future-date validation. Synchronization MUST validate the future-date requirement against that original entry context, not the later reconnection date. A valid offline entry whose due date has since passed MUST be accepted with the selected due date unchanged and shown as overdue if still unpaid; delayed synchronization alone MUST NOT require rescheduling or cause rejection. Date-only upcoming-expense values MUST NOT shift because the server uses another time zone or the user later travels.
- **FR-048**: Upcoming Expense creation/editing MUST require current membership in its group and authorized access/edit rights to its account and budget. The budget MUST belong to the selected group; a group-owned account MUST belong to that same group, while a personally owned account MAY be used under existing budget rules without expanding that account's visibility. The expense's protected account/transaction details MUST be visible only to users independently authorized for the expense group, budget, and account. Selecting a budget for a new or reassigned Upcoming Expense MUST require an active, open budget. Deactivating that budget later MUST NOT prevent authorized review, rescheduling, or fulfillment of an existing linked expense when its budget association is unchanged. Changing group/account/budget MUST revalidate all relationships and permissions.
- **FR-049**: Creating, rescheduling, cancelling, or linking a task to an Upcoming Expense MUST NOT post a transaction, change an account's actual balance, or count its expected amount as actual spending. It MAY reference an existing budget item/reusable occurrence as its planned source without adding the planned amount twice to that budget. There MUST be one dashboard entry per canonical unpaid obligation, regardless of linked tasks or planned source references.
- **FR-050**: Authorized editors MUST be able to reschedule, edit, cancel, and explicitly link/unlink an Upcoming Expense to actual expense transaction amounts as fulfillment. Fulfillment MUST use the same account/currency and authorized relationships, support partial payment, prevent the same payment amount from fulfilling multiple obligations twice, and show expected, fulfilled, and remaining amounts. Only posted valid fulfillment amounts MUST count as paid; a provisional/pending link MUST be labeled awaiting posting. Fully paid or cancelled records MUST leave the active upcoming list; reversal/unlinking MUST recalculate remaining/overdue status. Completing a related task MUST NOT imply payment, and cancelled/paid records MUST retain their task/history links.
- **FR-051**: Each accessible expense transaction detail and Upcoming Expense detail MUST provide an explicit Add Task button. It MUST open the existing task creation workflow with the source relationship preselected, allow normal task fields/permissions, and create a linked task only after confirmation. Upcoming-expense date MAY be offered as the task due-date suggestion and MUST remain editable independently. Cancelling MUST create neither task nor link; retry MUST avoid duplicate tasks.
- **FR-052**: Task creation and editing MUST offer an optional Link Finance Item selector supporting both Upcoming Expenses and Transactions, search by type and accessible description/date/account, and adding/removing links without changing the financial source. Choices MUST be limited by current financial access and Finance unlock requirements; non-Finance tasks MUST remain creatable without unlocking Finance or selecting a link.
- **FR-053**: A task MAY link to multiple upcoming expenses/transactions, and a financial record MAY have multiple related tasks. The same task-to-record relationship MUST appear only once. Both task and Finance details MUST support navigation to accessible linked records; transaction navigation MUST use the transaction modal. Removing a link or deleting/completing a task MUST NOT delete, cancel, pay, or post the financial record or remove unrelated links.
- **FR-054**: Task table column settings MUST offer an optional Upcoming Expenses column, and post-it views MUST offer equivalent optional Upcoming Expenses details. Both MUST default off, follow existing per-user display preference persistence, display each accessible linked upcoming expense's description, date, amount/currency, account, and current status, and provide a navigable detail link. Multiple links MUST remain distinguishable without widening the entire page; no linked items MUST show a neutral empty cell/detail state. This is related-expense information on tasks, not a separate task created automatically for every upcoming expense.
- **FR-055**: Finance links and optional task/post-it displays MUST enforce task visibility, current financial authorization, and personal Finance unlock independently. Users with task access alone MUST NOT gain protected source identifiers, existence/counts, descriptions, amounts, dates, account/budget/group names, or receipt access. Locked embedded displays MAY offer a generic Unlock Finance control to an authorized user; unlocking MUST not broaden task sharing. Task creation from Finance MUST default to a generic editable task title such as Review expense, with no automatic copy of protected financial details into task titles, memos, notifications, search indexes, or existing task exports.
- **FR-056**: Upcoming Expenses, fulfillment relationships, and task-to-Finance links MUST preserve existing data lifecycle, backup/restore, offline pending-change, and revocation behavior. Creating a task and its link MUST either succeed together or explicitly report which part succeeded and offer a retry that cannot create another task. Edits/retries MUST not lose references or silently overwrite concurrent fulfillment decisions; source removal MUST retain an appropriate historical relationship without exposing inaccessible financial details.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: Finance PIN settings and verification data belong only to their user. The PIN is an additional Finance access gate, independent of Journal protection; it MUST NOT be advertised as Journal-style end-to-end encryption. Finance content and receipts remain subject to existing individual/group boundaries, authenticated least-privilege access, and protection in transit and at rest. PINs, passwords, provider credentials, raw receipts, and protected financial content MUST NOT appear in diagnostics or logs. Locked content MUST be withheld from screen rendering, accessible labels, search snippets, previews, and cached history restoration. Tests MUST exercise administrative denial, direct entry/download denial, revocation, and offline locking.
- **NFR-002 Data Durability & Recovery**: Existing Finance records and budget-item task links MUST migrate without loss or fabricated payment/classification metadata. Upcoming expenses, partial fulfillment, and task links MUST be included in recovery and concurrency checks; existing budget-item links MUST remain valid when new target types are added. Edits, flags, attachments, and resets MUST be validated, retry-safe, and conflict-aware. Receipt upload failure MUST preserve valid transactions and completed receipts; retained files and their metadata MUST participate in backup/restore and retention procedures. Concurrent edits MUST not silently overwrite financial meaning, and provider refresh MUST preserve user-owned fields and attachments. Receipt cleanup MUST avoid deleting files referenced by committed records.
- **NFR-003 Offline Support**: Previously synchronized authorized Finance records, dashboards, reports, and cached receipts MUST remain usable offline after any required locally verifiable Finance unlock, with visible freshness and coverage limits. Manual transaction entry, upcoming-expense creation/editing, supported task linking and column/post-it preferences, record edits, classifications, flags, and receipt selections MUST persist locally as protected pending changes and synchronize after reconnection. Upcoming expenses that were future-dated at original offline entry MUST keep their selected dates on delayed synchronization and appear overdue when applicable, without forced rescheduling; a receipt selection may be queued only if its bytes are durably retained locally. Full-size uncached receipts, provider operations, and password-verified PIN management require connectivity. A device without the required cached unlock material MUST keep Finance locked and explain the need to reconnect. Stale preferences MUST not override a newer protection requirement on reconnect; conflicts, storage exhaustion, revocation, and partial upload failure MUST be visible without silent loss.
- **NFR-004 Browser & Responsive Support**: Primary journeys MUST work in current stable Chrome and Safari/WebKit on desktop and supported iPhone/iPad viewports. Tables MUST expose equivalent readable content on narrow screens, dialogs MUST manage focus and dismissal, all controls MUST support keyboard/touch, and charts MUST have readable value equivalents. Button gaps in FR-007 MUST hold at desktop, 375-pixel phone, and 768-pixel tablet widths, including wrapped controls and open dialogs. Preview/download fallback MUST account for browser capability differences.
- **NFR-005 Errors & Observability**: Failures MUST identify the affected action, preserved state, and next safe action. Structured production CloudWatch records MUST include safe correlation context, outcome, timing, and bounded error classification for access denials, unlock throttling, PIN management, uploads/checks/downloads, filtering, and synchronization. Logs MUST exclude credentials, receipt contents/filenames, merchant activity, and protected transaction fields. Planning MUST define cost-conscious retention, metrics, alarms, and cleanup visibility for repeated upload failures, denied access, and abandoned files.
- **NFR-006 Performance**: At the inherited scale of 50 accounts, 100,000 accessible transactions, 20 active budgets, and five concurrent group members, plus 5,000 receipt metadata records and 1,000 active upcoming expenses, upcoming-expense lists/selectors, dashboard, filtered account/transaction tables, receipt browser, and Spend report MUST show usable content at p95 within two seconds across 20 measured runs under a mid-range mobile profile with 4× CPU slowdown, 10 Mbps bandwidth, and 100 ms latency. For lists and reports, usable content means actual matching rows or a confirmed no-results state for the full selected scope; for dashboard sections it means actual authorized widget values or a confirmed empty state. A spinner, loading indicator, progress message, placeholder, or unverified empty first page alone MUST NOT satisfy this target. Connected transaction-list and Spend report queries MUST also complete exact matching counts and spending totals, where applicable, at p95 within ten seconds under the same measured conditions; while totals are calculating, progress MUST appear within one second and incomplete totals MUST be labeled rather than presented as exact. Offline results MUST state cached coverage, and MUST NOT claim exact full-scope totals where necessary records are unavailable. Locally available transaction modals MUST show useful details within one second; uploads and other long operations MUST show progress within one second. File transfer time is excluded from page-content timing and MUST remain visible. Functional compatibility remains required across supported browsers.
- **NFR-007 AWS Architecture & Cost Impact**: Steve explicitly approved a $6.50 per month combined Finance incremental AWS operating-cost ceiling on 2026-10-31, replacing the inherited $5 ceiling. This is above Na’aseh's pre-Finance baseline under normal household use and includes Finance 015; it is not an additional allowance. Planning MUST evaluate existing and managed serverless AWS capabilities first and document receipt storage, checking, previews, backup, and transfer costs, retention assumptions, expected volume, and a simpler/cheaper alternative. Any forecast above the inherited ceiling requires Steve's explicit approval; no indefinite free-tier assumption or new always-on capacity may conceal cost.
- **NFR-008 Validation Runtime**: Required PR validation MUST target ten minutes or less with reasonable hosted-runner timeout headroom. Before adding cases to required validation, planning/implementation MUST list resulting test counts and measure affected commands before/after; browser quick checks MUST use `/usr/bin/time -p npm run test:e2e:quick`. Hosted total duration MUST be confirmed after required validation changes. Representative high-value journeys belong in quick validation; exhaustive browser/device combinations remain local release gates. Expansions expected to exceed ten minutes require explicit approval and documented rationale before merge.

### Key Entities *(include if feature involves data)*

- **User Finance Security Preference**: User-owned Require PIN choice, separate Finance PIN verification material, protection revision, and reset/change history; never another user's administrative setting.
- **Finance Unlock State**: Limited-lived authorization to pass the acting user's Finance gate for a single visit, bound to the user, current session/tab, and security preference revision; grants no account/group membership.
- **Finance Dashboard Preference**: User-to-record inclusion flag for an account, budget, category, or merchant, plus upcoming-expense count preference; independent of catalog and group ownership.
- **Financial Account**: Existing individually/group-assigned account, balances and history, source/freshness, related transactions, and personal dashboard inclusion.
- **Financial Transaction and Allocation**: Existing canonical transaction and expense/budget allocations, extended with optional check-number text, payment type, subcategory relationships, and attached receipts.
- **Expense Refund Relationship**: A traceable link from a refund transaction to its original expense, supporting partial/multiple refunds and confirmed original-allocation amounts; defaults budget/category/subcategory associations from the expense, retains independent access checks, and applies the offset on the refund’s received date.
- **Category and Subcategory**: Global catalog parent and one-level child classification under existing permissions, with preserved historical relationships and archival state.
- **Merchant**: Existing global catalog identity with editable authorized attributes and protected links to each viewer's accessible transactions.
- **Budget**: Existing group-owned dated or open-ended plan and items, selected from real memberships, with calculation period, active/inactive status (active on creation), separate open/closed status, and personal dashboard inclusion; deactivation preserves all history and existing relationships.
- **Receipt**: Private original file and metadata linked to one transaction, including safe filename, content format, byte size, upload time, availability/checking status, uploader, and retention/access inherited from the transaction.
- **Upcoming Expense**: First-class saved future expense with description, expected amount/currency, required date/account/budget/group, original-entry local calendar date and time-zone context, creator, active/partly-paid/paid/cancelled state, optional planned-source relationship, fulfillment amounts, remaining amount, and edit history. Overdue is derived from date and outstanding state; it is not an actual transaction.
- **Upcoming Expense Fulfillment**: Explicit relationship assigning an actual transaction amount toward one obligation, retaining posting/partial-payment/reversal history and preventing double use of payment amounts.
- **Task-to-Finance Relationship**: Stable link connecting a task to an upcoming expense or transaction while retaining existing budget-item links; preserves each side's independent visibility and lifecycle, supports multiple links without duplicates, and conveys no new authorization.
- **Task/Post-it Expense Display Preference**: Optional per-user column/detail visibility for upcoming expense relationships, using existing task/post-it display-preference behavior and defaulting off.
- **Spend Report and Trend Scope**: User-selected dates, account/catalog/budget dimensions, explicit currency, and calculated posted expense/refund totals; not a new source of financial truth.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 26 original changes and six follow-up requests map to testable requirements and user acceptance scenarios; all listed Finance destinations are reachable through the menu and by direct entry.
- **SC-002**: Two representative users can each create a financial account from New Account, find a transaction with combined filters, and open its linked budget without assistance in three minutes or less per journey.
- **SC-003**: In the access test set, 100% of protected Finance entry paths remain locked when required, correct PINs resume the intended authorized destination, and all attempts by an administrator to manage another user's Finance PIN or disable its requirement are denied. Existing administrator password reset still succeeds without changing the PIN.
- **SC-004**: Every eligible existing-group fixture, including a group without accounts/budgets, permits saving a valid immediately active budget; authorized deactivate/reactivate tests preserve all history and existing links while updating dashboard and new-expense eligibility, and every ineligible/revoked membership fixture is denied with recoverable form input.
- **SC-005**: Filter fixtures return exactly the expected transaction/receipt rows and allocation totals for all supported dimensions and combined cases; every transaction row can open its modal, and every accessible linked budget opens as a page.
- **SC-006**: Each accepted receipt format succeeds at the 10,000,000-byte boundary; every oversized, unsupported, mismatched, or unsafe fixture is rejected without damaging the transaction. Downloaded originals match accepted file content, and denied/locked users retrieve zero protected receipt content.
- **SC-007**: For fixtures covering transfers, explicitly linked full/partial/multiple refunds (including refunds received in a later period and confirmed split allocations), splits, zero budgets, overspending, recurring obligations, and mixed currencies, dashboard widgets, all three graph modes, and Spend totals match the documented calculations with no duplicate amounts or unqualified currency mixing.
- **SC-008**: One user's dashboard flags persist after synchronization/reopening while a second user's flags remain unchanged; upcoming-count choices produce exactly 5/10/15/20 records when enough qualifying obligations exist.
- **SC-009**: Primary Finance journeys pass in current Chrome and Safari/WebKit on desktop, iPhone, and iPad layouts; measured adjacent button/button and button/text-field gaps are at least 5 CSS pixels in affected layouts across Na’aseh.
- **SC-010**: At the stated household volumes and mobile conditions, page/filter journeys show actual usable rows/values or a verified empty state within the two-second p95 target; a loading/progress indicator alone never passes. Connected transaction-list and Spend report queries complete exact matching counts/totals within ten seconds at p95 across 20 measured runs, with progress within one second and partial coverage labeled. Locally available transaction details meet the one-second target without hiding stale or incomplete data.
- **SC-011**: Offline/reconnect, concurrent-edit, receipt-retry, provider-refresh, migration, and restore scenarios preserve every accepted field and receipt relationship or surface a specific recoverable conflict; no scenario silently loses or duplicates an accepted record/attachment.
- **SC-012**: Planning records the incremental-cost forecast including receipts within the inherited Finance ceiling or obtains explicit approval for a higher forecast; any required validation expansion records before/after duration, resulting counts, and hosted duration within the approved runtime target.

- **SC-013**: Manual-entry fixtures for each supported account type and source save exactly one transaction, preserve optional payment/classification fields, and obey manual/provider balance rules; later provider reconciliation retains all receipt/task/fulfillment relationships without duplicate spending.
- **SC-014**: Two representative users can each create an Upcoming Expense with date, account, budget, and group and locate it on the dashboard without assistance within two minutes. Required-field and relationship mismatch fixtures are all rejected; rescheduling, overdue (including valid offline entries synchronized after their due date), cancellation, partial payment, and full payment fixtures produce exactly the expected list state and actual spending, with every delayed-entry date preserved across differing browser/server time zones.
- **SC-015**: Both representative users can create a task from an expense, link a new task to either financial record type, and enable the task/post-it expense display without assistance within two minutes per workflow. Relationship fixtures preserve both navigation directions, prevent duplicate links/tasks on retry, and leave expense payment/status unchanged by task completion. Locked and unauthorized viewers, notifications, search, and exports reveal zero protected linked financial fields.

## Assumptions

- This is one follow-on feature to [015 Finance and Budget Management](../015-finance-budget-management/spec.md). Its identity, group authorization, global catalog permissions, balance calculations, split-allocation accounting, reconciliation, archival/deletion, currency separation, and no-export rules remain the baseline except where explicitly extended here. Existing unfinished work remains a dependency, not a claim of completed functionality.
- Scope is the Na’aseh web application and its supporting Finance services. Dedicated native Apple Finance screens are outside this feature; shared data/security boundaries must remain compatible with existing clients.
- “Model” in the request means modal. “New account” means financial account. “Vendor” means merchant. “Amount or Amount Name” is interpreted as amount filtering plus account-name filtering because no distinct named-amount concept exists; a named-amount catalog is outside scope.
- Dashboard flags are personal preferences, including for shared accounts and global merchants/categories. The main-menu ordering and 5-pixel spacing requests apply across the web application; other new pages and widgets apply to Finance.
- PIN format defaults to 6–32 decimal digits, consistent with the existing Journal input convention but with separate verification and lifecycle. Password verification is needed for every PIN-management operation. The Finance PIN is not a promise of protection from a person who already controls the user's password; retained administrator password reset capabilities do not create a separate administrative Finance PIN action.
- Existing users begin with protection off and no dashboard flags. Newly imported unknown payment types remain unspecified; entering a check number does not automatically change the payment type. The feature does not require checks to have a number.
- The performance target distinguishes first usable content from calculation progress: actual results or a confirmed full-scope empty state within two seconds, and exact connected transaction/report counts and totals within ten seconds. Missing offline records must be disclosed; they cannot be manufactured into complete totals.
- User-visible transaction/filter dates use the current browser’s local time zone. Upcoming Expense due dates are the date-only values selected in the creating browser’s local calendar and remain unchanged across synchronization or later time-zone changes; the original entry context determines whether the due date was future when entered. Delayed synchronization may make an unpaid expense overdue but does not invalidate its original future-date selection. Single-date filters cover their whole local calendar day and date ranges include both endpoint days. Trends use calendar periods, with current partial periods labeled. Dashboard budget adherence means percent used rather than an undefined adherence score.
- New budgets are active immediately on save. “Open budget” means an active, non-archived budget that is not closed; reconciliation alone does not close it. Deactivation/reactivation is an explicit reversible availability setting, separate from closure, archival, and reconciliation. Inactive budgets remain accessible in budget history/list views; their existing unpaid upcoming expenses continue to appear in the upcoming/overdue lists under the original access rules. Dashboard upcoming expenses come from first-class Upcoming Expense records entered through this feature, optionally referencing existing planned items/reusable occurrences with a single obligation identity. Existing source items are not automatically duplicated as new expenses. Bill payment initiation and a separate bill-ingestion product remain outside scope. Recent means latest 10 transactions per section.
- Receipt limits apply per file, with no new fixed per-transaction attachment count. Word/Excel mean the listed legacy and modern standard extensions, excluding macro-enabled variants. Preview of Office documents is not required; original accepted-file download is. Receipt replacement/deletion controls and content extraction/OCR are outside this request; existing transaction retention and deletion rules still govern retained attachments.
- Receipt-file downloads are an explicit extension to the earlier no-Finance-export boundary. Transaction/report exports remain outside scope. Spend is the only report in this feature; additional reports will be specified later.
- The existing SimpleFIN per-user/group setup flow is the baseline. Planning must determine whether there is any actual application-wide setup to expose under Admin; this specification does not presume a new provider-wide credential is necessary.
- The follow-up phrase “posits” means the existing post-it task views. An optional column applies to tabular tasks; post-its receive an equivalent optional detail area rather than a literal table column.
- The follow-up Date, Account, Budget, and Group fields are required for Upcoming Expenses. Description and expected amount are also required so the expense can be identified and totaled. A group without a budget must create an eligible budget before saving an expense; standalone unbudgeted upcoming expenses are outside the stated required-field default.
- “Any account” means any account the user has permission to edit, including provider-connected accounts. Existing provisional/provider reconciliation and manual balance snapshot semantics still apply; the manual action must be visible rather than merely supported behind the scenes.
- “Expense” in task-creation actions means an expense transaction; every upcoming expense also supports that action. The task form may link any accessible transaction as explicitly requested. Creating/linking tasks is optional and never a payment action; a new recurring-expense scheduler is outside scope.
- This revision extends the same feature 016 rather than creating a second feature directory; no implementation has been performed by the specification workflow.
- Dependencies include existing authentication/password verification, current membership/group names, Finance data and synchronization, secure file handling and recovery, and safe offline storage. Receipt byte-volume/cost assumptions must be established during planning; performance scale for receipt metadata is 5,000 records, not 5,000 maximum-size files stored without a cost review.

## Request Coverage

| User request | Requirements |
| --- | --- |
| 1. Main menu order | FR-001 |
| 2. Dedicated new financial account page | FR-002–FR-004 |
| 3. Conditional application-wide SimpleFIN Admin page | FR-006 |
| 4–5. Personal Finance PIN setting, unlock, password-based management, administrator boundary | FR-008–FR-013 |
| 6. Account interface cleanup | FR-005, FR-014 |
| 7. Account transactions, filters, detail modal, budget page links | FR-014–FR-018 |
| 8. Account dashboard flag | FR-033, FR-036 |
| 9–10. Check number and payment type | FR-019–FR-020 |
| 11. Transactions page | FR-002–FR-003, FR-016 |
| 12. Categories page | FR-002–FR-003, FR-021 |
| 13. Merchant editing | FR-024 |
| 14. Existing-group budget selection and saving | FR-025–FR-026 |
| 15–16. Minimum button/button and button/text-field spacing | FR-007 |
| 17–18. Receipt uploads, supported files, view/download | FR-027–FR-030, FR-032 |
| 19. Receipt browser and filters | FR-031 |
| 20. Subcategories | FR-021–FR-023 |
| 21–23. Budget/category/merchant dashboard flags | FR-033, FR-037–FR-038 |
| 24. Dashboard widgets and spending trend graph | FR-034–FR-040 |
| 25. Reports page and filterable Spend report | FR-040–FR-042 |
| 26. Dashboard as Finance default | FR-002, FR-034 |

### Follow-up Request Coverage

| Follow-up request | Requirements |
| --- | --- |
| 1. Manually enter a transaction for any account | FR-044–FR-045 |
| 2. Enter Upcoming Expenses with date, account, budget, group; use these on dashboard | FR-035, FR-046–FR-050 |
| 3. Add an upcoming expense as a task | FR-051, FR-053 |
| 4. Add a related task from any expense or upcoming expense | FR-051, FR-053 |
| 5. Optional Upcoming Expenses column for tasks and equivalent post-it detail | FR-054–FR-055 |
| 6. Link an upcoming expense or transaction during task creation | FR-052–FR-053, FR-055–FR-056 |
