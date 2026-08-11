# Feature Specification: Task and Account Experience Refinements

**Feature Branch**: `current working branch`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Make all reference fields searchable dropdowns; default a new task's assignee to the person adding it; remove time zone from the completion dashboard; move completion sound settings to a user settings page; add password reset using a PIN while signed out and password change from settings while signed in; require administrators to enter password and PIN twice when creating users; and make the completion sound resemble crumpling paper."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Safely Reset or Change a Password (Priority: P1)

A signed-out user who has forgotten a password can establish a new one by supplying the account username and PIN. A signed-in user can change the password from a user settings page after confirming the current password. Both journeys confirm the new password and leave the account in a secure, understandable state.

**Why this priority**: Account recovery is essential access functionality and handles sensitive credentials, so correctness and abuse resistance have the highest priority.

**Independent Test**: Create an account with a known PIN, complete both the signed-out reset and signed-in change journeys, and verify that the new password works, the old password does not, and other sessions are invalidated.

**Acceptance Scenarios**:

1. **Given** an active user is signed out, **When** the user submits the correct username and PIN plus matching valid new-password entries, **Then** the password is changed and the user can sign in with the new password.
2. **Given** a signed-out reset contains an incorrect username or PIN, **When** it is submitted, **Then** no password changes and the response does not reveal whether the username or PIN was wrong.
3. **Given** a user is signed in and opens user settings, **When** the user supplies the correct current password and matching valid new-password entries, **Then** the password changes and the user receives a clear success confirmation.
4. **Given** either password journey has mismatched new-password entries or an invalid new password, **When** the user submits it, **Then** no change occurs and the field-level problem is explained without clearing unrelated fields.
5. **Given** a password was successfully reset or changed, **When** an existing session tries to continue, **Then** it must reauthenticate with the new password; the initiating signed-in session may continue only if its identity is safely re-established as part of the change.

---

### User Story 2 - Create a User Without Credential Entry Mistakes (Priority: P1)

An administrator creating a user must enter the initial password twice and the PIN twice. The account is created only when each pair matches and satisfies its validation rules.

**Why this priority**: A mistyped initial credential can lock a new user out or undermine recovery before the user ever signs in.

**Independent Test**: Attempt user creation with matching and mismatching credential pairs and verify that only a complete, valid, matching submission creates one user.

**Acceptance Scenarios**:

1. **Given** an administrator is adding a user, **When** the administrator enters matching valid password values and matching valid PIN values, **Then** exactly one account is created.
2. **Given** either password entries or PIN entries do not match, **When** the administrator submits the form, **Then** no account is created and the mismatched pair is identified.
3. **Given** a non-administrator attempts the same operation, **When** the request is made, **Then** it is rejected regardless of whether the credential pairs match.

---

### User Story 3 - Choose Related Records from Searchable Dropdowns (Priority: P2)

When a form or filter asks a user to select an existing related record—such as an assignee, category, project, list, group, parent task, or other application entity—the user can open a dropdown, type to narrow the available choices, and select a valid record without needing to remember or enter its identifier.

**Why this priority**: Reference selection is repeated throughout task management; consistent searchable controls reduce mistakes and make larger datasets manageable.

**Independent Test**: Exercise every reference field with mouse, keyboard, and touch; search by visible identifying text; select, clear, and submit a value; and verify that the correct related record is retained.

**Acceptance Scenarios**:

1. **Given** a reference field has multiple permitted choices, **When** the user types part of a choice's visible name, **Then** the dropdown narrows to matching choices and the user can select one.
2. **Given** a selected reference is optional, **When** the user clears it, **Then** the form represents the documented empty choice, such as "Unassigned" or "All projects."
3. **Given** choices are constrained by another field or the user's authorization, **When** the controlling value changes or the dropdown opens, **Then** only valid, authorized choices are offered and an invalid prior selection is cleared with visible feedback.
4. **Given** a reference field has no matching choices, **When** the user searches, **Then** a clear empty-result message appears and arbitrary text cannot be submitted as a record reference.
5. **Given** an existing referenced record is archived, deleted, or no longer visible, **When** its saved form or filter is opened, **Then** the application represents the unavailable selection safely without exposing unauthorized details and requires a valid choice before an invalid relationship can be saved.

---

### User Story 4 - Start New Tasks with Myself Assigned (Priority: P2)

When a signed-in user opens a blank task form, the assignee defaults to that user. The user can still choose another permitted assignee or leave the task unassigned before saving.

**Why this priority**: Most newly entered work belongs to the person recording it, and a useful default saves effort while preserving flexibility.

**Independent Test**: Sign in as two different users, open a new task form for each, and verify that each sees themselves selected while editing existing tasks and explicit assignee choices remain unchanged.

**Acceptance Scenarios**:

1. **Given** a signed-in user opens a new blank task form, **When** the form is ready, **Then** that user is the selected assignee.
2. **Given** a task context has an intentional existing default assignee, **When** a user opens a new task form in that context, **Then** the context-specific default takes precedence over the creator default.
3. **Given** the user changes or clears the default assignee, **When** the task is saved, **Then** the user's explicit choice is retained.
4. **Given** an existing task has any assignee state, **When** it is edited by another user, **Then** its assignee is not replaced automatically.

---

### User Story 5 - Manage Completion Feedback in User Settings (Priority: P3)

A signed-in user manages completion sounds from a dedicated user settings page instead of the task workspace. When enabled, completing a task plays a brief sound recognizable as paper being crumpled; when disabled, task completion is silent.

**Why this priority**: Consolidating preferences improves discoverability, while more fitting audio makes completion feedback pleasant without affecting core task workflows.

**Independent Test**: Change the completion-sound preference in user settings, complete tasks with it on and off, and verify persistence and the correct sound behavior after reopening the application.

**Acceptance Scenarios**:

1. **Given** a signed-in user opens user settings, **When** settings load, **Then** the completion-sound control displays its current value.
2. **Given** completion sounds are enabled, **When** the user completes a task through a direct user action, **Then** one short paper-crumpling sound plays.
3. **Given** completion sounds are disabled, **When** the user completes a task, **Then** no completion sound plays.
4. **Given** the user changes the setting and reopens the application in the same browser, **When** user settings load, **Then** the selected value remains in effect.
5. **Given** the user is outside user settings, **When** viewing the task workspace or completion dashboard, **Then** the completion-sound control is not duplicated there.

---

### User Story 6 - View a Simpler Completion Dashboard (Priority: P3)

A user can view and filter completion reporting without seeing or managing a time-zone field on the dashboard. Completion dates and periods continue to use the application's established time-zone behavior consistently.

**Why this priority**: Removing a low-value technical control reduces dashboard clutter without changing the meaning of reports.

**Independent Test**: Open the completion dashboard across supported viewports, verify that no time-zone field appears, and confirm that daily and weekly totals still fall into the expected dates under the established account or browser time zone.

**Acceptance Scenarios**:

1. **Given** a user opens the completion dashboard, **When** its filters appear, **Then** no time-zone input or selector is shown.
2. **Given** a completion occurs near a date boundary, **When** the dashboard groups the event, **Then** it uses the established application time zone consistently without requiring dashboard input.
3. **Given** previously saved dashboard filters include a time-zone value, **When** the dashboard loads them, **Then** other filter values remain usable and the removed value does not reappear or cause an error.

### Edge Cases

- Password reset is attempted while offline; the application explains that a connection is required and does not imply that the password changed.
- Repeated failed PIN attempts, rapid reset submissions, or simultaneous reset attempts are throttled without revealing account existence; a successful reset invalidates outstanding attempts.
- A disabled or deleted account requests a reset; the response remains generic and the account is not reactivated.
- The password changes between opening and submitting the signed-in form; the stale current password is rejected and no partial change occurs.
- Two administrators submit the same new username concurrently; at most one account is created and the other receives a safe conflict message.
- A dropdown contains hundreds or thousands of choices, duplicate display names, accented text, or long labels; search remains responsive and choices include enough permitted identifying context to distinguish them.
- A reference list is unavailable while offline; locally cached authorized choices remain selectable when safe, uncached choices are not invented, and pending changes synchronize or surface a conflict after reconnection.
- A user opens a dropdown on a narrow iPhone or iPad viewport or with screen-reader/keyboard navigation; the menu remains visible, dismissible, labeled, and operable without trapping focus.
- The browser blocks audio until user interaction or the sound asset is unavailable; task completion still succeeds and no repeated or disruptive error occurs.
- A task is completed by synchronization, import, or another user's action; sound does not play unless the completion results directly from the current user's interaction.
- Existing completion-report dates were saved with an explicit dashboard time zone; removing the control does not rewrite historical completion timestamps.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every field whose value references an existing application record MUST use a consistent dropdown that supports browsing, text search, selection, and clearing when the relationship is optional.
- **FR-002**: Reference searches MUST match permitted choices using their user-visible identifying text and MUST distinguish choices with duplicate primary names using additional non-sensitive context.
- **FR-003**: Reference dropdowns MUST submit only valid record identifiers from the user's authorized choices; typed search text alone MUST NOT become a reference value.
- **FR-004**: Reference dropdowns MUST preserve each field's existing empty-choice semantics, dependency rules, archived-record behavior, and authorization boundaries.
- **FR-005**: A new blank task MUST initially select the authenticated user as assignee unless a more specific existing task-context default applies.
- **FR-006**: The creator-default assignee MUST NOT overwrite an existing task's assignee or a user's explicit new-task choice.
- **FR-007**: The completion dashboard MUST NOT display a time-zone field and MUST continue grouping completions according to the application's established time-zone policy.
- **FR-008**: Removing the dashboard time-zone field MUST preserve all unrelated saved completion-filter values and MUST NOT alter stored event timestamps.
- **FR-009**: The application MUST provide a user settings page available to authenticated users.
- **FR-010**: The user settings page MUST contain the completion-sound preference, and the task workspace and completion dashboard MUST no longer contain that preference control.
- **FR-011**: The completion-sound preference MUST retain its existing browser-local scope and value when moved to user settings, including after application restart.
- **FR-012**: When completion sounds are enabled, one brief paper-crumpling-style sound MUST play only after a task completion directly initiated by the current user; disabling the preference MUST suppress it.
- **FR-013**: The signed-out experience MUST provide a password-reset journey requiring username, PIN, new password, and confirmation of the new password.
- **FR-014**: A signed-out password reset MUST succeed only for an active account with a matching PIN and a valid matching new-password pair.
- **FR-015**: Failed signed-out resets MUST use generic responses that do not reveal whether an account exists, is active, or has the supplied PIN.
- **FR-016**: Password-reset attempts MUST be rate-limited and abuse-monitored by account and request source without recording credentials.
- **FR-017**: The user settings page MUST provide a signed-in password-change journey requiring the current password, a valid new password, and confirmation of the new password.
- **FR-018**: A successful password reset or change MUST invalidate all pre-existing sessions; any continuing initiating session MUST be re-established securely against the changed credential state.
- **FR-019**: Password changes MUST be atomic: validation or persistence failure MUST leave the previous password usable and MUST show an actionable, non-sensitive error.
- **FR-020**: The administrator's create-user form MUST require password, password confirmation, PIN, and PIN confirmation fields.
- **FR-021**: User creation MUST be rejected before account creation when either credential pair differs or fails its existing validation policy.
- **FR-022**: Credential confirmation values MUST be used only for equality validation and MUST NOT be retained after the operation.
- **FR-023**: Passwords and PINs MUST be masked by default in every affected form, with accessible field labels and optional reveal controls that do not reveal another field automatically.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: Only administrators may create accounts. Only the account owner may change a password while authenticated; signed-out recovery requires the account username and PIN. Passwords, PINs, confirmation values, reset submissions, session credentials, and credential verifiers must never appear in client persistence, URLs, analytics, application logs, or user-visible diagnostics. Authorization must be enforced independently of displayed controls. Successful credential changes must revoke earlier sessions and must not alter task ownership or sharing permissions.
- **NFR-002 Data Durability & Recovery**: Account creation and credential changes must be atomic, idempotent against duplicate submission, and recover safely from timeout or retry without duplicate accounts or ambiguous credential state. Reference selections and preference changes must follow existing persistence, outbox, conflict, backup, and restoration behavior; failures must never silently overwrite an explicit user selection.
- **NFR-003 Offline Support**: Reference dropdowns may use cached authorized records offline and must visibly indicate when choices may be incomplete. New-task assignee defaults, local completion-sound settings, and existing dashboard data remain usable offline. Account creation and password reset/change are online-only and must be disabled or rejected with a clear connectivity explanation. Pending task changes must synchronize after reconnection using existing conflict behavior.
- **NFR-004 Browser & Responsive Support**: All journeys must work in current stable Chrome and Safari/WebKit, including touch operation on supported iPhone and iPad sizes. Searchable dropdowns must support keyboard navigation, screen readers, zoom, menu dismissal, and constrained viewports. Credential managers and password autofill must be able to distinguish current, new, and confirmation fields. Audio limitations must never block task completion.
- **NFR-005 Errors & Observability**: Users must receive actionable validation, connectivity, and persistence messages, except where generic wording is required to protect account existence. Structured operational records must cover safe outcomes for account creation, reset/change, throttling, reference-loading failure, and preference failure with correlation identifiers, metrics, and alarms. Logs must exclude credentials, confirmation values, protected task content, raw reference queries, and record labels.
- **NFR-006 Performance**: For up to 1,000 locally available reference choices, dropdowns must open within 300 milliseconds and update visible matches within 200 milliseconds on a representative mobile device. Under normal connectivity, user settings and completion dashboard controls must become usable within two seconds, excluding browser-managed credential or audio prompts.
- **NFR-007 AWS Architecture & Cost Impact**: The feature must reuse existing authentication, storage, task, reporting, and on-demand observability capabilities where they satisfy these requirements. Credential operations and throttling must use request-driven resources and must not introduce always-on compute; added cost must scale with actual settings and credential operations.

### Key Entities

- **User Account**: An authenticated person's identity, role, active state, password verifier, PIN verifier, and session-validity generation. Password and PIN plaintext and confirmation values are transient inputs, not stored account attributes.
- **User Preference**: A setting belonging to a user experience context; for this feature, completion-sound enabled state retains its existing browser-local persistence scope.
- **Record Reference Choice**: A currently authorized selectable relationship represented by a stable identifier and permitted display text, with optional dependency, lifecycle, and empty-choice rules.
- **Task Assignment**: The relationship between a task and an authorized assignee, including whether the initial value came from a task context, the creator default, or an explicit user choice.
- **Password Credential Event**: A security-relevant outcome for account creation, signed-out reset, or signed-in change, containing only safe operation type, result, timing, correlation, and throttling context—not credential values or protected account data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability testing, at least 95% of users can locate and select a permitted record from a 500-choice reference field on the first attempt in under 15 seconds.
- **SC-002**: Across all reference fields, automated accessibility journeys complete with keyboard alone and touch on supported narrow viewports with zero focus traps or submission of arbitrary search text.
- **SC-003**: In 100% of tested blank task forms, the correct signed-in creator is initially assigned unless a documented context default applies; existing and explicitly changed assignments are preserved in 100% of regression cases.
- **SC-004**: At least 95% of users with valid credentials can complete either password journey on the first attempt in under two minutes.
- **SC-005**: Security testing observes zero account-existence disclosures, credential values in logs or client persistence, successful unthrottled brute-force sequences, or surviving old sessions after a credential change.
- **SC-006**: In administrator tests, 100% of mismatched password or PIN pairs prevent user creation, while valid matching pairs create exactly one account under retries and concurrent submission.
- **SC-007**: The completion dashboard contains no time-zone control at any supported viewport, while 100% of date-boundary reporting tests retain the established completion grouping.
- **SC-008**: The completion-sound preference is discoverable on user settings, absent from the task workspace and dashboard, and retains its prior value after restart in 100% of supported-browser tests.
- **SC-009**: In a listening evaluation, at least 80% of participants describe the enabled completion sound as paper crumpling or a closely related paper sound, and task completion remains successful in 100% of audio-blocked or audio-failure tests.
- **SC-010**: Reference dropdown interaction meets the 300-millisecond open and 200-millisecond search-update targets for 1,000 local choices on the representative mobile performance profile.

## Assumptions

- "Reference field" means any user-facing form or filter field that selects an existing application entity; fixed enumerations such as role, priority, reporting period, and week-start day are not record references and need not become searchable.
- Searchable dropdown behavior is required, but no particular user-interface library is mandated.
- An existing context-specific default assignee, such as a category or project default, is more intentional than the general creator default and therefore takes precedence.
- The completion dashboard will use the same established automatic/account-level time-zone policy used elsewhere; this feature removes only the dashboard control, not time-zone-aware date handling or the task due-time-zone field.
- The completion-sound setting retains its current per-browser persistence scope; moving it does not convert it into a cross-browser account preference.
- The existing account PIN is the recovery factor for signed-out password reset. The feature does not add email, SMS, administrator-assisted, or one-time-link recovery.
- The signed-out reset identifies the account by username. Responses are generic, attempts are throttled, and the workflow requires connectivity.
- Signed-in password change requires the current password and two matching entries of the new password; it does not require the PIN.
- Existing password and numeric PIN strength policies remain authoritative. Administrators enter each initial credential twice, but users do not receive or store a recoverable plaintext copy.
- Password reset/change and account creation reuse existing user and authentication boundaries; no new third-party identity or notification service is required.
- User settings are available only after authentication and may also host other user-scoped preferences over time, but migrating unrelated settings is outside this feature.
- The paper-crumpling sound is a brief, non-verbal feedback asset with no protected data; exact audio production is decided during design and evaluated against the stated listening outcome.
