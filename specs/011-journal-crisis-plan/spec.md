# Feature Specification: Journal Crisis Plan

**Feature Branch**: `011-journal-crisis-plan`

**Created**: 2026-08-27

**Status**: Draft

**Input**: User description: "Add a Journal menu and an encrypted, editable crisis plan that is required before a user's first journal entry, can optionally be shared with selected users, is available from the Journal page, and is shown when suicidal behaviors or self-harm behaviors are answered yes."

## Clarifications

### Session 2026-08-27

- Q: Which item is the WYSIWYG editor? → A: Keep the journal's structured fields and its designated WYSIWYG fields; the crisis plan is one WYSIWYG field.
- Q: Should recipients have offline access? → A: Owners can use their plan offline; recipients must be online to view shared plans.
- Q: Can an owner delete their crisis plan? → A: No; after creation, the owner may replace or revise all content but cannot delete the plan.
- Q: Is the crisis plan part of regulated clinical care? → A: No; it is a personal-wellness feature and does not claim HIPAA-regulated clinical monitoring or care.
- Q: When does a selected recipient gain access? → A: Immediately when the owner selects them; the shared plan appears in the recipient's `Crisis Plans` tab.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a Crisis Plan Before Journaling (Priority: P1)

As an authenticated user opening Journal for the first time, I create my private crisis plan in a rich-text editor before I can create my first journal entry, so relevant guidance is already available if I later report a crisis-related behavior.

**Why this priority**: The crisis plan is the prerequisite and safety foundation for every other journey in this feature.

**Independent Test**: A new user with no crisis plan can open Journal, is prevented from starting an entry until they save a non-empty plan, and can then create the entry.

**Acceptance Scenarios**:

1. **Given** an authenticated user has neither a crisis plan nor a journal entry, **When** they choose the Journal menu, **Then** the Journal main page explains that a crisis plan is required and provides a direct path to create it.
2. **Given** a user has no saved crisis plan, **When** they attempt to start their first journal entry through any application path, **Then** entry creation is blocked and the user is directed to the crisis-plan editor without losing relevant navigation context.
3. **Given** a user enters non-empty formatted crisis-plan content, **When** they save it successfully, **Then** the plan is durably stored and they can proceed to create their first journal entry.
4. **Given** a user submits an empty or formatting-only plan, **When** validation occurs, **Then** the plan is not accepted and the user receives a clear correction message.
5. **Given** a user already has one or more journal entries but no crisis plan because their data predates this feature, **When** they open Journal, **Then** existing entries remain readable and editable but creation of another entry is blocked until a plan is saved.

---

### User Story 2 - View and Update My Crisis Plan (Priority: P1)

As a journal owner, I can reach my crisis plan from the Journal main page and update it at any time so it continues to reflect my needs.

**Why this priority**: A crisis plan is useful only when it is easy to find and remains current.

**Independent Test**: A user can open Journal, select the `Crisis Plans` submenu item, edit the plan, save it, and see the updated content after reopening it.

**Acceptance Scenarios**:

1. **Given** an authenticated user can access Journal, **When** they open the application navigation, **Then** a main menu item labeled `Journal` is available.
2. **Given** the user is on the Journal main page, **When** they inspect its submenu, **Then** an item labeled `Crisis Plans` opens their plan or the create-plan state when none exists.
3. **Given** the owner has a saved crisis plan, **When** they change its rich-text content and save, **Then** the newest complete version becomes the current plan without creating a gap in which no valid plan exists.
4. **Given** an update cannot be saved, **When** the failure occurs, **Then** the previous saved plan remains intact, the draft is preserved when safely possible, and the user sees whether the update is unsaved, pending, or failed.
5. **Given** a saved plan contains supported formatting, **When** the owner reopens it, **Then** the content is rendered safely with its formatting preserved.
6. **Given** an owner has a saved crisis plan, **When** they manage it, **Then** they may replace all content with another valid plan but no delete action is available.

---

### User Story 3 - Show the Plan for Crisis-Related Answers (Priority: P1)

As a user completing or reviewing a journal entry, I see my current crisis plan whenever either Suicidal behaviors or Self-harm behaviors is answered `yes`, so my own plan is immediately available without leaving the entry.

**Why this priority**: This is the feature's time-sensitive connection between journal responses and the user's prepared plan.

**Independent Test**: With a saved plan, answering either triggering question `yes` displays the current plan in the journal entry view while preserving all unsaved answers.

**Acceptance Scenarios**:

1. **Given** the user is completing an entry and both triggering answers are unanswered or `no`, **When** either answer changes to `yes`, **Then** the user's current crisis plan is displayed immediately in the entry view without discarding or saving the entry automatically.
2. **Given** the crisis plan is displayed because one triggering answer is `yes`, **When** the other triggering answer changes, **Then** the plan remains displayed while at least one answer is `yes`.
3. **Given** both triggering answers become `no` or unanswered, **When** the entry view updates, **Then** the triggered crisis-plan display is hidden while the plan remains available through `Crisis Plans`.
4. **Given** a saved entry has either triggering answer set to `yes`, **When** the owner reopens that entry, **Then** the owner's current crisis plan is displayed.
5. **Given** the plan cannot be loaded or decrypted when it should be shown, **When** the trigger occurs, **Then** the user's journal draft remains intact and a prominent, safe error offers retry and navigation to `Crisis Plans` without exposing plan content.
6. **Given** a triggering answer is set to `yes`, **When** the plan is displayed, **Then** no plan recipient or other person is automatically alerted and no sharing permission is changed.

---

### User Story 4 - Share My Crisis Plan Selectively (Priority: P2)

As a crisis-plan owner, I can optionally select application users who immediately gain read-only access to my plan, manage their access, and revoke it, while retaining sole editing control.

**Why this priority**: Trusted-person visibility can make the plan more useful, but sharing must remain voluntary and tightly bounded.

**Independent Test**: An owner can select one registered user, the shared plan immediately appears in that recipient's `Crisis Plans` tab as read-only, an unselected user is denied, and revocation ends the recipient's access.

**Acceptance Scenarios**:

1. **Given** an owner has a saved plan, **When** they select a registered user for sharing, **Then** an active read-only share is created immediately and the plan appears in that user's `Crisis Plans` tab without an invitation or acceptance step.
2. **Given** a recipient has been selected, **When** they open the shared plan from their `Crisis Plans` tab while online, **Then** they can view the owner's current plan but cannot edit, reshare, export through this feature, or change its sharing settings.
3. **Given** a recipient does not want a plan that was shared with them, **When** they remove it from their `Crisis Plans` tab, **Then** their access ends without changing the owner's plan or another recipient's access, and the owner can see that the recipient removed access.
4. **Given** an active share, **When** the owner updates the plan, **Then** the recipient sees the latest successfully saved version the next time the shared plan refreshes.
5. **Given** an owner revokes an active share, **When** revocation succeeds, **Then** the plan disappears from the recipient's `Crisis Plans` tab, future access is denied immediately, and no application-managed recipient offline copy exists.
6. **Given** a user is not an active recipient, **When** they attempt to access a plan by navigation, identifier, cached link, or altered request, **Then** no plan content or sensitive metadata is disclosed.

---

### User Story 5 - Use the Crisis Plan Across Supported Browsers and Connectivity States (Priority: P3)

As a crisis-plan owner on an authorized device, I can use my plan across supported browsers, screen sizes, and temporary loss of connectivity without silent data loss, while recipients view shared plans only while online.

**Why this priority**: The plan may be needed on mobile or during degraded connectivity, and sensitive content must remain protected in every state.

**Independent Test**: On supported desktop, iPhone, and iPad browser classes, authorized users can complete their permitted journeys; the owner's previously synchronized plan remains available offline, pending owner edits synchronize safely after reconnection, and recipients cannot open shared content while offline.

**Acceptance Scenarios**:

1. **Given** an owner previously synchronized their plan on an authorized device, **When** the device goes offline, **Then** the owner can view it after the required local authentication or unlock check and can preserve an edited draft as visibly pending.
2. **Given** an active recipient loses connectivity, **When** they try to open a shared plan, **Then** no shared plan content is available and the user is told that an online authorization check is required.
3. **Given** a pending owner edit and a newer remote version, **When** connectivity returns, **Then** neither version is silently overwritten and the owner is guided through an explicit conflict resolution.
4. **Given** a share was revoked while a recipient was offline, **When** that recipient reconnects and attempts to view it, **Then** the online authorization check denies access and no shared content is returned.

### Edge Cases

- Multiple tabs or devices attempt to edit the same crisis plan at the same time; the latest version is not silently overwritten.
- The owner tries to revoke a share or update a plan while offline; the change is clearly pending, and the interface does not claim that remote access has already ended.
- A recipient is deleted, deactivated, or otherwise loses application access; their crisis-plan access ends without affecting the plan or other recipients.
- The owner changes a triggering journal answer rapidly, navigates away, or encounters a failed plan load; unsaved journal content is preserved and plan plaintext is not written to logs or URLs.
- Rich text includes unsafe markup, malformed links, pasted content, or content too large to process safely; unsafe content is not executed, and rejection does not destroy the last saved plan or the user's draft.
- A legacy user has journal entries but no crisis plan; the user can read and edit existing entries but must create the plan before adding another entry.
- A recipient has retained information outside application control, such as a screenshot; revocation messaging explains that the application cannot retract copies made outside it even though the application does not provide recipient offline storage.
- Current Chrome and Safari/WebKit differ in rich-text editing, local storage, viewport, or browser lifecycle behavior; the supported formatting, safe-area layout, touch controls, and preservation guarantees remain consistent.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST provide an authenticated-user main menu item labeled `Journal` that opens the Journal main page.
- **FR-002**: The Journal main page MUST provide a submenu item labeled `Crisis Plans` that opens the current user's crisis plan or its create state.
- **FR-003**: Each user MUST own at most one current crisis plan and MUST retain sole authority to edit its content and manage its sharing.
- **FR-004**: A user without a saved, non-empty crisis plan MUST be prevented from creating a journal entry through every entry-creation path.
- **FR-005**: After the user successfully saves their first valid crisis plan, the system MUST allow them to continue to journal-entry creation.
- **FR-006**: For a legacy user who has entries but no plan, the system MUST continue to allow reading and editing existing entries while blocking creation of another entry until a valid plan is saved.
- **FR-007**: The crisis plan MUST consist of a rich-text content field and system-managed information needed for ownership, versioning, sharing, and safe synchronization; it MUST NOT require additional structured plan questions in this feature.
- **FR-008**: The crisis-plan editor MUST support bold, italic, underline, strikethrough, bulleted lists, numbered lists, and links, and MUST render saved content without executing unsafe content.
- **FR-009**: A crisis plan MUST contain visible text or another supported meaningful rich-text element; empty and formatting-only plans MUST be rejected with an actionable message.
- **FR-010**: The owner MUST be able to update their crisis plan at any time, and an unsuccessful update MUST leave the last successfully saved version intact.
- **FR-011**: When Suicidal behaviors or Self-harm behaviors is `yes` in a new, edited, or viewed journal entry, the system MUST display the owner's current crisis plan within the entry experience while either answer remains `yes`.
- **FR-012**: Triggered display of a crisis plan MUST NOT discard journal changes, automatically save the journal entry, automatically notify any person, alter sharing, represent a clinical risk assessment, or imply that the application is providing regulated clinical monitoring or care.
- **FR-013**: The crisis-plan trigger MUST use the current values visible in the journal entry and MUST also apply when an existing entry with a triggering `yes` answer is reopened.
- **FR-014**: If a triggered plan cannot be made available, the system MUST preserve the journal draft and prominently provide safe retry and `Crisis Plans` navigation actions.
- **FR-015**: Sharing a crisis plan MUST be optional and initiated only by its owner for specifically selected registered users through a Select2 user-selection control; selecting a user MUST create active read-only access immediately without invitation or acceptance.
- **FR-016**: A newly shared plan MUST appear in the selected recipient's `Crisis Plans` tab, identified by its owner, without exposing journal entries, trigger answers, or other journal activity.
- **FR-017**: The system MUST expose each share's active, revoked, or recipient-removed status to the participants for whom that status is relevant.
- **FR-018**: An active recipient MUST have read-only access to the latest successfully saved plan and MUST NOT be able to edit it, reshare it, manage another recipient, or export it through this feature.
- **FR-019**: The owner MUST be able to revoke an active recipient at any time without changing the plan or another recipient's access.
- **FR-020**: A recipient MUST be able to remove their own access without changing the owner's plan or another recipient's access.
- **FR-021**: A successful online revocation or recipient removal MUST prevent subsequent reads immediately; the application MUST NOT maintain recipient-accessible offline copies of shared crisis plans.
- **FR-022**: Every plan read, edit, share grant, revocation, recipient removal, synchronization, and triggered display MUST recheck the relevant authenticated user's authorization.
- **FR-023**: Crisis-plan content MUST remain encrypted whenever persisted or transmitted, including primary storage, authorized-device offline storage, backups, replicas, synchronization payloads, and temporary durable storage.
- **FR-024**: Plaintext plan content MUST be available only during active use by the owner, an active recipient, or the existing bounded journal-access recovery process; it MUST NOT appear in general administration tools, logs, analytics, notifications, URLs, previews, or shared caches.
- **FR-025**: Plan saves, share grants, revocations, and recipient removals MUST be retry-safe and MUST NOT create duplicate relationships, expose partial content, or silently overwrite a newer state.
- **FR-026**: The owner MUST be able to view their previously synchronized plan offline on a previously authorized device after the applicable authentication or unlock check; offline owner edits MUST be marked pending until synchronized.
- **FR-027**: Active recipients MUST be online and successfully reauthorized whenever they open or refresh a shared plan; no shared plan content MUST be available to a recipient while offline.
- **FR-028**: On reconnection, pending owner plan or sharing changes MUST synchronize without silent loss; conflicts MUST be surfaced for deliberate owner resolution.
- **FR-029**: The system MUST clearly communicate that access revocation cannot retract copies a recipient created outside application control.
- **FR-030**: Journal trigger answers and activity MUST NOT be disclosed to crisis-plan recipients merely because they can view the plan.
- **FR-031**: After a crisis plan is created, the owner MUST NOT be able to delete it; the owner MAY replace all of its content through a valid update, and a user with journal history MUST always retain a current valid plan.
- **FR-032**: If an active recipient account is deleted, deactivated, or otherwise loses application access, every subsequent shared-plan list, open, refresh, and key-broker request MUST deny access immediately without changing the owner's plan or another recipient's access; the retained relationship MAY remain visible to the owner for audit until explicitly revoked.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: Crisis-plan content, ownership, sharing relationships, recipient identities, versions, and access activity are sensitive data. Only the owner may edit or manage sharing; only the owner and currently active recipients may read content during ordinary operation. Ordinary administrators and unrelated users MUST be denied. The existing journal recovery exception, if invoked, MUST remain bounded to restoring the verified owner's access and MUST NOT expose plaintext to the recovery operator. Security validation MUST cover cross-user identifiers, forged or stale share grants, revoked recipients, cached content, direct navigation, restored backups, and misuse of administrative or recovery roles.
- **NFR-002 Data Durability & Recovery**: The latest acknowledged plan and sharing state MUST be durably recoverable. Validation, atomic replacement, retry behavior, conflict handling, encrypted backup and restoration, and periodic recovery verification MUST prevent an invalid edit, partial failure, duplicate request, or restore from removing the last valid plan or broadening access.
- **NFR-003 Offline Support**: An owner's previously synchronized plan MUST remain encrypted locally and available only to that owner on a previously authorized device after an authentication or unlock check. Connectivity, content freshness, pending owner edits, pending sharing actions, and conflicts MUST be visible, and reconnection MUST retry safely. Recipient views MUST require current online authorization and MUST NOT be retained for offline access.
- **NFR-004 Browser & Responsive Support**: Plan creation, editing, triggered display, sharing management, shared-plan discovery/removal, and read-only viewing MUST work in current stable Chrome and Safari/WebKit at supported desktop, iPhone, and iPad sizes. Rich-text tools and sharing controls MUST be keyboard-, touch-, and assistive-technology-usable, and viewport, safe-area, storage, and lifecycle differences MUST not expose or silently lose content.
- **NFR-005 Errors & Observability**: User-facing failures MUST distinguish unsaved, pending, conflicted, unavailable, and unauthorized states and offer a safe next action. Centralized structured operational records MUST capture content-free correlation identifiers, operation type, timing, and outcome. Logs, metrics, alarms, support artifacts, and notifications MUST exclude plan content, journal answers, recipient-visible plaintext, encryption material, and sensitive URLs. Monitoring MUST cover save/sync failures, authorization denials, decryption failures, sharing-state failures, and backup/recovery health with cost-appropriate retention.
- **NFR-006 Performance**: On a representative supported mobile device and ordinary broadband, 95% of Journal main-page, crisis-plan, triggered-plan, and sharing views MUST become usable within 2 seconds, and online save or sharing confirmations MUST appear within 2 seconds. On a degraded mobile connection, 95% MUST become usable within 5 seconds or show an accurate loading or pending state. Local rich-text input and trigger visibility changes MUST visibly respond within 100 milliseconds.
- **NFR-007 AWS Architecture & Cost Impact**: Planning MUST evaluate managed serverless AWS services first for encrypted persistence, authorization, key access, sharing, synchronization, backup, and monitoring. The design MUST document cost drivers for storage, encryption/key operations, sharing reads, synchronization, backup, recovery, and monitoring, plus a cheaper viable alternative. Any always-on component requires explicit justification and MUST not weaken privacy, durability, offline, browser, or performance outcomes.

### Key Entities *(include if feature involves data)*

- **Crisis Plan**: One current, encrypted rich-text plan owned by a user, with version and synchronization state needed for safe replacement and recovery.
- **Crisis Plan Share**: The access relationship between one plan and one owner-selected recipient, including active, revoked, or recipient-removed state and relevant timestamps; it grants read-only access immediately when created and only while active.
- **Plan Draft**: An encrypted owner-side edit that is unsaved or pending synchronization and cannot replace the last valid plan until successfully committed.
- **Journal Trigger State**: The current Suicidal behaviors and Self-harm behaviors answers used only to determine whether the owner's current plan is displayed in the entry experience.
- **Owner Device Copy**: An encrypted, locally synchronized plan copy bound to its owner and an authorized device context, with freshness and pending-state information; recipients do not receive application-managed offline copies.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In first-use testing, at least 95% of representative users understand that a crisis plan is required, create a valid plan, and reach journal-entry creation on their first attempt without assistance.
- **SC-002**: In trigger testing, 100% of entries in which either Suicidal behaviors or Self-harm behaviors is `yes` display the owner's current plan, preserve unsaved entry data, and send no automatic recipient notification.
- **SC-003**: At least 90% of representative users can locate `Crisis Plans` from the Journal main page and save an update within 60 seconds.
- **SC-004**: In authorization testing, 100% of attempts by unselected, revoked, recipient-removed, deleted/deactivated, ordinary administrative, or recovery-administrative users to read or change plan content are denied without content or sensitive-metadata disclosure; active recipients remain unable to edit or reshare.
- **SC-005**: In storage, transmission, backup, offline-cache, telemetry, and support-artifact inspections, 100% of sampled crisis-plan content is encrypted or absent outside active authorized use, and no plan plaintext or encryption material appears in operational records.
- **SC-006**: During simulated failed saves, duplicate submissions, concurrent edits, disconnects, reconnections, backup restores, and sharing-state changes, 100% of acknowledged plans and access decisions are preserved or surfaced for explicit resolution, with no silent loss or unintended access expansion.
- **SC-007**: Across current stable Chrome and Safari/WebKit on representative desktop, iPhone, and iPad viewports, 100% of primary create, edit, trigger-display, select/share, revoke/remove, discover, and read-only journeys can be completed with keyboard or touch input.
- **SC-008**: The performance targets in NFR-006 are met in at least 95% of measured journeys under their stated device and network conditions.

## Assumptions

- This feature extends the existing private-journal specification. Existing structured journal-entry fields, including Suicidal behaviors and Self-harm behaviors, remain unchanged; journal fields already designated as rich text remain WYSIWYG editors, and the crisis plan consists of one WYSIWYG field.
- Each user owns one current crisis plan rather than multiple named plans. The navigation label remains exactly `Crisis Plans` as requested.
- The crisis plan supports the same baseline rich-text formatting already expected for journal notes: bold, italic, underline, strikethrough, bulleted lists, numbered lists, and links.
- Sharing is plan-wide and read-only. Owner selection grants access immediately without invitation or acceptance, places the shared plan in the recipient's `Crisis Plans` tab, provides no resharing or feature-level export, and can be revoked by the owner or relinquished by the recipient.
- Active recipients see the current saved plan rather than a frozen version, and journal entries do not retain a snapshot of the plan that was current when the entry was written.
- Displaying a plan in response to a triggering answer is private to the journal owner. It does not notify recipients, clinicians, administrators, emergency services, or any other person and does not diagnose or score risk.
- The crisis plan is a personal-wellness feature, not regulated clinical monitoring or care, and the product does not claim that this feature provides HIPAA-regulated healthcare functionality.
- Existing authenticated identity, journal-entry behavior, and bounded journal access-recovery rules are reused. A crisis plan is protected at least as strictly as the private journal.
- A successful plan update atomically replaces the prior version while recoverable history and backups remain subject to the same encryption and authorization boundaries.
- Application-managed offline availability is limited to the plan owner because the plan may be needed during a connectivity loss. Recipients must be online and reauthorized to view a shared plan. The application cannot retract screenshots or other copies made outside its control.
- After creation, a crisis plan cannot be deleted, so the prerequisite cannot become false after journal entries exist. Owners may replace the entire plan content with another valid, non-empty plan.
