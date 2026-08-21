# Feature Specification: Task Security and Experience Modernization

**Feature Branch**: `codex/009-task-security-modernization`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "Switch to device-bound session credentials; add configurable, repeating task timers defaulted to ten minutes; add TFA and require it for administrators; edit tasks in a modal; drag and drop stack-ranked tasks; remove Extra Low priority; adapt priority icons for small spaces; add memo rich-text formatting for bold, italic, strikethrough, and ordered and unordered lists; show no date text when no date is selected; export all completed-task fields to CSV; separate system administration from user profile settings; make group selectors dropdowns; use five-minute due-time increments; use the current browser time zone without time-zone controls; use a Select2-style searchable dropdown for parent tasks; make the user list a table; require a PIN for password reset; allow amount entry when first adding a list item; move global list administration off the list view; and allow post-it color selection while editing."

## Clarifications

### Session 2026-08-14

- Q: Must the parent-task dropdown use the exact Select2 library, or only provide equivalent behavior? → A: Require Select2-equivalent behavior using a React-compatible implementation; the exact Select2 library is not required.
- Q: Who may recover an administrator account after its authenticator and all recovery codes are lost? → A: Only a separately authorized recovery operator through an audited workflow that revokes all sessions and forces TFA re-enrollment.
- Q: Is a task timer local to one device, shared with collaborators, or synchronized personally across a user's devices? → A: Maintain one account-wide personal timer synchronized across the user's devices; offline conflicts must be surfaced and resolved without silent loss.
- Q: How should device-bound sessions handle required browsers that do not support the exact W3C DBSC protocol? → A: Defer device-bound sessions entirely until the exact protocol is supported by every required browser; keep the existing session model unchanged in this feature.
- Q: How should Extra Low be removed given that neither current user has any persisted Extra Low content? → A: Verify every active store and backup-facing projection contains zero Extra Low values, fail closed if any are found, then delete the value from schemas, imports, filters, reports, exports, and UI without a data backfill.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use Secure Accounts with TFA Recovery (Priority: P1)

A user can enable two-factor authentication (TFA), manage recovery codes, and reset a forgotten password with the account PIN. Administrators must complete TFA enrollment and a second-factor challenge before using the application. Device-bound sessions are deferred and the existing session model remains unchanged for this feature.

**Why this priority**: Administrator compromise can expose every user's data, so stronger authentication and safe account recovery must precede convenience work.

**Independent Test**: Sign in as an ordinary user and an administrator on supported browsers, exercise TFA enrollment and recovery, reset a password with valid and invalid PINs, and verify that the existing session model has not been replaced with a partially supported device-binding scheme.

**Acceptance Scenarios**:

1. **Given** valid primary credentials on a supported browser, **When** a user signs in, **Then** the existing secure session behavior remains in effect without requiring device-bound session credentials.
2. **Given** an administrator without TFA enrollment, **When** primary authentication succeeds, **Then** the administrator must enroll and verify TFA before accessing either administrative or ordinary authenticated pages.
3. **Given** an administrator or TFA-enabled user with valid primary credentials, **When** sign-in is attempted, **Then** access is withheld until a valid current second factor or unused recovery code is supplied.
4. **Given** an ordinary user without TFA, **When** the user signs in, **Then** the user can use the existing session behavior and may enroll TFA later from the profile page.
5. **Given** a signed-out user who knows the username and account PIN, **When** matching valid new-password entries are submitted, **Then** the password changes, all prior sessions are revoked, and any required TFA challenge remains required at the next sign-in.
6. **Given** expired or revoked session material, **When** it is presented, **Then** no protected data is returned and the user is directed to authenticate again without disclosing sensitive validation detail.
7. **Given** an administrator has lost the enrolled authenticator and every recovery code, **When** a separately authorized recovery operator completes the audited recovery workflow, **Then** all administrator sessions are revoked and the administrator must enroll and verify new TFA before receiving authenticated access.

---

### User Story 2 - Edit Complete Task Details in Context (Priority: P1)

A user edits a task in a modal without losing the surrounding task view. The user can choose a parent through a searchable dropdown, select due time in compact five-minute increments, format a memo with a small safe formatting set, and save or cancel predictably. Dates and times use the current browser time zone, and an undated task displays no placeholder date.

**Why this priority**: Editing is the central task-maintenance workflow, and consolidating these controls reduces navigation and entry mistakes.

**Independent Test**: Open an existing task from each supported task view, change every editable field in the modal, use all memo formats, select and clear a parent and due date, save and cancel, then repeat online, offline, by keyboard, and on phone and tablet viewports.

**Acceptance Scenarios**:

1. **Given** a task the user may edit, **When** the edit action is activated, **Then** a modal opens with the current editable values and focus contained and labeled accessibly.
2. **Given** unsaved changes in the edit modal, **When** the user cancels or attempts to dismiss it, **Then** no task data changes and potential loss is confirmed before dismissal.
3. **Given** a parent-task field, **When** the user types part of an authorized task's identifying text, **Then** a Select2-style dropdown narrows the choices, permits a valid selection or clear action, and never accepts arbitrary text as a parent.
4. **Given** a memo, **When** the user applies bold, italic, strikethrough, ordered-list, or unordered-list formatting, **Then** the modal shows the formatted result and the same meaning remains after save, reopen, synchronization, and export.
5. **Given** a task with no due date, **When** it appears in any task view, **Then** the date area is empty rather than showing a date, "Someday," or another placeholder.
6. **Given** the user selects a due time, **When** the time choices are shown, **Then** they appear at five-minute intervals in the browser's current time zone with no time-zone selector.
7. **Given** an existing due instant and the browser's time zone changes, **When** the task is viewed or edited, **Then** the same instant is represented in the new browser-local date and time without silent mutation.

---

### User Story 3 - Focus with a Repeating Task Timer (Priority: P1)

A user starts a timer for a specific task. A new timer defaults to ten minutes, may be changed before or during use, and may automatically begin the same interval again whenever it finishes.

**Why this priority**: Timed focus directly supports completing tasks and delivers standalone day-to-day value.

**Independent Test**: Start a default timer, change its duration, pause and resume it, enable repeat, allow multiple intervals to finish, stop it, navigate and reload, and verify the timer remains associated with the correct task online and offline.

**Acceptance Scenarios**:

1. **Given** a task with no running timer, **When** the user opens its timer, **Then** the proposed duration is ten minutes and the user can change it to another positive whole-minute duration before starting.
2. **Given** a running timer, **When** the user pauses, resumes, or stops it, **Then** the displayed remaining time and next completion reflect the chosen action without altering task completion status; **when** the user confirms a duration change, **Then** the current interval restarts from the new duration.
3. **Given** repeat is enabled, **When** an interval reaches zero, **Then** completion feedback occurs once per active device for that interval and a new interval of the selected duration begins until the user disables repeat or stops the timer; no task `CompletionEvent` is created and the task is not marked complete.
4. **Given** repeat is disabled, **When** the timer reaches zero, **Then** it remains finished and does not restart.
5. **Given** the user navigates, reloads, temporarily loses connectivity, or backgrounds the browser, **When** the timer is viewed again, **Then** it derives the correct remaining or completed state from elapsed time rather than silently resetting.
6. **Given** another task timer is already active for that user, **When** a second timer is started, **Then** the user is asked to stop or switch from the active timer so only one personal timer runs at a time.
7. **Given** a user continues the timer from another signed-in device, **When** synchronization completes, **Then** both devices show the same account-wide timer; conflicting offline control actions are surfaced and resolved before either device silently replaces the canonical state.

---

### User Story 4 - Rank Tasks Efficiently at Any Size (Priority: P2)

A user changes personal stack rank by dragging tasks directly, with equivalent keyboard controls. Priority choices no longer include Extra Low, and priority icons stay understandable in dense or narrow layouts.

**Why this priority**: Fast ranking is essential for deciding what to do next, while simplified priorities and compact icons reduce visual noise.

**Independent Test**: Reorder tasks by pointer, touch, and keyboard in overall and project stacks; filter the stack; inspect compact layouts; verify a read-only inventory reports zero Extra Low values; and confirm the value is deleted everywhere while an unexpected persisted value blocks deployment without changing rank or data.

**Acceptance Scenarios**:

1. **Given** an authorized personal stack, **When** a user drags a task between two visible tasks, **Then** the task takes that personal relative position and other users' ranks remain unchanged.
2. **Given** a filtered stack, **When** a visible task is reordered, **Then** only the matching tasks' occupied positions change according to the established filtered-reordering rules.
3. **Given** a user who cannot or does not use drag and drop, **When** keyboard move controls are used, **Then** the same rank result and clear position announcement occur.
4. **Given** any new or edited task, **When** priority is selected, **Then** Extra Low is not offered.
5. **Given** the verified production state contains no Extra Low content, **When** the removal is deployed, **Then** Extra Low is absent from active schemas and behavior; **given** any unexpected Extra Low value is discovered, **Then** deployment stops without rewriting that record or unrelated data.
6. **Given** limited horizontal or vertical space, **When** a priority icon is displayed, **Then** its compact form remains visually distinguishable and has an accessible priority name.

---

### User Story 5 - Separate Personal Settings from Administration (Priority: P2)

An ordinary user manages personal reminders, sound preferences, Google connection, credentials, TFA, and other profile details on a dedicated profile page. Administrators manage system-wide users and configuration separately, with users presented in a scannable table and groups selected from dropdowns.

**Why this priority**: Clear separation prevents ordinary settings from being confused with privileged operations and makes user administration safer and faster.

**Independent Test**: Use the profile page as an ordinary user, use system administration as an administrator, attempt unauthorized access, manage a user in the table, and exercise group dropdowns with mouse, touch, keyboard, and search where needed.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** the profile page opens, **Then** it contains that user's reminders, sound preferences, Google setup, password change, TFA management, and other user-scoped profile controls, with no system-wide administration controls.
2. **Given** an administrator, **When** system administration opens, **Then** system-wide controls are separate from the administrator's own profile settings.
3. **Given** a non-administrator, **When** a system-administration route or operation is requested, **Then** access is denied even if the control is manually invoked.
4. **Given** an administrator viewing users, **When** the user list loads, **Then** users appear in a responsive table with labeled columns and accessible actions rather than an unstructured list.
5. **Given** any user-facing group field, **When** it is used, **Then** the value is chosen from an authorized dropdown with a clear empty choice where optional and no arbitrary group value can be submitted.

---

### User Story 6 - Add and Manage List Items without Admin Clutter (Priority: P2)

A user can enter an optional amount at the moment a list item is first added. Everyday list views focus on the current list, while global reusable-item administration lives in a separate administrative destination.

**Why this priority**: Capturing amount at entry avoids a second edit, and separating global controls reduces accidental broad changes.

**Independent Test**: Add valued and unvalued items, verify totals, edit or reset values, confirm ordinary list pages lack global-administration controls, and verify authorized global administration remains reachable separately.

**Acceptance Scenarios**:

1. **Given** a user adding a list item, **When** a valid optional amount and its positive-or-cost meaning are supplied with the item name, **Then** both are saved atomically and the list total updates immediately.
2. **Given** invalid amount input, **When** the add action is submitted, **Then** no partial item is created and the amount problem is explained without clearing valid unrelated input.
3. **Given** a user viewing or editing one list, **When** the page loads, **Then** global reusable-item administration is absent from that page.
4. **Given** an authorized user who needs global list administration, **When** the separate destination is opened, **Then** global items can be managed there under the established permissions without navigating through an individual list.

---

### User Story 7 - Export Complete Tasks without Time-Zone Controls (Priority: P2)

An authorized user filters completed tasks without choosing a time zone and exports every applicable completed-task field to a well-formed CSV. Display and filter boundaries follow the current browser time zone.

**Why this priority**: Complete portable records support reporting and data ownership, while automatic browser-local time removes a technical and error-prone filter.

**Independent Test**: Filter completions near date boundaries in two browser time zones, export tasks containing every supported field and special CSV characters, and verify the documented columns, values, authorization, and absence of time-zone controls.

**Acceptance Scenarios**:

1. **Given** a completed-task report, **When** its filters appear, **Then** no time-zone input is shown and browser-local date boundaries are stated or evident.
2. **Given** an authorized completed-task result set, **When** CSV export succeeds, **Then** it contains every documented current field for each task and subtask, a stable column order, correct escaping, and an explicit empty value for missing optional data.
3. **Given** hidden, encrypted, attachment, synchronization, or relationship fields, **When** export occurs, **Then** safe metadata is included but plaintext or reusable access material is included only when the exporter is independently authorized to receive it.
4. **Given** an export failure or interruption, **When** the operation ends, **Then** no partial file appears to be a successful complete export and the user receives an actionable error.

---

### User Story 8 - Choose a Post-it Color while Editing (Priority: P3)

A user can change an editable task's post-it color in the same edit modal and immediately recognize the selection in post-it views.

**Why this priority**: Color supports visual organization but does not block the core editing or security journeys.

**Independent Test**: Edit a post-it task, choose each available color by pointer, keyboard, and touch, save and cancel changes, and verify persistence, contrast, synchronization, and non-color identification.

**Acceptance Scenarios**:

1. **Given** a task shown as a post-it, **When** its edit modal opens, **Then** the current post-it color is selected and each permitted choice has a visible swatch and accessible name.
2. **Given** a different color is selected and saved, **When** the modal closes, **Then** all post-it representations update to the saved color without changing other task fields.
3. **Given** a color change is canceled, fails, or conflicts during synchronization, **When** the outcome is resolved, **Then** the last durable color remains visible and the user receives clear conflict or failure feedback.

### Edge Cases

- A browser loses session state, clears site data, or runs in private-browsing mode; protected access follows the existing session behavior, locally cached protected content remains encrypted, and the user is directed to authenticate again when required.
- An administrator loses the second factor and all recovery codes; only a separately authorized recovery operator may reset the enrollment through an audited workflow, all sessions are revoked, and password or PIN alone cannot complete recovery.
- Repeated bad password-reset PINs, TFA codes, or recovery codes are throttled and monitored without revealing account existence or reusable security material.
- Two tabs change TFA, password, session, task, timer, rank, memo, list amount, or post-it color concurrently; non-conflicting work is retained and same-field conflicts are deterministic or user-resolvable.
- A timer finishes while the browser is suspended, closed, offline, or unable to show notifications or play audio; elapsed time remains correct and task data is not changed merely because feedback was unavailable.
- A task is dragged outside the list, onto itself or its descendant, during pending synchronization, or in a list that changes remotely; invalid drops do nothing and valid conflicts never silently lose the user's rank.
- Existing due times not aligned to a five-minute increment remain unchanged until the user explicitly chooses a new time; opening and saving an unrelated field does not round them.
- Browser time zone changes across daylight-saving transitions or while a modal/report is open; the same stored instant remains stable and the current browser-local interpretation is refreshed before confirmation or filtering.
- Memo content is pasted from rich sources, contains unsupported formatting, unsafe markup, deeply nested lists, very long text, or hidden/encrypted content; only supported semantics survive and unsafe content never executes or leaks.
- A parent task is archived, inaccessible, the same task, or a descendant; it is not selectable, and an existing unavailable relationship is represented without exposing unauthorized details.
- A table, dropdown, modal, drag target, priority icon, rich-text toolbar, timer, or color control is used at 200% zoom, by screen reader, by keyboard, or on iPhone/iPad touch viewports; the primary action remains operable without clipped essential controls or color-only meaning.
- CSV values contain commas, quotes, line breaks, right-to-left text, spreadsheet-like formulas, or multiple attachments; exported data remains structurally correct and does not become executable content when opened in common spreadsheet software.
- Global list permissions change while a user has the administration page open; the next operation rechecks authorization and does not rely on stale displayed controls.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Device-bound session credentials MUST NOT be introduced by this feature. Their implementation is deferred until the exact W3C DBSC protocol is supported by every required Chrome and Safari/WebKit browser class.
- **FR-002**: Existing opaque-session format, establishment, renewal, validation, and sign-out behavior MUST remain unchanged. Successful password reset or change, TFA enrollment or disablement, recovery-code rotation, administrator factor recovery, and other factor-security state changes MUST increment `sessionEpoch` and revoke all existing sessions. A verified initiating flow MAY receive a fresh session only after completing any required TFA verification.
- **FR-003**: Users MUST be able to enroll, verify, disable, and recover TFA from their profile after appropriate reauthentication; enrollment MUST provide authenticator-app compatible codes and a one-time set of recovery codes.
- **FR-004**: Administrators MUST have verified TFA and MUST complete it at sign-in before receiving any authenticated access; ordinary users MAY use TFA but are not required to enroll.
- **FR-005**: TFA and recovery-code challenges MUST be rate-limited, single-purpose, replay-resistant, and generic about account and factor state. Only a separately authorized recovery operator MAY reset an administrator's lost TFA enrollment; the reset MUST be audited, revoke all administrator sessions, and require new TFA enrollment before any authenticated access.
- **FR-006**: Signed-out password reset MUST require username, the account PIN, and two matching valid entries of the new password; successful reset MUST revoke every existing session without disabling TFA.
- **FR-007**: Passwords, PINs, TFA secrets and codes, recovery codes, and session credentials MUST never be stored or exposed as plaintext outside the transient context that requires them.
- **FR-008**: A task the current user may edit MUST open for editing in a modal from every primary task representation, preserving the surrounding view and restoring focus on close.
- **FR-009**: The edit modal MUST initialize from the latest durable task state, validate all changed fields, save changes atomically, prevent duplicate submission, and warn before discarding unsaved input.
- **FR-010**: Parent-task selection MUST use a Select2-style searchable dropdown that offers only authorized eligible tasks, supports clear selection when optional, distinguishes duplicate labels safely, and prevents self-parenting and cycles.
- **FR-011**: Memo editing MUST provide visible controls and keyboard-accessible semantics for bold, italic, strikethrough, ordered lists, and unordered lists while preserving unformatted text and line structure.
- **FR-012**: Memo persistence, display, search, synchronization, copy, backup, restore, and export MUST preserve supported formatting semantics and sanitize unsupported or unsafe input; hidden memo protections MUST apply equally to formatted content.
- **FR-013**: When a task has no due date, every task representation MUST leave the date display empty and MUST NOT substitute "Someday," a current date, or any other placeholder.
- **FR-014**: New due-time selection MUST offer five-minute increments, while existing off-increment values MUST remain unchanged unless the user explicitly selects a replacement.
- **FR-015**: Due times and completed-report date boundaries MUST display and accept input in the current browser time zone without exposing a time-zone selector; persisted instants and date-only values MUST retain their established meanings.
- **FR-016**: Each user MUST be able to configure a timer for a specific authorized task, defaulting a newly opened timer to ten minutes and accepting positive whole-minute durations from 1 through 1,440 minutes.
- **FR-017**: A task timer MUST support start, pause, resume, stop, restart, duration change, and repeat on/off controls and MUST display its task association, duration, remaining time, running state, and repeat state. Confirming a duration change while an interval is running MUST restart that interval from the new full duration rather than silently reinterpret elapsed time.
- **FR-018**: When repeat is enabled, a finished timer MUST produce completion feedback once per active device and interval and start a new interval of the configured duration; it MUST continue until stopped or repeat is disabled. Finishing a timer interval means only that the interval elapsed: it MUST NOT create a task `CompletionEvent`, mark the task complete, or otherwise mutate the task.
- **FR-019**: At most one account-wide personal timer may run per user at a time; starting another MUST require an explicit switch. The canonical timer MUST synchronize across the user's authorized devices and remain correct across navigation, reload, offline operation, browser suspension, and clock correction. Concurrent offline control actions MUST surface a conflict and converge without silently losing either action.
- **FR-020**: Users MUST be able to reorder tasks in each personal overall or project stack by pointer drag, touch drag, and an equivalent keyboard action, preserving the established authorization, filtering, and per-user rank rules.
- **FR-021**: Reorder feedback MUST identify the moving task, valid destination, resulting position, pending state, success, failure, and conflict without relying on animation alone.
- **FR-022**: Extra Low MUST be removed from active schemas, priority choices, filters, legends, reports, imports, exports, and UI only after a read-only inventory verifies zero persisted values across current records, projections, pending mutations, and backup/restore fixtures. Any unexpected Extra Low value MUST block deployment and require explicit review; this feature MUST NOT silently rewrite it or unrelated rank/data.
- **FR-023**: Priority icons MUST have a compact presentation suitable for dense controls and narrow viewports while retaining distinct shape or marking, sufficient contrast, and an accessible text name at every supported size.
- **FR-024**: The application MUST provide a dedicated authenticated user profile page containing user-scoped reminders, sound preferences, Google setup, password change/reset guidance, TFA management, and other personal settings.
- **FR-025**: System-wide configuration, user administration, and global list administration MUST be absent from ordinary task, list, and profile pages and available only in clearly separate authorized administration destinations.
- **FR-026**: The administrative user list MUST be a responsive table with stable row identity; labeled columns for user identity, role, status, group summary, and relevant account state; and accessible row actions.
- **FR-027**: Every user-facing group selector MUST be a dropdown populated only with groups the actor may use, with search when the available set exceeds the usable visible space and a clear empty choice when group is optional.
- **FR-028**: The initial add-list-item workflow MUST accept the same optional signed amount and cost/positive meaning available during editing and MUST save the name and amount as one operation.
- **FR-029**: Global reusable-item administration MUST be removed from individual list views and remain available in a separate destination under its established authorization rules; moving it MUST NOT remove ordinary linked-item selection or reset capabilities.
- **FR-030**: The completed-task report MUST remove all time-zone controls, ignore obsolete saved time-zone filter values without disturbing other filters, and apply current browser-local boundaries consistently to display and export.
- **FR-031**: Completed-task CSV MUST include a documented stable column for every current task and subtask field applicable to completed work: identifiers and parent relationship; label, link, memo and memo-protection state; creation, update, due, completion, and lifecycle timestamps; due-date and due-time meaning; owner, assignee, category, project, group, sharing and lock state; priority; status and completion state; recurrence or reminder data; list and post-it presentation data including color; Google synchronization identifiers and state; attachment metadata; and version/conflict metadata.
- **FR-032**: CSV export MUST preserve task/subtask distinction, encode and escape values consistently, protect against spreadsheet formula execution, represent missing and repeated values unambiguously, and exclude secrets, device credentials, factor material, raw encrypted keys, attachment bytes, and reusable private-object access links.
- **FR-033**: Only users authorized for every exported record and field may export it; administrative all-user exports require explicit administrator privilege and an auditable user-confirmed action.
- **FR-034**: A task editable as a post-it MUST expose post-it color selection in the edit modal, show the current color, provide accessible non-color names, and save the color atomically with other task edits.
- **FR-035**: Existing task, account, list, reporting, sharing, lock, archive, Google synchronization, and personal-stack requirements remain in force unless this specification explicitly changes them; where they conflict, this specification governs the behaviors named here.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: Authentication and authorization MUST be enforced for live, cached, synchronized, reported, and exported representations. Passwords, PINs, TFA secrets/codes, recovery codes, session material, hidden memo plaintext, and private attachment access are protected data. Users control their own profile and TFA; administrators control system users and global administration but gain no implicit access to another user's factor secrets or hidden memo plaintext. Security events must be auditable without recording protected values.
- **NFR-002 Data Durability & Recovery**: Task/modal saves, ranks, list amounts, colors, profile settings, credential changes, TFA changes, migrations, and exports MUST be atomic or safely resumable, idempotent under retry, backed up according to existing policy, and explicit about failure. Offline changes must survive browser restart. Conflicts must preserve non-conflicting changes and never silently replace user data. Authentication recovery must revoke compromised state without making task data unrecoverable.
- **NFR-003 Offline Support**: Cached authorized task viewing and editing, memo formatting, timer operation, personal ranking, list-item entry, and post-it color changes MUST remain usable offline and enter the existing visible synchronization flow. TFA enrollment/change, password reset/change, session enrollment/renewal, administration, Google setup, and server-generated export are online-only and MUST explain that limitation. Losing connectivity MUST NOT falsely confirm a security or administrative change.
- **NFR-004 Browser & Responsive Support**: All primary journeys MUST work in current stable Chrome and Safari/WebKit on desktop and supported iPhone/iPad viewports. Touch targets, drag alternatives, modals, tables, dropdowns, formatting controls, icons, timers, and color choices MUST remain usable with touch, keyboard, screen reader, zoom, reduced motion, and browser storage or notification limitations.
- **NFR-005 Errors & Observability**: User-relevant validation, connectivity, conflict, migration, export, and persistence failures MUST be actionable, except authentication responses that must remain generic. Structured CloudWatch records, metrics, and alarms MUST cover safe outcomes for TFA/reset abuse, admin denial, synchronization conflict, timer anomalies, migration failure, and export failure. Logs MUST exclude credentials, factor material, tokens, protected task/memo content, raw search terms, and export rows.
- **NFR-006 Performance**: On a representative mid-range mobile device, the task edit modal and timer controls MUST become usable within one second from cached data; local formatting and field feedback MUST appear within 100 milliseconds; drag or keyboard rank feedback MUST appear within 200 milliseconds; searchable dropdown results for 1,000 cached authorized choices MUST update within 200 milliseconds; and a 10,000-row user table or completed-task result MUST provide usable initial results within two seconds through bounded presentation.
- **NFR-007 AWS Architecture & Cost Impact**: The feature MUST reuse request-driven existing AWS capabilities where they satisfy the requirements, evaluate managed serverless options for new security and export work, and add no always-on compute without explicit justification. Costs must scale primarily with sign-ins, factor checks, task operations, synchronization, and exports; security guarantees, auditability, backup, and browser compatibility may not be weakened to reduce cost.

### Key Entities

- **TFA Enrollment**: A user's optional or role-required second-factor state, including verification status, safe authenticator metadata, recovery-code state, and security-event history; raw current codes are transient.
- **Task Timer**: One account-scoped personal timer associated with one task and synchronized across that user's authorized devices, with configured duration, remaining or timing anchors, running/paused/finished state, repeat state, last completion, version, and synchronization outcome; it does not alter the shared task's completion state or become visible to collaborators merely through task access.
- **Task**: Existing work data extended or governed here by formatted memo semantics, browser-local due presentation, parent selection, priority migration, post-it color, modal editing, and completed export coverage.
- **Formatted Memo**: Task memo content whose allowed semantic marks are bold, italic, strikethrough, ordered list, and unordered list, with safe plain-text meaning and the same visibility/encryption boundary as the existing memo.
- **Personal Stack Position**: The existing user-private relative task rank, changed here through drag, touch, or equivalent keyboard operations without changing another user's order.
- **User Profile**: User-owned settings and integrations, including reminders, sound, Google setup, credential management, and TFA, distinct from system administration.
- **Completed Task Export**: A user-requested, authorization-scoped snapshot of completed tasks/subtasks with a documented field-complete CSV schema and safe representation rules.
- **List Item Amount**: The existing optional signed amount and cost/positive meaning captured either at initial list-item creation or later edit.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Scripted first-run TFA enrollment and PIN-based password-reset journeys complete successfully in under two minutes on each required Chromium/WebKit browser profile, while regression tests confirm zero device-bound-session behavior or partial browser-specific rollout.
- **SC-002**: One hundred percent of administrator sign-ins require a verified second factor, and testing finds zero paths from password/PIN knowledge alone to administrator access, factor-secret disclosure, or bypass of TFA.
- **SC-003**: The scripted first-run modal journey edits a task, formats its memo, chooses a parent, sets or clears its due value, and saves in under two minutes on each required browser profile; cancel and failed-save tests produce zero unintended field changes.
- **SC-004**: The scripted first-run timer journey starts a ten-minute task timer in under 20 seconds on each required browser profile, and 100% of elapsed-time tests remain within two seconds of the correct state after navigation, reload, suspension, offline use, and repeated intervals.
- **SC-005**: In 100% of rank tests, pointer, touch, and keyboard moves produce the same personal order without changing another user's order; rank feedback appears within 200 milliseconds in at least 95% of local interactions.
- **SC-006**: The pre-deployment inventory reports zero persisted Extra Low values; after deletion it appears in zero active schemas, inputs, filters, legends, reports, imports, exports, or UI; and a nonzero inventory blocks deployment without changing rank or other task data.
- **SC-007**: All primary task, profile, administration, list, report, timer, and post-it journeys pass on current Chrome and Safari/WebKit at desktop, iPhone, and iPad sizes with no keyboard focus traps, inaccessible actions, clipped essential controls, or color-only meanings.
- **SC-008**: Navigation and authorization tests for both current account roles locate personal settings only under the profile destination, locate user and global-list administration only under their separate authorized destinations, and expose zero system-administration controls to an ordinary user.
- **SC-009**: Completed-task CSV fixtures containing every supported field produce 100% of documented columns and authorized values with zero malformed rows, executable spreadsheet cells, exposed secrets, or successful-looking partial exports.
- **SC-010**: Across daylight-saving, browser-time-zone-change, undated-task, and existing off-increment-time tests, 100% retain the correct stored meaning, show no time-zone selector, show no placeholder for an absent date, and perform no silent rounding.
- **SC-011**: Scripted browser tests add a list item with an amount in one submission and change a post-it color during one modal edit on every required browser profile, with 100% of successful operations preserved after synchronization and restart.
- **SC-012**: Offline and reconnection tests for task edits, formatted memos, timers, ranks, list amounts, and post-it colors result in zero silent data loss, with every pending, conflicting, or failed change visibly accounted for.

## Assumptions

- Device-bound session credentials are explicitly out of scope for this feature. They will be reconsidered only when the exact W3C DBSC protocol is supported by every required Chrome and Safari/WebKit browser class; this release retains the existing session model.
- TFA uses time-based codes compatible with common authenticator apps plus one-time recovery codes. SMS, email codes, push approval, hardware-only factors, and passkeys as the primary sign-in method are outside this feature.
- Existing administrators enroll TFA at their first successful primary authentication after rollout and cannot access any authenticated application area until enrollment completes. Ordinary users may opt in.
- The existing account PIN remains a separately verified recovery secret. Password reset requires it but does not bypass TFA, reveal account existence, or serve as an administrator's lost-factor recovery method. Administrator lost-factor recovery is restricted to a separately authorized recovery operator, revokes all sessions, and forces TFA re-enrollment.
- One account-wide task timer may run per user at a time and synchronizes across that user's authorized devices. Timer state is personal and not visible or controllable by collaborators; conflicting offline control actions require visible resolution. Timer completion provides feedback but never marks the task complete. Durations use whole minutes from 1 minute through 24 hours.
- "Select2-style" describes the observable searchable, keyboard-operable dropdown experience required for parent tasks. A React-compatible implementation MUST provide that behavior; the exact Select2 library is not required.
- Group dropdowns apply wherever users select an existing group; fixed enumerations such as role and priority are not group/reference searches.
- Neither current user has persisted Extra Low content. Removal therefore uses a read-only zero-data inventory followed by code/schema deletion rather than a backfill. Any unexpected current, projected, pending, historical, or restore-fixture value blocks deployment for explicit review.
- Existing due instants remain absolute instants and display in the current browser time zone. Date-only tasks remain date-only. Removing time-zone controls does not reinterpret or rewrite stored history.
- Memo rich text is intentionally limited to bold, italic, strikethrough, and ordered/unordered lists. Images, tables, headings, arbitrary fonts/colors, embedded media, and executable content are out of scope.
- Completed-task CSV extends the existing export behavior and includes every current task/subtask business field and safe metadata, but excludes revision history, deleted records, attachment bytes, secrets, decrypted hidden-memo plaintext without separate authorization, and reusable private-storage links.
- The existing enhanced-list, personal-stack, Google synchronization, archive/reporting, account-settings, and responsive-completed-task specifications remain dependencies. This specification supersedes only their conflicting behavior for the explicitly named changes.
