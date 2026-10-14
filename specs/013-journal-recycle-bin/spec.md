# Feature Specification: Journal Recycle Bin

**Feature Branch**: `[013-journal-recycle-bin]`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "Add a recycling-bin type feature for notes like the recoverable archive available for tasks."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recover a removed journal note (Priority: P1)

As a journal owner, I can move an entry out of my active journal without immediately destroying it, inspect it in a recycle bin, and restore it with its original date and content.

**Why this priority**: Accidental removal must not require infrastructure backup recovery or cause silent loss of sensitive journal history.

**Independent Test**: Create an entry, move it to the recycle bin, confirm it disappears from active journal views, restore it, and verify that every field and its original date return unchanged.

**Acceptance Scenarios**:

1. **Given** an unlocked active journal entry, **When** its owner chooses Move to recycle bin and confirms, **Then** the entry leaves active journal views and appears in the owner's recycle bin.
2. **Given** an entry in the recycle bin, **When** its owner restores it, **Then** the entry returns to its original journal date with all content and structured values intact.
3. **Given** a locked journal, **When** the owner visits Journal, **Then** entry titles, dates, answers, and recycle-bin contents remain unavailable until the journal is unlocked.

---

### User Story 2 - Review and manage recycled notes (Priority: P2)

As a journal owner, I can see which entries are in the recycle bin, when they were removed, and either restore or permanently delete a selected entry without affecting other notes.

**Why this priority**: A recycle bin is useful only when its contents and consequences are understandable and individually controllable.

**Independent Test**: Recycle several entries, verify their ordering and removal dates, permanently delete one through the deliberate confirmation flow, and confirm the others remain recoverable.

**Acceptance Scenarios**:

1. **Given** multiple recycled entries, **When** the owner opens the recycle bin, **Then** entries are listed newest-removal first with their journal date and removal time.
2. **Given** a recycled entry, **When** the owner begins permanent deletion, **Then** the application explains that the action cannot be undone and requires explicit confirmation tied to that entry.
3. **Given** confirmed permanent deletion, **When** processing completes, **Then** the entry can no longer be read or restored through the application and other journal entries are unchanged.
4. **Given** an active entry, **When** the owner attempts permanent deletion, **Then** the application requires moving it to the recycle bin first.

---

### User Story 3 - Preserve recovery across offline use and failures (Priority: P3)

As a journal owner, I can recycle or restore an entry while offline, see that the change is pending, and trust it to synchronize safely when connectivity returns.

**Why this priority**: Journal lifecycle changes must follow the product's offline-first durability promise and cannot silently diverge between devices.

**Independent Test**: Recycle and restore entries offline, reconnect, exercise retry and version-conflict paths, and verify that content remains available locally until the server acknowledges the intended state.

**Acceptance Scenarios**:

1. **Given** an unlocked journal without connectivity, **When** the owner recycles or restores an entry, **Then** the new state is saved locally and shown as pending.
2. **Given** a pending lifecycle change, **When** connectivity returns, **Then** synchronization applies it once or presents an actionable conflict without discarding either the entry content or the owner's intent.
3. **Given** a permanent-delete request without connectivity, **When** the owner tries to submit it, **Then** the application keeps the recycled entry intact and explains that permanent deletion requires an online authoritative check.

### Edge Cases

- A recycled entry still reserves its journal date. Creating another entry for that date is blocked with a direct option to open or restore the recycled entry.
- Recycle and restore actions are idempotent: retries do not create duplicate entries or duplicate history.
- If another device changes an entry before a pending recycle or restore reaches the service, the owner sees a conflict and neither version is silently discarded.
- If synchronization fails partway through, the last acknowledged state remains readable and the pending operation remains visible and retryable.
- A permanently deleted entry cannot be resurrected by a stale offline client or a later infrastructure restore.
- Recycled entries do not contribute to active journal browsing, streaks, summaries, dashboard values, or crisis-plan prerequisites that depend on active journal history.
- Crisis Plans, Journal profiles, key envelopes, recovery material, and shared-plan relationships are outside the recycle bin and cannot be removed through it.
- Chrome and Safari/WebKit, including supported iPhone and iPad layouts, expose the same lifecycle choices without relying on hover or precision pointing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow only the owner of an unlocked journal to move an active journal entry to the recycle bin.
- **FR-002**: Moving an entry to the recycle bin MUST preserve its original identifier, journal date, encrypted content, structured responses, version history needed for conflict handling, and removal timestamp.
- **FR-003**: Active journal views, summaries, dashboards, streaks, and date browsing MUST exclude recycled entries.
- **FR-004**: The Journal MUST provide an owner-only recycle-bin view ordered by removal time, newest first.
- **FR-005**: The recycle-bin view MUST show the entry's journal date, removal time, synchronization state, and Restore and Delete permanently actions without exposing content while the journal is locked.
- **FR-006**: Restoring a recycled entry MUST return it to its original journal date with all content and structured values unchanged.
- **FR-007**: A recycled entry MUST continue to reserve its journal date; the system MUST prevent a second entry for that date and guide the owner to the recycled entry.
- **FR-008**: Recycle and restore operations MUST be versioned, idempotent, retryable, and represented in synchronization history without protected journal content.
- **FR-009**: Recycle and restore operations MUST work offline through durable local pending changes and synchronize automatically when connectivity returns.
- **FR-010**: Version conflicts during recycle or restore MUST preserve the local entry and provide an actionable resolution path; last-write-wins replacement is prohibited.
- **FR-011**: Permanent deletion MUST be available only for an entry already in the recycle bin, require an online authoritative preview, and require an explicit entry-specific confirmation that states the action cannot be undone.
- **FR-012**: Completed permanent deletion MUST remove the entry and its recoverable application history, prevent stale-client or backup resurrection, and retain only content-free operational evidence needed for audit and restore safety.
- **FR-013**: A failed or interrupted permanent deletion MUST remain retryable from a durable checkpoint and MUST NOT report success while recoverable entry content remains in active application storage.
- **FR-014**: Recycle-bin operations MUST NOT apply to Journal profiles, Crisis Plans, shares, grants, key envelopes, recovery material, or other non-entry records.
- **FR-015**: Existing journal entries MUST remain active after deployment; no migration may recycle or delete an entry solely because it predates this feature.
- **FR-016**: User-facing Journal documentation MUST explain the difference between moving an entry to the recycle bin and deleting it permanently.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: Journal entries and user-visible lifecycle metadata remain owner-only and end-to-end encrypted under the existing Journal boundary. The service MAY retain only the coarse `active`, `recycled`, or `deleting` control state required to authorize lifecycle transitions and reject stale writes; that control state remains owner-scoped, encrypted at rest and in transit, and excluded from logs and analytics. Ordinary task/list APIs, administrators, collaborators, logs, analytics, URLs, notifications, and service-worker caches MUST NOT receive journal plaintext. Crisis Plan access does not grant recycle-bin access.
- **NFR-002 Data Durability & Recovery**: Every lifecycle mutation MUST preserve content until acknowledged, validate state and version transitions, survive retry, and participate in protected backup and restore validation. Permanent-deletion evidence MUST prevent resurrection without retaining deleted journal content.
- **NFR-003 Offline Support**: Owners MAY recycle and restore unlocked entries offline. The application MUST persist those actions locally, show pending/conflict/failure state, and retry safely. Permanent deletion is online-only.
- **NFR-004 Browser & Responsive Support**: The primary recycle, browse, restore, and confirmation journeys MUST work in current stable Chrome and Safari/WebKit at desktop, supported iPhone, and supported iPad sizes with touch, keyboard, and assistive technology.
- **NFR-005 Errors & Observability**: Failures MUST produce actionable owner feedback and structured operational telemetry containing safe correlation identifiers, lifecycle stage, duration, and outcome, but no journal plaintext, dates linked to plaintext, keys, ciphertext, credentials, or session material. Repeated or stuck deletion failures MUST alarm.
- **NFR-006 Performance**: With up to 1,000 recycled entries, the first recycle-bin page MUST become usable within two seconds on a typical broadband connection and within five seconds on a degraded mobile connection; recycle and restore actions MUST provide visible local feedback within 200 milliseconds.
- **NFR-007 AWS Architecture & Cost Impact**: The feature MUST reuse the existing request-driven, serverless journal synchronization, protected data, backup, deletion-ledger, workflow, and observability foundations where they satisfy the requirements. It MUST add no always-on compute and SHOULD keep ordinary incremental monthly cost negligible at current single-user scale.

### Key Entities

- **Journal Entry**: An owner's encrypted date-bound note, extended with an active or recycled lifecycle and removal metadata while remaining subject to one-entry-per-date identity.
- **Journal Lifecycle Mutation**: An idempotent owner request to recycle or restore an entry, including expected version and safe synchronization outcome metadata.
- **Journal Recycle-Bin Item**: The owner-visible representation of a recycled entry, including journal date, removal time, and synchronization state while content remains protected.
- **Permanent Deletion Job**: The authoritative, checkpointed process that removes one recycled journal entry and records content-free completion evidence.
- **Deletion Ledger Entry**: Content-free evidence that prevents a permanently deleted journal entry from reappearing through stale synchronization or infrastructure restore.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In supported browsers and device sizes, an owner can recycle and restore a journal entry in no more than three interactions per action, excluding journal unlock.
- **SC-002**: Automated lifecycle and failure-path tests demonstrate zero lost entry bodies across offline recycle, offline restore, reconnect, retry, and version-conflict scenarios.
- **SC-003**: Permanently deleted journal entries are unavailable through active views, recycle-bin views, synchronization, stale clients, and validated restore exercises in 100% of tested cases.
- **SC-004**: With 1,000 recycled entries, 95% of recycle-bin page loads meet the stated two-second broadband and five-second degraded-mobile targets.
- **SC-005**: Chrome and Safari/WebKit desktop, iPhone, and iPad test journeys all pass for recycle, browse, restore, conflict visibility, and permanent-delete confirmation.
- **SC-006**: Required pull-request validation remains at or below ten minutes, with exhaustive browser/device combinations retained in non-required release gates.
- **SC-007**: Operational review finds no journal plaintext, encryption keys, ciphertext, credentials, or session material in lifecycle logs, metrics, alarms, URLs, or notification payloads.

## Assumptions

- "Notes" refers to private Journal entries, not task memos, list-item memos, Crisis Plans, or external note applications.
- Recycled entries are retained indefinitely until the owner restores or permanently deletes them; automatic expiry is outside this feature.
- The existing Journal unlock and recovery model remains unchanged, and lifecycle actions require the same owner authorization as entry edits.
- Existing one-entry-per-date identity remains authoritative across active and recycled entries.
- The feature extends the existing web application and shared synchronization contract; native Apple parity may follow the native-app backlog unless required before that release ships.
