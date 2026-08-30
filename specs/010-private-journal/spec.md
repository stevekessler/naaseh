# Feature Specification: Private Journal and Wellness Dashboard

**Feature Branch**: `main`

**Created**: 2026-08-23

**Status**: Draft

**Input**: User description: "Add a private, encrypted per-user journal with structured daily wellness and DBT fields, task-linked notes, configurable sensitive sections, date-based browsing, and a trend dashboard."

## Clarifications

### Session 2026-08-23

- Q: How should journal access be recovered if a user loses their decryption credentials? → A: An authorized service administrator can restore journal access through tightly controlled administrative decryption.
- Q: What should the application do in response to suicidal-thought or self-harm answers? → A: Record the responses only, with no crisis resources, automated response, notification, or sharing.
- Q: What deletion capability should journal entries have? → A: Entries cannot be deleted; users may only edit them.
- Q: Which configurable journal sections should be enabled for a new user by default? → A: Both the suicidal-thoughts/self-harm section and the DBT skills section default to enabled.
- Q: Which journal-entry fields are required? → A: Only the journal date is required; all structured responses and notes are optional.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record a Private Daily Journal (Priority: P1)

As an authenticated user, I can create and edit my daily journal entry using structured wellness questions and rich-text notes, confident that no other user or administrator can read or change it.

**Why this priority**: Secure daily entry is the core value of the feature and the source of all browsing and dashboard information.

**Independent Test**: A user can create an entry, sign out and back in, reopen it, and edit it, while a different user and an administrator are both denied access to its content.

**Acceptance Scenarios**:

1. **Given** an authenticated user has no entry for today, **When** they open the add-entry page, **Then** the date defaults to the user's current local date and all enabled journal questions are available.
2. **Given** a user supplies valid journal values, **When** they save, **Then** the entry is persisted and can subsequently be read and edited only by that user.
3. **Given** a user enters a slider value by dragging or by keyboard, **When** the value is within the field's range and step, **Then** the same value is accepted and displayed by both controls.
4. **Given** a user enters formatted notes, **When** they save and reopen the entry, **Then** bold, italic, underline, strikethrough, bulleted list, numbered list, and link formatting are preserved.
5. **Given** another user or an administrator knows an entry identifier or attempts access outside the authorized recovery workflow, **When** they try to list, read, edit, export, or otherwise retrieve the entry, **Then** no journal content or content-derived details are disclosed and no change is made.
6. **Given** the user already has an entry for a date, **When** they attempt to add another entry for that date, **Then** they are directed to the existing entry rather than creating a duplicate.
7. **Given** an existing journal entry, **When** the owner views or edits it, **Then** no control or workflow for deleting the entry is available.
8. **Given** a user selects a valid unused date and leaves every response and notes field unanswered, **When** they save, **Then** the journal entry is accepted.

---

### User Story 2 - Browse and Revisit Entries by Date (Priority: P2)

As a user, I can see my entries in date order, narrow the list to a date range, and open a dedicated page to read or edit an entry.

**Why this priority**: Users need a simple chronological path back to their records without exposing journal text through broad search.

**Independent Test**: With entries across several dates, a user can filter the list by start and end date and follow a result to its read/edit page.

**Acceptance Scenarios**:

1. **Given** a user has journal entries, **When** they open the journal list, **Then** only their entries appear, ordered from newest to oldest, with entry dates and links to read or edit each entry.
2. **Given** the user selects a valid date range, **When** the filter is applied, **Then** only entries whose journal dates fall inclusively within that range appear.
3. **Given** no entries match the selected range, **When** results are shown, **Then** the user sees a clear empty state and can change or clear the dates.
4. **Given** the list page, **When** the user looks for content or keyword search, **Then** none is offered.

---

### User Story 3 - Configure Sensitive Journal Sections (Priority: P2)

As a user, I can independently enable or disable the suicidal-thoughts/self-harm section and the DBT skills section for my future journal interactions.

**Why this priority**: These sections are personally sensitive or specialized and must be controlled by the journal owner.

**Independent Test**: A user can change each preference independently and observe the corresponding section appear or disappear on add, edit, read, and dashboard views without changing another user's preferences.

**Acceptance Scenarios**:

1. **Given** the suicidal-thoughts/self-harm section is disabled, **When** the user adds or views an entry, **Then** that section is hidden and its metrics do not appear on the dashboard.
2. **Given** the DBT skills section is disabled, **When** the user adds, reads, or edits an entry, **Then** that section is hidden.
3. **Given** a section has historical answers and is later disabled, **When** the user views journal features, **Then** the historical answers remain preserved but hidden until the user re-enables the section.
4. **Given** one user changes a section preference, **When** another user opens their journal, **Then** the other user's configuration is unchanged.
5. **Given** the user records any suicidal-thought or self-harm response, **When** the entry is displayed or saved, **Then** the system records it without showing crisis resources, interpreting risk, or notifying or sharing with another person or service.
6. **Given** a user has not previously changed either section preference, **When** they open their journal, **Then** both configurable sections are enabled.

---

### User Story 4 - Relate a Journal Entry to a Task (Priority: P3)

As a user, I can optionally associate a journal entry with one of my relevant tasks and write formatted reflections about that task.

**Why this priority**: Task context makes reflection more useful, but journaling remains valuable without a task reference.

**Independent Test**: A user can choose an eligible task, add task-specific formatted notes, save, and reopen both the reference and notes.

**Acceptance Scenarios**:

1. **Given** the user opens the task selector, **When** eligible choices load, **Then** it contains all of the user's open tasks and their closed tasks completed within the preceding seven calendar days.
2. **Given** the user selects a task, **When** the selection is made, **Then** an unrestricted-length rich-text field appears for reflections about that task.
3. **Given** no task is selected, **When** the entry is saved, **Then** no task-reflection field is required.
4. **Given** a task belongs to another user or is otherwise not visible to the journal owner, **When** access is attempted, **Then** it cannot be selected and its details are not disclosed.

---

### User Story 5 - Review Wellness Trends (Priority: P3)

As a user, I can select a time period, see summary values and directional trends for my journal data, and inspect the entries behind each summary.

**Why this priority**: Summaries turn accumulated entries into insight after secure entry and retrieval are established.

**Independent Test**: With entries in a selected period and the immediately preceding equal-length period, a user can view correct cards, trends, and contributing-entry details.

**Acceptance Scenarios**:

1. **Given** the user opens the dashboard, **When** no custom period has been chosen, **Then** the current seven-day period is selected with accessible start and end date controls.
2. **Given** a selected period contains entries, **When** the dashboard loads, **Then** it shows days journaling, averages for numeric measures, and counts of journal days answered "yes" for yes/no measures listed in this specification.
3. **Given** a metric can be compared with the immediately preceding period of equal duration, **When** the current value is higher or lower, **Then** its card displays an up or down arrow respectively; an unchanged value displays no directional arrow.
4. **Given** the user activates a dashboard card, **When** a detail dialog opens, **Then** it lists the user's journal entries that contributed to that card's displayed value and provides links to open them.
5. **Given** no entries contribute to a metric in the selected period, **When** the dashboard is shown, **Then** the card displays a clear no-data state rather than a misleading zero or trend.
6. **Given** the suicidal-thoughts/self-harm section is disabled, **When** the dashboard loads, **Then** its four related metric cards are absent.

### Edge Cases

- A start date after an end date is rejected with an actionable message, and the last valid results remain available.
- Numeric entry accepts only values within each field's defined minimum, maximum, and step; pasted, typed, or dragged invalid values cannot be saved.
- A calendar-date change between opening and saving a new entry does not silently alter the entry's initially defaulted date.
- Dates are interpreted in the user's configured local time zone, including daylight-saving transitions.
- Empty optional rich-text fields, extremely long notes, links, and pasted formatted content remain safe and do not allow executable or unsafe content.
- If an associated task later closes, ages beyond seven days, is deleted, or becomes unavailable, the saved journal entry remains readable and represents the reference without disclosing inaccessible task content.
- Interrupted saves, duplicate submissions, synchronization retries, and concurrent edits do not create duplicate daily entries or silently overwrite a newer version.
- While offline, the user can access locally available journal data only after authenticating/unlocking; locally stored journal content remains encrypted, pending changes are visibly marked, and conflicts require an explicit safe resolution.
- Failed decryption or unavailable keys do not reveal partial plaintext; the user receives a safe recovery-oriented message and the failure is recorded without journal content.
- Dashboard averages ignore unanswered optional values and clearly distinguish missing data from numeric zero or a "no" answer.
- A dashboard comparison with no prior-period data shows no directional trend.
- The add, read/edit, list, settings, dashboard, and detail-dialog journeys remain keyboard- and touch-usable in current Chrome and Safari/WebKit at supported desktop, iPhone, and iPad sizes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST maintain a separate private journal for each authenticated user.
- **FR-002**: Only the journal owner MUST be able to list, create, read, update, or retrieve content or content-derived data from their journal during ordinary operation; administrators and other privileged application roles MUST be denied access outside the recovery exception in FR-036.
- **FR-003**: Journal content and content-derived private data MUST be encrypted whenever persisted, including primary storage, local offline storage, backups, replicas, exports, and temporary durable storage.
- **FR-004**: Decrypted journal content MUST be made available only within the authenticated and authorized owner's active application use or the bounded recovery workflow in FR-036; it MUST NOT be exposed through general administration interfaces, operational tools, logs, analytics, notifications, previews, URLs, or caches accessible outside those boundaries.
- **FR-005**: The system MUST provide one add-entry page and one dedicated read/edit page for an individual entry.
- **FR-006**: The system MUST allow no more than one journal entry per user per local calendar date and MUST default a new entry to the user's current local date.
- **FR-007**: The journal list MUST show only the owner's entries, newest first, and include each date plus links to read or edit the entry.
- **FR-008**: Users MUST be able to filter the journal list by an inclusive start date, end date, or both; journal-content search MUST NOT be provided.
- **FR-009**: Each entry MUST support these numeric responses: suicidal thoughts (1–10), self-harm thoughts (1–10), alcoholic drinks (1–10), hours of sleep (1–24 in 0.5-hour steps), urge to avoid commitments or obligations (1–100), and anger, fear, anxiety, pain, sadness, shame, guilt, loneliness, joy, and contentment (each 1–100).
- **FR-010**: Every numeric response described as a slider MUST support both pointer/touch slider input and direct keyboard numeric input, enforcing the same range and step through either method.
- **FR-011**: Each entry MUST support yes/no responses for suicidal behaviors, self-harm behaviors, other drug use, medications taken as prescribed, conflict with others, balanced eating, and self-care.
- **FR-012**: The system MUST group suicidal thoughts, suicidal behaviors, self-harm thoughts, and self-harm behaviors in a clearly labeled suicidal-thoughts and self-harm section.
- **FR-013**: The suicidal-thoughts/self-harm section MUST default to enabled for a new user, and each user MUST be able to enable or disable it for their own journal independently of all other users and settings.
- **FR-014**: When a user answers the DBT skills-practice outcome, the section MUST accept exactly one of: "Didn't think about or use skills"; "Thought about skills, didn't use them, didn't want to use them"; "Thought about skills, didn't think I needed them"; "Thought about skills, didn't use them, wanted to"; "Tried but couldn't use skills"; "Used skills but they didn't help"; or "Used skills and they helped."
- **FR-015**: The DBT skills section MUST allow any number of mindfulness selections from: Wise Mind, Observe, Describe, Participate, Nonjudgmentally, Effectively, One-mindfully, and Dialectics/Middle Path.
- **FR-016**: The DBT skills section MUST allow any number of emotion-regulation selections from: Check the Facts, Opposite Action, Problem Solving, Accumulating Positives, Values-based actions, Building Mastery, Cope Ahead, PLEASE, Mindfulness of current emotions, and Riding the emotion wave.
- **FR-017**: The DBT skills section MUST allow any number of interpersonal-effectiveness selections from: DEAR MAN (Objectives Effectiveness), GIVE (Relationship Effectiveness), FAST (Self-Respect Effectiveness), Validating self or others, and Mindfulness of others.
- **FR-018**: The DBT skills section MUST allow any number of distress-tolerance selections from: STOP, Pros and Cons, TIPP, Distracting with ACCEPTS, Self-Soothing, IMPROVE the Moment, Radical Acceptance, Turning the Mind, Willing Hands, Half-Smiling, and Mindfulness of thoughts.
- **FR-019**: The entire DBT skills section MUST default to enabled for a new user, and each user MUST be able to enable or disable it for their own journal independently of all other users and settings.
- **FR-020**: Disabling either configurable section MUST preserve its historical answers while hiding that section from the owner's add, read/edit, and applicable dashboard views until re-enabled.
- **FR-021**: Each entry MUST allow an optional single task reference chosen from the owner's open tasks and tasks closed during the preceding seven calendar days.
- **FR-022**: Selecting a task MUST reveal a task-specific rich-text notes field with no product-defined character limit; clearing the task reference MUST remove the association and its task-specific notes only after user confirmation when notes are present.
- **FR-023**: Each entry MUST include an optional general daily-notes rich-text field with no product-defined character limit.
- **FR-024**: Both rich-text fields MUST support bold, italic, underline, strikethrough, bulleted lists, numbered lists, and links, and MUST render saved content safely.
- **FR-025**: The system MUST provide a private dashboard with an accessible date-range selector defaulting to the current seven-day period.
- **FR-026**: For the selected period, the dashboard MUST show the count of distinct days journaled and averages of answered numeric values for suicidal thoughts, self-harm thoughts, hours of sleep, urge to avoid commitments or obligations, anger, fear, anxiety, pain, sadness, shame, guilt, loneliness, joy, and contentment.
- **FR-027**: For the selected period, the dashboard MUST show counts of distinct journal days answered "yes" for suicidal behaviors, self-harm behaviors, medications as prescribed, conflict with others, balanced eating, and self-care.
- **FR-028**: The four suicidal-thoughts/self-harm dashboard metrics MUST appear only while that section is enabled for the user.
- **FR-029**: Every dashboard metric MUST appear in a visually distinct square card whose color supports, but is not the sole means of conveying, the metric's meaning or state.
- **FR-030**: Each comparable dashboard card MUST indicate whether its value increased or decreased relative to the immediately preceding date range of equal duration, using an up or down arrow plus an accessible text equivalent; unchanged or non-comparable values MUST not show a directional arrow.
- **FR-031**: Activating a dashboard card MUST open a dialog listing exactly the owner's journal entries that contributed an answered value to the displayed aggregate, with each entry's date and a link to open it.
- **FR-032**: Dashboard calculations MUST exclude unanswered values from their denominators, distinguish no data from zero or "no," and use only entries whose journal dates fall inclusively within the selected period.
- **FR-033**: All journal entry, preference, list, dashboard, trend, and contributing-entry access MUST reapply owner authorization rather than relying only on hidden controls or prior navigation.
- **FR-034**: The system MUST preserve unsaved or pending journal changes through supported offline and reconnection workflows without allowing another local or remote user to read them.
- **FR-035**: When concurrent or retried changes conflict, the system MUST prevent silent overwrite, identify the affected entry without exposing its content in logs, and let the owner deliberately resolve the conflict.
- **FR-036**: A specifically authorized recovery administrator MUST be able to restore a user's journal access when the user loses their decryption credentials. Administrative decryption MUST be limited to that user-approved recovery operation, require a documented reason and strong re-authentication, prohibit journal editing, prevent plaintext from being displayed to the administrator, and produce a tamper-evident audit record that contains no journal content.
- **FR-037**: Suicidal-thought and self-harm responses MUST be recorded as private journal data only. The system MUST NOT interpret them as a risk assessment, display crisis resources in response, generate alerts, notify or share with another person or service, or initiate an emergency workflow.
- **FR-038**: Journal entries MUST be retained and editable but MUST NOT be deletable by users, administrators, or the recovery workflow within this feature's supported application behavior.
- **FR-039**: The journal date MUST be the only required entry field. Every numeric response, yes/no response, DBT response, task reference, task-reflection field, and general-notes field MUST be optional.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: Journal entries, rich-text notes, structured answers, preferences, task associations, dashboard aggregates, and decrypted derivatives are protected private data owned solely by the creating user. Authorization MUST be enforced for every read and write path, including direct identifiers, offline synchronization, backups/restores, dialogs, aggregate calculations, and recovery. Administrators may operate the service but MUST have no ordinary application capability to decrypt or view journal data; a least-privilege recovery role may invoke only the bounded, user-approved restoration workflow in FR-036. Keys and plaintext MUST not be placed in source control, telemetry, support artifacts, shared caches, or user-visible URLs. Security validation MUST include cross-user, ordinary administrator, recovery-role misuse, identifier-guessing, task-reference, cached-data, and restored-backup access attempts.
- **NFR-002 Data Durability & Recovery**: Valid saves MUST be durable and recoverable without creating duplicate user/date records. Input validation, retry-safe saves, conflict detection, encrypted backup and restoration, and periodic recovery verification MUST cover entries, preferences, associations, and pending offline changes. Recovery MUST preserve ownership, return access only to the verified owner, keep plaintext hidden from the recovery administrator, and create a tamper-evident content-free audit trail.
- **NFR-003 Offline Support**: Previously synchronized journal views and new or edited entries MUST be usable offline on a previously authorized device, subject to an owner authentication/unlock check. Offline content and pending changes MUST remain encrypted locally. Connectivity and pending-sync state MUST be visible; reconnection MUST retry safely, and competing changes MUST not be silently merged or discarded.
- **NFR-004 Browser & Responsive Support**: All primary journeys MUST work in current stable Chrome and Safari/WebKit, including supported iPhone and iPad viewports. Controls and dialogs MUST remain usable by keyboard, touch, and assistive technology; slider values MUST never require fine pointer control; safe-area, viewport, local-storage, and browser lifecycle constraints MUST not expose or lose journal data.
- **NFR-005 Errors & Observability**: User-actionable failures MUST explain whether data is unsaved, pending, conflicted, or unavailable and offer a safe next action. Centralized structured operational records MUST include safe correlation identifiers, operation type, timing, and outcome, but MUST exclude journal content, answers, formatted text, task-reflection content, plaintext, encryption material, and sensitive aggregate values. Metrics and alarms MUST cover save/sync failures, authorization denials, decryption failures, and backup/recovery health with cost-appropriate retention.
- **NFR-006 Performance**: On a representative supported mobile device and ordinary broadband, 95% of journal list, individual entry, and seven-day dashboard views MUST become usable within 2 seconds; saved-entry confirmation MUST appear within 2 seconds when online. On a degraded mobile connection, 95% MUST become usable within 5 seconds or display an accurate pending/loading state. Numeric and rich-text controls MUST visibly respond within 100 milliseconds during local interaction.
- **NFR-007 AWS Architecture & Cost Impact**: Planning MUST evaluate managed serverless AWS services first for encrypted persistence, synchronization, authorization, backup, monitoring, and key operations. The chosen design MUST document service and key-management cost drivers, expected journal size and dashboard-read volume, recovery costs, and a cheaper viable alternative. Any always-on component requires explicit justification and MUST not weaken the privacy, durability, offline, or performance outcomes.

### Key Entities *(include if feature involves data)*

- **Journal Profile**: A user's journal ownership boundary and per-user enablement preferences for the sensitive/self-harm and DBT sections, both initially enabled.
- **Journal Entry**: One private record for one owner and one local calendar date, containing structured wellness responses, optional DBT responses, optional general notes, and timestamps/version information needed for safe editing and synchronization.
- **Task Reflection**: An optional association between one journal entry and one task visible to the same owner, plus private formatted notes about that task.
- **DBT Skills Response**: The single practice outcome and zero or more selected skills in each of the four DBT categories for an entry.
- **Dashboard Period**: An owner-selected inclusive date range and its immediately preceding equal-length comparison range.
- **Dashboard Metric**: A private aggregate for one defined measure, its no-data/comparison state, and the set of owner entries that contributed answered values.
- **Pending Journal Change**: An encrypted local creation or edit awaiting synchronization, including conflict/version state but never shareable content.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In authorization testing, 100% of attempts by another user or an administrator outside the authorized recovery workflow to list, read, edit, derive, or restore journal content are denied without disclosing content or sensitive metadata; 100% of recovery operations require the controls in FR-036 and return access only to the verified owner.
- **SC-002**: In storage, backup, offline-cache, telemetry, and support-artifact inspections, 100% of sampled journal content and sensitive answers are encrypted or absent; no readable journal plaintext appears outside the authorized owner's active use.
- **SC-003**: At least 90% of representative users can create and save a journal entry containing their chosen responses on their first attempt without assistance, and can enter every numeric field using either keyboard or slider/touch input.
- **SC-004**: At least 95% of users can locate and open an entry from a specified date range within 30 seconds.
- **SC-005**: For a test set covering missing answers, zero/no values, configurable sections, and comparison periods, 100% of dashboard cards, contributing-entry lists, and trend directions match independently calculated expected results.
- **SC-006**: At least 90% of representative users correctly understand whether each dashboard value is an average, a count of days, or no data without external explanation.
- **SC-007**: Across current stable Chrome and Safari/WebKit on representative desktop, iPhone, and iPad viewports, 100% of primary create, edit, list/filter, configure, dashboard, and metric-detail journeys can be completed with keyboard or touch input.
- **SC-008**: During simulated disconnect, retry, concurrent-edit, and recovery scenarios, 100% of acknowledged or pending journal changes are either preserved or surfaced for explicit owner resolution, with no silent loss, duplicate daily entry, or cross-user disclosure.
- **SC-009**: The performance targets in NFR-006 are met in at least 95% of measured journeys under their stated device and network conditions.

## Assumptions

- The existing application authentication and user identity system is reused; journal privacy applies to every authenticated user, including users who otherwise hold an administrator role, except for the narrowly authorized access-restoration operation in FR-036.
- A user has at most one journal entry per local calendar date. Editing the date to one already used opens or conflicts with the existing entry instead of creating a duplicate.
- Only the journal date is required; all structured questions, skill selections, task fields, and notes are optional, and missing answers are not treated as zero or "no."
- "No limit" for rich-text notes means no product-defined character limit; ordinary safety, storage, and abuse-protection constraints may reject content too large to process safely with a clear message and without losing the user's draft.
- The optional task reference is a single task. Eligible closed tasks are those completed during the seven calendar days immediately before selection, and task visibility never exceeds the user's existing task permissions.
- Dashboard numeric values are arithmetic averages of answered values. Yes/no values are counts of distinct journal days answered "yes." Days journaling is the number of distinct entry dates in the selected range.
- A trend compares the selected period with the immediately preceding, non-overlapping period containing the same number of calendar days. An arrow reflects numeric direction only and does not imply that the change is clinically positive or negative.
- The dashboard includes only the metrics explicitly requested; alcoholic drinks, other drug use, DBT responses, and task data remain in entries but are not dashboard cards in this feature.
- Colors are chosen to distinguish cards and aid scanning, not to diagnose, score clinical risk, or label a value as good or bad. This feature intentionally does not provide diagnosis, risk interpretation, crisis resources, crisis intervention, alerts, or sharing with clinicians, emergency services, trusted contacts, or other people.
- Disabling a configurable section changes its visibility rather than deleting historical answers, preventing accidental data loss and allowing later re-enablement.
- User-initiated deletion of an individual entry or an entire journal is outside this feature's scope; retention and recovery operations must preserve all entries.
- Journal content locally available offline is accessible only on a previously authorized device after an owner authentication or unlock check and is encrypted whenever not actively rendered for that owner.
