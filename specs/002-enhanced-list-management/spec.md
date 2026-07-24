# Feature Specification: Enhanced List Management

**Feature Branch**: `not created`

**Created**: 2026-07-23

**Status**: Ready for planning

**Input**: User description: "Add completion sound and crossing-out animation; create reusable multi-item lists with costs, sharing, group and locked visibility; provide a globally editable item directory with per-list overrides and reset; include lists in search; export all to-do fields to CSV from a command-line workflow; and allow encrypted file attachments stored in Amazon S3."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and Complete Multi-item Lists (Priority: P1)

An authenticated user creates a named list containing any number of lightweight items, such as shopping entries or related steps, without turning each item into a separate to-do task. The user can add, reorder, cross out, restore, and remove items.

**Why this priority**: Multi-item lists are the core capability on which costs, reuse, sharing, copying, and search depend.

**Independent Test**: Create a shopping list, add and reorder several items, cross out and restore one, then verify the list and item states remain durable online and offline.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** the user creates a named list and adds multiple items, **Then** one list containing those items is saved without creating separate to-do tasks.
2. **Given** an open list item, **When** the user crosses it out, **Then** a crossing-out animation communicates completion and the item remains visible in its completed state.
3. **Given** a crossed-out item, **When** the user restores it, **Then** it returns to its open state and the change is saved.
4. **Given** reduced-motion is enabled, **When** an item is crossed out or restored, **Then** an equivalent immediate, non-motion state change is shown.

---

### User Story 2 - Reuse Directory Items and Track List Value (Priority: P1)

A user selects entries from a shared global directory while building a list. Directory entries provide reusable names and optional values. A list item may override its linked global name or value and can later be reset to the current global values. The list shows the signed total of its item values.

**Why this priority**: Reuse and totals make lists practical for shopping, budgeting, and inventory while reducing repetitive entry.

**Independent Test**: Create a directory entry with a value, add it to a list, override its name and value, reset it, and verify the total after each change.

**Acceptance Scenarios**:

1. **Given** a global item, **When** a user adds it to a list, **Then** the new list item is linked to it and initially uses its current name and value.
2. **Given** a linked list item, **When** the user changes its name or value, **Then** the override affects only that list item.
3. **Given** an overridden item, **When** the user activates the reset-to-global icon, **Then** its name and value use the directory entry's current values and both overrides are removed.
4. **Given** valued and unvalued items, **When** the list is viewed, **Then** its bottom displays the signed sum and treats unvalued items as zero.
5. **Given** value entry, **When** the default cost mode is used, **Then** the amount reduces the total; **when** positive mode is explicitly selected, **Then** it increases the total.
6. **Given** any list item, **When** a user adds it to the directory, **Then** a global entry is created from its current name and optional value without changing the list item.

---

### User Story 3 - Control Visibility and Copy Lists (Priority: P1)

Users can keep a list personal, share it with a group, or make it visible to all active users. A user can copy an accessible list with its name and items. Administrators can see all application content for oversight.

**Why this priority**: The default visibility is broad, so privacy and group boundaries must be correct before lists are safe to use.

**Independent Test**: Exercise global, group, and locked lists with owners, members, non-members, and an administrator; copy an accessible list and verify its contents and independence.

**Acceptance Scenarios**:

1. **Given** a list with no group and not locked, **When** any active user browses or searches, **Then** that user can discover and view it.
2. **Given** a group list, **When** access is attempted, **Then** only current group members, its owner, and administrators can discover or view it.
3. **Given** a locked list, **When** access is attempted, **Then** only its owner and administrators can discover or view it, regardless of group membership.
4. **Given** an accessible list, **When** a user copies it, **Then** a new owner-controlled list is created with the same name, item order, item values, links, overrides, attachments, and completion states, and later edits remain independent.
5. **Given** any task, list, item, or attachment, including locked content, **When** an administrator uses an authorized workflow, **Then** the administrator can discover and view it and the access is auditable.

---

### User Story 4 - Attach Files Securely (Priority: P1)

A user attaches files to to-do items or lightweight list items so supporting material remains with the work. Attachments follow the visibility and ownership rules of their parent and are encrypted in Amazon S3.

**Why this priority**: Supporting documents can contain sensitive content, so storage, authorization, and recovery boundaries are essential.

**Independent Test**: Upload, view, download, and remove attachments on global, group, and locked parent items; test as an owner, allowed user, unauthorized user, and administrator online and after connectivity changes.

**Acceptance Scenarios**:

1. **Given** an editable to-do or list item, **When** the user attaches a supported file, **Then** upload progress is visible and the saved attachment appears with its name, size, type, and upload time.
2. **Given** an attachment, **When** an authorized user opens or downloads it, **Then** the original bytes and filename are delivered accurately.
3. **Given** a locked or group-restricted parent, **When** an unauthorized user attempts direct, search, cached, or guessed access to its attachment, **Then** access is denied without disclosing attachment metadata.
4. **Given** an attachment stored in Amazon S3, **When** storage is inspected, **Then** encryption at rest is enabled and access is not public.
5. **Given** a failed or interrupted upload, **When** the workflow ends, **Then** no incomplete attachment appears successful and the user can retry safely.
6. **Given** an offline user, **When** the user selects a file, **Then** the application clearly explains whether it is queued locally or must wait for connectivity and does not claim it has been uploaded.

---

### User Story 5 - Find Lists and To-do Items Together (Priority: P2)

A user searches authorized content and limits results to lists, to-do items, or both. Search never discloses inaccessible content.

**Why this priority**: Lists remain useful as their number grows only if users can retrieve them alongside existing work.

**Independent Test**: Seed matching lists, list items, and to-dos across every visibility level, then search with All, Lists, and To-do Lists online and offline.

**Acceptance Scenarios**:

1. **Given** a new search journey, **When** the controls appear, **Then** the type selector defaults to **All**.
2. **Given** **All**, **Lists**, or **To-do Lists**, **When** a query runs, **Then** results include respectively both types, only lists and matching list items, or only matching to-do items.
3. **Given** inaccessible content, **When** its text matches a query, **Then** it does not appear in results, counts, suggestions, or observable metadata.
4. **Given** authorized cached content, **When** searching offline, **Then** the same selector and authorization rules apply.

---

### User Story 6 - Receive Clear Completion Feedback (Priority: P2)

Completing a post-it note adds a brief scrunching sound to its crumpling interaction. Completing to-do and list items uses a crossing-out animation.

**Why this priority**: Coordinated feedback makes completion satisfying and removes uncertainty about whether an action succeeded.

**Independent Test**: Complete a post-it, regular to-do, and list item with standard, muted, and reduced-motion preferences and verify persistence.

**Acceptance Scenarios**:

1. **Given** completion audio is enabled, **When** a post-it is completed, **Then** a brief scrunching sound is synchronized with the visual completion feedback.
2. **Given** audio is muted, blocked, or unavailable, **When** completion occurs, **Then** it succeeds with visual and accessible feedback and no blocking error.
3. **Given** an open to-do or list item, **When** it is completed, **Then** a crossing-out animation ends in a persistent crossed-out state.
4. **Given** reduced-motion is enabled, **When** completion occurs, **Then** the final state and accessible announcement appear without motion.

---

### User Story 7 - Lock To-do Items (Priority: P2)

A to-do owner locks or unlocks an individual item using clear locked and unlocked icons. A locked item is private to its owner, with administrator oversight preserved.

**Why this priority**: Item-level privacy is needed when only one entry is sensitive.

**Independent Test**: Lock and unlock a to-do, verify icon labels, and test discovery as another user and an administrator.

**Acceptance Scenarios**:

1. **Given** an unlocked to-do owned by the current user, **When** the unlocked icon is activated, **Then** it becomes locked and shows a locked icon with accessible text.
2. **Given** a locked to-do, **When** a non-owner, non-admin browses or searches, **Then** it cannot be discovered, viewed, or inferred.
3. **Given** a locked to-do, **When** its owner activates the locked icon, **Then** it becomes unlocked and follows its otherwise applicable visibility.
4. **Given** a locked to-do, **When** an administrator views it, **Then** all content is available and the privileged access is recorded.

---

### User Story 8 - Export All To-do Data (Priority: P3)

An authorized administrator uses a command-line workflow to export every current to-do and subtask, including all persisted fields, to CSV.

**Why this priority**: Portable export supports data ownership and migration but does not block everyday list use.

**Independent Test**: Seed tasks and subtasks with every field, export them, and verify record counts, field coverage, escaping, encoding, attachment references, and unauthorized denial.

**Acceptance Scenarios**:

1. **Given** authorized administrative credentials, **When** export completes, **Then** one valid CSV contains one row per current to-do or subtask and every documented field.
2. **Given** commas, quotes, line breaks, Unicode, empty values, signed values, and multiple attachments, **When** read by a standards-compliant CSV reader, **Then** every value and row boundary is preserved.
3. **Given** an unauthorized or failed attempt, **When** the command exits, **Then** no partial file is presented as successful and the operator receives a non-sensitive error.

### Edge Cases

- A list is empty, has thousands of items, has duplicate names, or contains only completed items.
- A copied name conflicts with another list name; copies remain allowed and are distinguishable by identity and ownership.
- A directory item is edited or removed while a linked item is offline or has overrides.
- Two users edit the same global entry concurrently.
- A user loses group membership while content is cached or has pending changes.
- A list owner locks a group list while a member is viewing it.
- A value is zero, absent, very large, overly precise, or causes an out-of-range total.
- Completion audio is blocked or the action is undone before feedback finishes.
- Search matches both a list name and its items; the list appears once with clear match context.
- An attachment is empty, duplicated, renamed, unsupported, malicious, oversized, interrupted, or removed while being viewed.
- A parent is copied, locked, reassigned, or deleted while attachment work is pending.
- An attachment object exists without metadata, or metadata exists without an object.
- Export contains protected content, no records, many records, or fails during finalization.
- Browser storage is full or unavailable during offline work.
- Chrome and Safari/WebKit differ in audio, touch, animation, file selection, download, or offline storage behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to create, rename, view, edit, and delete a named list and add, reorder, edit, complete, restore, and remove multiple lightweight items without creating separate to-do tasks.
- **FR-002**: Completing a to-do or list item MUST use a crossing-out animation ending in a persistent crossed-out state; reduced-motion users MUST receive equivalent non-motion feedback.
- **FR-003**: Completing a post-it MUST play a brief synchronized scrunching sound when enabled and supported. Audio failure MUST NOT prevent completion, and users MUST be able to mute completion audio.
- **FR-004**: The system MUST provide a global directory of reusable items, each with a name and optional signed value, which every active user can view, add, and edit.
- **FR-005**: Users MUST be able to create a list item from a global item and add an existing list item to the directory.
- **FR-006**: A linked list item MUST retain its global identity and allow its name and value to be overridden locally without changing the global item.
- **FR-007**: An overridden linked item MUST show an accessible reset-to-global icon. Activating it MUST replace name and value with current global values and remove both overrides, with confirmation if unsaved input would be lost.
- **FR-008**: Global edits MUST flow to linked fields that are not overridden; overridden fields MUST remain unchanged until reset.
- **FR-009**: List and directory items MUST allow an optional value. Entry MUST default to a cost that reduces the total and offer an explicit positive mode.
- **FR-010**: A list MUST show at its bottom the signed total of all current item values, including completed items and treating missing values as zero.
- **FR-011**: Values MUST use one deployment currency with two-decimal precision; currency conversion is out of scope.
- **FR-012**: A new list MUST be visible to all active users unless assigned to a group or locked.
- **FR-013**: A group list MUST be discoverable and viewable only by its owner, current group members, and administrators.
- **FR-014**: A list owner MUST be able to lock or unlock it. Locked visibility MUST take precedence over group visibility and allow only the owner and administrators.
- **FR-015**: A to-do owner MUST be able to lock or unlock an individual to-do. A locked to-do MUST be discoverable and viewable only by its owner and administrators.
- **FR-016**: Lock controls MUST use distinct locked and unlocked icons with visible or assistive text communicating current state and action.
- **FR-017**: Administrators MUST be able to discover and view all task, subtask, list, list-item, and attachment content regardless of owner, group, or lock. Viewing MUST not implicitly grant edit or ownership rights.
- **FR-018**: FR-017 intentionally supersedes the baseline administrator restriction for ordinary content; existing unlock/decryption requirements for separately encrypted hidden memo plaintext remain unchanged.
- **FR-019**: Users MUST be able to copy any viewable list. The independent copy MUST have a new identity, copying user as owner, the same name, order, item fields, links, overrides, attachments, and completion states, and default to unlocked global visibility.
- **FR-020**: Search MUST match authorized list and list-item names alongside existing to-do fields and MUST not reveal inaccessible content through results, counts, snippets, suggestions, or caches.
- **FR-021**: Search MUST provide **All**, **Lists**, and **To-do Lists**, default to **All**, preserve the selection during the journey, and apply it online and offline.
- **FR-022**: Authorized users MUST be able to attach one or more files to a to-do or list item they may edit, view attachment metadata, open or download the file, and remove it.
- **FR-023**: Every attachment MUST inherit its parent item's authorization, lock, group, ownership, retention, copy, backup, and deletion boundaries. Moving or copying an attachment independently of a parent is out of scope.
- **FR-024**: Attachment files MUST be stored privately in Amazon S3 with encryption at rest enabled. Direct public access MUST be prohibited, and every upload and retrieval MUST require current application authorization.
- **FR-025**: Attachment metadata MUST include a stable identity, parent identity and type, original filename, media type, byte size, uploader, upload time, lifecycle state, integrity value, and storage reference.
- **FR-026**: File type and size limits MUST be configurable and clearly shown before selection. Unsupported, oversized, corrupted, or unsafe files MUST be rejected with an actionable message and without a successful attachment record.
- **FR-027**: Upload progress and outcome MUST be visible. Upload, retry, and removal MUST be idempotent, and incomplete or orphaned files MUST be detected and safely reconciled.
- **FR-028**: Offline list, item, directory, value, completion, ordering, visibility, and lock changes MUST survive restart and synchronize without silent loss. Attachment uploads selected offline MUST be explicitly queued or deferred, never falsely shown as uploaded.
- **FR-029**: Concurrent shared changes MUST preserve non-conflicting work and expose deterministic or user-resolvable same-field conflicts.
- **FR-030**: Access revocation MUST remove unauthorized parent and attachment metadata/content from caches, search indexes, pending results, and reusable access links at the next authorization refresh, without uploading unauthorized pending changes.
- **FR-031**: List, item, directory, value, completion, lock, copy, attachment, and administrator-view events MUST retain actor, time, target, action, and outcome history without placing protected content in operational logs.
- **FR-032**: An administrator-authorized command-line workflow MUST export every current to-do and subtask with identifiers, parent relationship, label, link, memo, timestamps, due details, assignee, category, status, owner, group, lock/privacy, hidden-memo state, synchronization metadata, and attachment metadata/references.
- **FR-033**: CSV export MUST have documented column order and encoding, escape values correctly, represent missing and repeated attachment values consistently, distinguish subtasks, and never leave a successful-looking partial file.
- **FR-034**: CSV MUST NOT embed attachment file bytes or expose direct reusable S3 access credentials or URLs.
- **FR-035**: Only an authorized administrator or operator may run the all-content export. Attempts MUST be audited and output treated as sensitive.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: Authorization MUST cover live, cached, synchronized, searched, copied, attached, and exported representations. Ordinary users see unlocked global lists, their content, and current-group lists; owners control locks; administrators can view all ordinary content but gain no implicit edit rights. The directory is intentionally writable by all active users. Administrative reads and exports require explicit privilege and audit.
- **NFR-002 Data Durability & Recovery**: Mutations and attachments MUST be validated, durably persisted, versioned where applicable, and included in backup and recovery. Copy, reset, total, lock, upload, removal, and export MUST be atomic from the user's perspective or clearly report failure while preserving retriable work. Attachment objects and metadata MUST be reconciled so neither silent loss nor indefinite orphan retention occurs.
- **NFR-003 Offline Support**: Previously synchronized authorized text data MUST remain usable offline. Pending mutations MUST survive restart, show status, retry, and expose conflicts. Attachment availability offline MUST be clearly indicated; files not already retained locally require connectivity. Revoked content MUST be purged after authorization refresh.
- **NFR-004 Browser & Responsive Support**: Primary journeys MUST work in current stable Chrome and Safari/WebKit at desktop, iPhone, and iPad sizes. Keyboard, touch, screen reader, muted-device, reduced-motion, file-selection, progress, and download constraints MUST be accommodated without horizontal page scrolling.
- **NFR-005 Errors & Observability**: Users and operators MUST receive actionable errors for failed saves, resets, copies, sync, playback, search, authorization, attachment transfers, safety checks, and exports. Structured Amazon CloudWatch events MUST include safe correlation, outcome, timing, and error context while excluding names, memos, file contents, exported values, credentials, and protected data. Metrics and alarms MUST cover repeated authorization, sync, attachment, and export failures.
- **NFR-006 Performance**: With up to 50,000 combined text records on a supported mid-range device, 95% of local searches MUST show results within one second. Completion, lock, reset, and total feedback MUST appear within 200 milliseconds. A 1,000-item list MUST keep 95th-percentile input delay below 200 milliseconds, excluding network confirmation. Attachment progress MUST update at least every two seconds during active transfer.
- **NFR-007 AWS Architecture & Cost Impact**: Planning MUST evaluate managed serverless AWS options first, use private encrypted Amazon S3 attachment storage, and extend existing shared data, backup, synchronization, authorization, and observability where suitable. Cost estimates MUST cover item data, revisions, transfers, S3 storage and requests, malware/safety inspection, backups, logs, and exports. Needless always-on capacity or a separate search service requires measured justification.

### Key Entities

- **List**: A named, owner-controlled collection with ordered items, optional group, visibility/lock state, timestamps, and synchronization metadata.
- **List Item**: A lightweight ordered entry with a name, completion, optional signed value, optional global link, overrides, attachments, timestamps, and sync metadata; it is not a to-do.
- **Global Directory Item**: A globally visible and editable reusable name and optional signed value with revision and lifecycle state.
- **To-do Item**: The existing task or subtask, extended with lock state, completion feedback, and attachments.
- **Attachment**: Encrypted file content in private Amazon S3 plus metadata linking it to exactly one parent to-do or list item and governing its integrity, lifecycle, and authorization.
- **Value**: An optional signed amount in the deployment currency; costs are negative, explicit positive amounts are positive, and absence differs from zero.
- **Directory Override**: Per-field state preventing a linked name or value from following global edits until reset.
- **Content Access Event**: Auditable safe references for sensitive administrator views, file access, exports, and permission outcomes.
- **CSV Export**: A sensitive point-in-time representation of current to-dos and subtasks with attachment metadata/references but no file bytes or reusable storage credentials.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 90% of first-time participants create a named three-item list and cross out one item in under 90 seconds without help.
- **SC-002**: In 100% of authorization tests, global, group, locked, owner, administrator, and attachment rules produce expected results without leakage through browse, direct access, search, copy, cache, file access, or export.
- **SC-003**: Users add a global item, override it, reset it, and verify the total in under one minute, with correct results in 100% of signed-value tests.
- **SC-004**: Copying a list of up to 1,000 items and their attachments produces a complete independent copy within 10 seconds for at least 95% of accepted copy requests, with zero missing, duplicated, or source-mutated records.
- **SC-005**: At least 95% of completions display persisted-state feedback within 200 milliseconds; enabled post-it audio begins within 150 milliseconds of visual feedback when playback is permitted.
- **SC-006**: All primary list, attachment, completion, lock, search, copy, override, and reset journeys pass on current Chrome and Safari/WebKit at desktop, iPhone, and iPad sizes, including keyboard, touch, reduced-motion, muted-audio, interrupted-transfer, and offline variants.
- **SC-007**: For 50,000 authorized text records, 95% of searches show correctly filtered results within one second, and **All** is selected in 100% of new search journeys.
- **SC-008**: Every accepted attachment is byte-for-byte retrievable by authorized users after upload and recovery, 100% of unauthorized attempts are denied, and no tested stored attachment lacks encryption at rest.
- **SC-009**: A complete fixture round-trips through a standards-compliant CSV reader with 100% row and field fidelity, while every unauthorized export is denied with no usable output.
- **SC-010**: Offline mutations survive browser restart and synchronize or present an explicit conflict in 100% of interruption tests, with zero silently lost accepted changes.
- **SC-011**: At least 90% of usability participants correctly identify locked, unlocked, reset-to-global, completed, uploading, failed, and available attachment states without help.

## Assumptions

- A “list” is a new container of lightweight items, distinct from existing tasks/subtasks represented by **To-do Lists** in search.
- List owners control edits, group assignment, locking, deletion, and attachments. Viewers may copy but not edit the source; collaborative list editing is out of scope.
- Administrators may view all ordinary task, list, and attachment content as requested, but hidden memo plaintext still requires existing decryption/unlock. Viewing does not imply mutation authority.
- A copied list defaults to unlocked global visibility so the source privacy decision is not silently inherited; its attachment objects are independently retained for the copy.
- Totals include open and completed items. One configured currency and two-decimal precision are used; quantities, taxes, conversion, and multi-currency are out of scope.
- Global names need not be unique. Removing a global item preserves linked list-item values but disables reset and future propagation until relinked.
- Completion audio defaults on after authentication and can be muted; operating-system and browser controls take precedence.
- Attachment limits and allowed types will be chosen during planning based on security, usability, browser, and cost constraints and shown before file selection.
- Attached files are not full-text indexed in this feature; only authorized attachment metadata is searchable where existing search fields support it.
- CSV covers current task/subtask records and persisted fields, including attachment metadata/references, but not revision history, deleted records, list items, file bytes, reusable S3 links, or decrypted hidden-memo plaintext.
- Existing authentication, groups, offline sync, backup, recovery, and task search are extended rather than replaced.
