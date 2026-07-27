# Feature Specification: Bidirectional Google Tasks Sync

**Feature Branch**: `004-google-tasks-sync`

**Created**: 2026-07-25

**Status**: Draft

**Input**: User description: "Implement full bidirectional synchronization of dated Na'aseh activities with Google Calendar as tasks, using Spec Kit."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect Google and Publish Dated Tasks (Priority: P1)

An authenticated user connects one Google account, chooses or creates a dedicated Google task
list, and enables synchronization. Eligible open Na'aseh tasks with due dates then appear as
Google Tasks and therefore in the user's Google Calendar task view. Later Na'aseh edits to shared
fields are reflected in Google without creating duplicates.

**Why this priority**: Publishing existing dated work to the calendar is the core value and creates
the durable identity mapping needed by all later synchronization.

**Independent Test**: Connect a test Google account, enable sync for a dedicated list, create and
edit a dated Na'aseh task, and confirm exactly one corresponding Google Task reflects each supported
change.

**Acceptance Scenarios**:

1. **Given** a signed-in Na'aseh user with no Google connection, **When** the user starts connection and grants only the required task permission, **Then** Na'aseh shows the connected Google account, selected task list, synchronization status, privacy policy, and a disconnect control.
2. **Given** synchronization is enabled, **When** the user creates an eligible dated Na'aseh task, **Then** one corresponding open Google Task is created in the selected list within the synchronization target and remains linked to the Na'aseh task.
3. **Given** a linked task, **When** the user changes its title or due date in Na'aseh, **Then** the corresponding supported Google fields are updated without creating another task.
4. **Given** a Na'aseh task with a due time, **When** it is sent to Google, **Then** Google receives the due date while Na'aseh retains its exact due time and time zone and clearly explains that Google Tasks cannot display or edit that time.
5. **Given** a private or hidden-content task, **When** it has not been explicitly approved for Google sharing, **Then** its protected title and memo are not sent to Google.

---

### User Story 2 - Import and Reconcile Google Changes (Priority: P1)

A connected user can create or edit a task in the selected Google task list and have the supported
changes appear in Na'aseh. Synchronization covers title, due date, open/completed state, and
deletion or archival intent while respecting each product's different capabilities.

**Why this priority**: A full bidirectional integration must let Google Calendar and Google Tasks be
useful input surfaces, not merely read-only mirrors.

**Independent Test**: Create, edit, complete, reopen, and delete tasks in the selected Google list,
run synchronization after each action, and verify deterministic Na'aseh results with no duplicate
records or silent loss.

**Acceptance Scenarios**:

1. **Given** a connected account and an unlinked dated Google Task in the selected list, **When** synchronization runs, **Then** one Na'aseh task is created with the Google title, date, open/completed state, source attribution, and the user's configured default local due time.
2. **Given** a linked task, **When** its title or due date changes in Google, **Then** the corresponding Na'aseh field changes while a Google date edit preserves the existing Na'aseh time-of-day and time zone.
3. **Given** a linked open task, **When** it is completed in Google, **Then** Na'aseh completes and archives it once, records Google as the completion source, and does not double-count replayed synchronization.
4. **Given** a linked task completed through Google, **When** it is reopened in Google, **Then** Na'aseh restores it and reverses only the currently counted completion in accordance with existing lifecycle rules.
5. **Given** a linked task is deleted in Google, **When** synchronization observes the deletion, **Then** Na'aseh archives it without permanent deletion, records the remote deletion state, and tells the user what occurred.

---

### User Story 3 - Resolve Concurrent Changes Safely (Priority: P1)

When Na'aseh and Google both change a linked task before synchronization, the system merges
independent field changes and prevents one side from silently overwriting conflicting edits. The
user can review and resolve same-field conflicts.

**Why this priority**: Bidirectional state changes are unsafe without explicit, deterministic
conflict handling and replay protection.

**Independent Test**: Disconnect a client, make independent and conflicting edits on both sides,
reconnect, and verify independent fields merge while same-field divergence produces one visible,
resolvable conflict.

**Acceptance Scenarios**:

1. **Given** Google changes the title and Na'aseh changes the due date since the last common state, **When** synchronization runs, **Then** both changes are retained and converge on both sides.
2. **Given** both sides change the title differently since the last common state, **When** synchronization runs, **Then** neither value is silently discarded, a conflict is displayed, and outbound synchronization for that field pauses until the user chooses a value.
3. **Given** the user resolves a conflict, **When** the resolution synchronizes, **Then** both systems converge to the chosen value and retries do not recreate the conflict.
4. **Given** duplicate deliveries, timeouts, or an unknown remote outcome, **When** synchronization retries, **Then** it reuses durable identities and operation records so no duplicate Na'aseh or Google task is created.

---

### User Story 4 - Control Privacy, Scope, and Disconnection (Priority: P2)

The user controls which tasks may leave Na'aseh, what text is shared, the target Google list, and
what happens when synchronization is paused or disconnected. Collaborators cannot connect or
publish another owner's work through the owner's Google account.

**Why this priority**: Google becomes a separate data processor and authorization boundary, so
sharing must be deliberate, reversible, and owner-scoped.

**Independent Test**: Exercise eligibility, private-task consent, pause, list change, token
revocation, and disconnect flows and verify protected content and other users' work never cross the
boundary.

**Acceptance Scenarios**:

1. **Given** default settings, **When** synchronization evaluates tasks, **Then** it includes only tasks owned by the connected user that have a due date, are not permanently deleted, and meet the selected privacy rule.
2. **Given** a private task, **When** the owner explicitly enables Google sharing for that task after seeing a disclosure warning, **Then** only the selected supported fields are sent and hidden memo plaintext is never sent.
3. **Given** synchronization is paused, **When** either side changes, **Then** changes remain pending and visible but no external read or write occurs until the user resumes.
4. **Given** Google permission expires or is revoked, **When** synchronization next runs, **Then** it stops safely, preserves pending work, avoids repeated failing calls, and prompts the user to reconnect.
5. **Given** the user disconnects Google, **When** the user chooses whether to retain or remove Na'aseh-created Google Tasks, **Then** credentials and active mappings are revoked or retired, local Na'aseh tasks remain intact, and the selected remote cleanup behavior is applied with a preview and confirmation.

---

### User Story 5 - Monitor and Recover Synchronization (Priority: P2)

The user can see when synchronization last succeeded, whether work is pending, which items failed,
and how to retry. Operators can diagnose systemic failures without access to task titles, notes,
Google credentials, or other protected content.

**Why this priority**: Background integration failures must be visible and recoverable to preserve
trust in both task stores.

**Independent Test**: Simulate throttling, expired credentials, malformed remote records, partial
page failure, and service unavailability; verify bounded retries, visible status, safe diagnostics,
and successful continuation from the durable checkpoint.

**Acceptance Scenarios**:

1. **Given** healthy synchronization, **When** the user opens integration settings, **Then** the user sees connection state, selected list, last successful sync, pending count, unresolved conflicts, and next or current synchronization state.
2. **Given** a transient Google failure, **When** synchronization runs, **Then** it retries with bounded backoff, retains the last safe checkpoint, and eventually continues without reprocessing committed changes incorrectly.
3. **Given** a non-retryable record failure, **When** synchronization continues, **Then** the failed item is quarantined with an actionable user-safe reason while unrelated tasks continue.
4. **Given** an operator investigates a failure, **When** reviewing operational events, **Then** correlation identifiers, operation types, outcomes, latency, retry counts, and provider status classes are available without protected task content or credentials.

### Edge Cases

- Google accepts due dates but discards time-of-day; Na'aseh preserves an existing local time when Google changes the date and uses the user's configured default time and current time zone for Google-originated dated tasks.
- A Google Task without a due date is outside the dated-task import scope and is reported in the integration summary without being imported.
- Moving a linked Google Task out of the selected task list retires the mapping and archives the Na'aseh task only when the move is observable as a deletion; it never permanently deletes local work.
- Switching the selected Google list requires a preview and explicit migration choice; mappings are never silently pointed at unrelated tasks in another list.
- A task may become ineligible after being published because its date is removed or privacy changes. The user-selected cleanup policy is applied and the local task remains authoritative and intact.
- Remote completion and local completion arriving concurrently produce one completion transition and one counted completion event.
- Google returns paginated, duplicated, reordered, delayed, deleted, or hidden records; synchronization processes every page from a durable overlap window and remains idempotent.
- Provider throttling, quota exhaustion, malformed responses, expired credentials, and partial outages do not advance the safe checkpoint past unprocessed work.
- If an outbound request succeeds but its response is lost, reconciliation finds the existing remote identity before attempting creation again.
- Na'aseh remains fully usable offline. Integration settings and last-known status are readable; local edits queue normally; external synchronization is clearly shown as waiting for connectivity.
- Chrome and Safari/WebKit, including iPhone and iPad viewports, use a top-level browser redirect for Google authorization and do not depend on background browser execution for reliable synchronization.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to connect exactly one Google account to their own Na'aseh account through explicit consent and select or create one dedicated Google task list.
- **FR-002**: The system MUST request only the permission needed to read and write Google Tasks and MUST verify authorization requests and callbacks against login, expiration, replay, and request-forgery attacks.
- **FR-003**: Users MUST be able to view connection identity, list selection, privacy settings, default import time, current state, last success, pending work, failures, and conflicts; pause, resume, reconnect, change list, and disconnect MUST be supported.
- **FR-004**: Only owner-authored Na'aseh tasks with due dates and an eligible lifecycle/privacy state MUST be synchronized; assigned, shared, or collaborator-owned tasks MUST NOT be published through another user's connection.
- **FR-005**: The default privacy rule MUST exclude private tasks. An owner MAY explicitly approve an individual private task after a disclosure warning; hidden memo plaintext MUST never be sent to Google.
- **FR-006**: For eligible tasks, the system MUST synchronize title, due date, and open/completed state in both directions and MUST record source attribution for imported lifecycle transitions.
- **FR-007**: Na'aseh task notes and memos MUST remain local in the initial release; provider-bound content MUST be limited to the title, date, completion state, and a non-secret stable linkage marker that reveals no task content.
- **FR-008**: The system MUST preserve Na'aseh due time and time zone because Google exposes only a date. A Google date change MUST retain the existing local time; a Google-originated task MUST receive the user's configurable default local time and current time zone.
- **FR-009**: Initial synchronization MUST discover eligible records on both sides, create durable one-to-one mappings, avoid heuristic title/date matching, and present a preview before importing or publishing existing tasks.
- **FR-010**: Every linked task MUST retain provider identity, list identity, last common supported-field snapshot, provider revision marker, synchronization state, and timestamps sufficient for deterministic replay and reconciliation.
- **FR-011**: Independent field changes since the last common snapshot MUST merge. Divergent changes to the same supported field MUST create a visible conflict and pause writes for that field until the user chooses local, Google, or an edited value.
- **FR-012**: Task creation, updates, completion, reopening, date removal, local archival, remote deletion, and eligibility changes MUST have explicit, idempotent cross-system transition rules that never permanently delete Na'aseh work automatically.
- **FR-013**: Google-originated tasks without due dates MUST NOT be imported by the dated-task integration; they MUST be counted in a user-visible skipped-items summary.
- **FR-014**: Synchronization MUST process pagination, completed and hidden records, deletions, rate limits, duplicate deliveries, delayed visibility, unknown outcomes, and retries without duplicates or silent loss.
- **FR-015**: Synchronization MUST use a durable overlap window and per-item operation records so a checkpoint advances only after all work within its boundary is committed or explicitly quarantined.
- **FR-016**: Users MUST be able to retry quarantined records, resolve conflicts, and see actionable remediation for revoked access, list removal, provider outage, quota exhaustion, and invalid data.
- **FR-017**: Pausing MUST stop external reads and writes without discarding mappings or pending work. Disconnecting MUST revoke or retire credentials, preserve all local tasks, and offer a previewed choice to retain or remove Na'aseh-created remote tasks.
- **FR-018**: Changing the selected Google task list MUST require a preview and explicit choice to migrate managed remote tasks, start fresh while retaining old remote tasks, or cancel.
- **FR-019**: Server-side scheduled synchronization and an authenticated user-triggered sync MUST share the same concurrency control, idempotency, authorization, and reconciliation behavior.
- **FR-020**: Synchronization status changes and remote effects MUST propagate through the existing authorized browser synchronization model and remain consistent across the user's devices.
- **FR-021**: The system MUST provide an administrator-safe operational view of connection counts and aggregate outcomes without permitting administrators to read credentials, remote account identifiers beyond approved support metadata, task titles, dates, or conflict values.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: Google access belongs only to the connecting user. Authorization and list ownership are revalidated server-side for every user-triggered operation. Refresh credentials and client secrets are encrypted at rest, never stored in browser persistence, never returned after exchange, never logged, and accessible only to the narrow synchronization runtime. Provider responses, errors, linkage markers, and telemetry are treated as untrusted input. Disconnect and revocation behavior is tested. Private-task publication requires explicit per-task consent; hidden memo plaintext is prohibited at the boundary.
- **NFR-002 Data Durability & Recovery**: Local tasks remain the durable system of record for Na'aseh-only fields. Mapping, snapshot, operation, conflict, and checkpoint changes are committed atomically where required for replay safety. Backups include encrypted connection metadata and mappings but exclude usable plaintext credentials from exports. Restore procedures prevent stale restored credentials or checkpoints from replaying destructive remote operations without revalidation. No automatic remote action permanently deletes local work.
- **NFR-003 Offline Support**: Existing task creation and editing remain available offline and queue through the normal encrypted outbox. Last-known integration status and conflicts are readable offline. Google reads/writes require server connectivity and are shown as pending; reconnecting triggers safe reconciliation without bypassing existing local conflict semantics.
- **NFR-004 Browser & Responsive Support**: Connection, preview, status, conflict resolution, and disconnection work in current stable Chrome and Safari/WebKit at desktop, iPhone, and iPad sizes with keyboard, touch, accessible focus, status announcements, and reduced-motion compatibility. Authorization uses a full-page redirect compatible with browser privacy restrictions and does not require pop-ups or reliable browser background execution.
- **NFR-005 Errors & Observability**: Users receive safe, actionable errors and per-item recovery status. Structured Amazon CloudWatch events include safe connection/task mapping identifiers, correlation IDs, operation class, outcome, latency, attempt count, provider response class, and checkpoint age while excluding credentials, authorization codes, access tokens, Google account addresses unless explicitly approved support metadata, titles, notes, dates, snapshots, and conflict values. Metrics and alarms cover authorization failures, revoked credentials, throttling, sync lag, checkpoint stalls, conflict growth, quarantine growth, duplicate prevention, and remote failure rates with documented retention.
- **NFR-006 Performance**: A user-triggered synchronization begins showing progress within 2 seconds on a typical broadband connection. For accounts with 5,000 linked tasks and no provider throttling, 95% of incremental runs with 100 or fewer remote changes converge within 60 seconds, while the UI remains responsive on representative iPhone and iPad profiles. Initial synchronization is paginated and reports progress rather than blocking the browser.
- **NFR-007 AWS Architecture & Cost Impact**: The design MUST evaluate existing serverless AWS compute, scheduling, queueing, database, key-management, secrets, logging, metrics, and alarm capabilities before adding services. It MUST avoid always-on compute, bound provider concurrency and retries, document cost drivers at 10 users/100,000 total tasks, and provide a cheaper reduced-frequency alternative without weakening security or durability.

### Key Entities

- **Google Connection**: The owner-scoped consent relationship, connected account support identity, selected task list, encrypted credential reference, sync/privacy/default-time settings, lifecycle state, and last synchronization summary.
- **Task Link**: The durable one-to-one relationship between a Na'aseh task and a Google Task, including both identities, list identity, origin, last common snapshot, revision markers, and current synchronization state.
- **Synchronization Operation**: An idempotent intended or observed cross-system change with direction, type, attempt state, safe failure classification, and replay identity.
- **Synchronization Checkpoint**: The last fully processed remote boundary plus overlap and pagination state needed to resume safely.
- **Synchronization Conflict**: A field-level record of divergent local and Google changes, protected candidate values, lifecycle, and user resolution.
- **Synchronization Run**: A user-triggered or scheduled reconciliation attempt with safe aggregate counts, timing, checkpoint relationship, and outcome.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can connect Google, review the initial-sync preview, and start synchronization in under 3 minutes, excluding time spent on Google's consent screen.
- **SC-002**: In acceptance fixtures covering creation, edit, completion, reopening, deletion, date removal, privacy change, retries, and lost responses, 100% of supported changes converge without duplicate tasks or silent overwrites.
- **SC-003**: In concurrent-edit fixtures, 100% of independent field changes merge automatically and 100% of divergent same-field changes remain available until explicitly resolved.
- **SC-004**: A healthy incremental run containing 100 or fewer changes completes within 60 seconds at the 95th percentile, and user-triggered progress appears within 2 seconds.
- **SC-005**: After browser offline edits and reconnection, all eligible pending changes either synchronize, appear as explicit conflicts, or show an actionable failure; none disappear silently.
- **SC-006**: Security tests demonstrate that no collaborator-owned task, unapproved private title, hidden memo, credential, authorization code, or protected conflict value crosses an unauthorized boundary or appears in logs.
- **SC-007**: Current Chrome and Safari/WebKit automation passes the connection-return, status, preview, conflict-resolution, pause, and disconnect journeys at desktop and representative iPhone/iPad viewports.
- **SC-008**: A synchronization interrupted after any remote page or item can resume from durable state and produces the same final mappings, tasks, and completion counts as an uninterrupted run in 100% of recovery fixtures.
- **SC-009**: Operational exercises detect and surface revoked access, provider throttling, checkpoint stalls, and quarantine growth within 10 minutes without exposing protected content.

## Assumptions

- "Google Calendar as tasks" means Google Tasks displayed in Google Calendar, not calendar events.
- Full bidirectional synchronization covers fields mutually supported by Na'aseh and Google Tasks. Google cannot represent a task due time, so Na'aseh remains authoritative for time-of-day and time zone.
- Each Na'aseh user connects at most one Google account and synchronizes one dedicated Google task list in this release.
- Only dated tasks are in scope. Google Tasks without a due date, recurrence, assigned tasks originating in other Google products, and arbitrary calendar events are out of scope.
- Na'aseh memos, hidden memos, attachments, category/project/group assignments, collaborators, revisions, and links remain local and are not written into Google Task notes.
- Newly imported Google Tasks belong to the connected Na'aseh user, are unassigned and non-private by default, and use the user's configured default local due time.
- Scheduled polling plus user-triggered synchronization is acceptable; Google Tasks does not provide a required real-time push contract for this scope.
- Existing Na'aseh login, offline encrypted storage, task lifecycle, revisions, completion reporting, backup, and authorized sync mechanisms are reused.
- Production activation depends on a configured Google Cloud project, enabled Tasks API, approved OAuth consent configuration, secure client credentials, and authorized redirect URIs.
