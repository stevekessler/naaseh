# Feature Specification: Content Scope and Collaborative Filtering

**Feature Branch**: `[014-content-scope-filtering]`

**Created**: 2026-10-17

**Status**: Ready for planning

**Input**: User description: "Refine cross-user data display so default task and search views show a user's own content and their groups' content; add assignee and group filters with intuitive AND/OR logic; limit Personal Stack to assigned or group-assigned tasks; always show group members; and make list sharing explicit and reliable."

## Clarifications

### Session 2026-10-17

- Q: Is an unlocked task associated with a group group-only or readable by every active user? → A: Every unlocked task is readable by every active user. Its group affects assignment and default discovery, not read authorization. Group-shared Lists remain group-only.
- Q: What belongs in “my tasks/content”? → A: Tasks assigned to the viewer plus tasks associated with the viewer's active groups. Every task must have an individual assignee; unassigned tasks are not permitted.
- Q: Must a user also enable All content when explicitly filtering for another user or constructing a cross-user Boolean expression? → A: No. An explicit cross-user filter automatically searches all otherwise-readable content. The filter itself is the deliberate expansion action.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start with Relevant Work (Priority: P1)

When a user signs in without filters, task browsing shows tasks assigned to them and tasks associated with groups in which they are an active member. Public work belonging only to unrelated users remains discoverable but does not appear by default.

**Why this priority**: A globally readable task must not become ambient clutter or an accidental disclosure in another user's ordinary workflow.

**Independent Test**: Sign in as each of two users with owned, assigned, group-associated, public, and private tasks, clear all URL and saved filters, and verify the default result set for each user.

**Acceptance Scenarios**:

1. **Given** an active user with directly assigned tasks, active group memberships, and unrelated public tasks, **When** the user opens Tasks with no explicit filter state, **Then** only tasks assigned to the user or associated with one of the user's active groups appear.
2. **Given** an unrelated user's readable public task, **When** the viewer has not selected that user, the task's group, an all-content scope, or a Boolean filter that deliberately matches it, **Then** the task is absent from the task table, counts, empty states, and navigation summaries.
3. **Given** a private task owned by someone else, **When** the viewer selects any scope, assignee, group, priority, search term, or Boolean mode, **Then** the task and its existence remain undisclosed.
4. **Given** a default-scoped view, **When** the user reloads, signs out and back in, or opens an equivalent supported browser, **Then** the same default scope is applied unless an explicit shareable filter URL or saved preference says otherwise.
5. **Given** a task-creation form, **When** the creator does not choose another assignee, **Then** the task is assigned to the creator rather than stored as unassigned.

---

### User Story 2 - Filter by People, Groups, and Boolean Intent (Priority: P1)

A user can filter tasks by assignee and group, combine conditions using a plainly worded “Match all” or “Match any” choice, and understand the resulting expression before applying it. For example, the interface can represent “Assignee is Steve OR Priority is Critical” without requiring query-language knowledge.

**Why this priority**: Cross-user public visibility is useful only when users can deliberately retrieve the right shared work without making every user's content part of the default view.

**Independent Test**: Build filters against a controlled data set whose tasks each match different combinations of assignee, group, and priority, then verify every result against the displayed expression in both Boolean modes.

**Acceptance Scenarios**:

1. **Given** readable tasks assigned to different users, **When** the viewer selects Steve as assignee, **Then** the result set expands to all readable content and contains exactly the tasks assigned to Steve that satisfy the remaining expression.
2. **Given** readable tasks associated with different groups, **When** the viewer selects one or more groups, **Then** the result set contains tasks for the selected groups and never treats group selection as membership authorization.
3. **Given** “Assignee is Steve” and “Priority is Critical,” **When** the viewer chooses “Match any,” **Then** every readable task satisfying at least one condition appears and the interface summarizes the expression as OR.
4. **Given** the same conditions, **When** the viewer chooses “Match all,” **Then** only readable tasks satisfying both conditions appear and the interface summarizes the expression as AND.
5. **Given** multiple values inside one condition, **When** Steve and Heather are selected as assignees, **Then** that condition matches either assignee; the top-level Match all/any choice controls how different condition types combine.
6. **Given** an explicit filter in the URL, **When** the URL is opened in a new supported browser session by an authorized user, **Then** the same scope, conditions, and Match all/any rule are restored safely.

---

### User Story 3 - Keep Personal Stack Personal (Priority: P1)

Personal Stack contains only active tasks assigned to the signed-in user or assigned to one of the user's active groups. Public visibility by itself does not place another user's task in the stack.

**Why this priority**: Personal Stack represents committed work, not the universe of readable work, and unrelated public tasks make its ordering noisy and misleading.

**Independent Test**: Seed the stack with personal, group-assigned, unrelated public, private, archived, completed, and membership-revoked tasks and verify membership and relative ordering before and after synchronization.

**Acceptance Scenarios**:

1. **Given** an active open task assigned to the viewer, **When** Personal Stack loads, **Then** the task is included.
2. **Given** an active open task assigned to an active group of the viewer, **When** Personal Stack loads, **Then** the task is included.
3. **Given** a readable public task assigned only to another user or unrelated group, **When** Personal Stack loads, **Then** the task is excluded even if an ordinary task filter could find it.
4. **Given** a task in Personal Stack whose assignee or group changes, or whose group membership is revoked, **When** the change is accepted, **Then** stack membership is updated without changing the surviving tasks' relative order or revealing rank gaps.
5. **Given** Personal Stack filters, **When** filters are changed, **Then** they narrow only the eligible personal-stack population and cannot add an otherwise ineligible public task.

---

### User Story 4 - Search the Right Audience (Priority: P1)

Search defaults to tasks assigned to the signed-in user, Lists owned by the signed-in user, and content associated with their active groups. A visible “All content” control expands the search to all content the user is authorized to read.

**Why this priority**: Search currently operates over all locally available work, so default search can surface unrelated public content without deliberate user intent.

**Independent Test**: Search for a term present in personal, group, unrelated public, and private records, compare default and All content results, and repeat offline from an authorized cache.

**Acceptance Scenarios**:

1. **Given** matching personal, group, unrelated public, and unauthorized private content, **When** the user searches in the default scope, **Then** only matching personal and active-group content appears.
2. **Given** the same content, **When** the user turns on All content, **Then** all matching readable content appears and private unauthorized content remains absent.
3. **Given** All content is on, **When** the user turns it off, **Then** results, counts, and result announcements immediately return to the default scope.
4. **Given** a list item match, **When** its parent list is not readable in the active scope, **Then** neither the item nor identifying parent metadata appears.

---

### User Story 5 - See Group Membership Without Extra Disclosure (Priority: P2)

On the Groups page, members of each group that the viewer is allowed to inspect are displayed automatically; there is no Show members button.

**Why this priority**: Membership is core context for group-scoped work and should not require a repetitive disclosure action.

**Independent Test**: Open the Groups page online and offline as an owner, member, and non-member and verify automatic member presentation, loading, errors, and authorization boundaries.

**Acceptance Scenarios**:

1. **Given** the Groups page is opened with any unrelated task-filter query parameters, **When** groups finish loading, **Then** authorized group members are shown automatically and those unrelated parameters do not hide them.
2. **Given** group membership data is loading, **When** the page renders, **Then** each affected group shows a clear loading state without a Show members control.
3. **Given** member loading fails, **When** other groups are available, **Then** the failed group shows a retryable error without hiding successfully loaded memberships.
4. **Given** the viewer is not authorized to inspect a group's members, **When** the Groups page loads, **Then** no member identity or member count for that group is disclosed.

---

### User Story 6 - Save and Deliver List Sharing (Priority: P1)

A list owner can deliberately save a privacy or group-sharing change, see whether it is saving, saved, pending synchronization, or failed, and trust that newly authorized group members receive the list and all active items.

**Why this priority**: A sharing control that looks editable but gives no commit feedback creates ambiguity and currently fails the core collaboration outcome.

**Independent Test**: Change a private or public list to a selected group, save it, synchronize as another active group member, and verify the complete list; repeat offline, on failure, and after changing or removing the group.

**Acceptance Scenarios**:

1. **Given** an owned list with changed sharing fields, **When** the owner has not saved, **Then** the interface clearly distinguishes the draft selection from the persisted sharing state.
2. **Given** a valid sharing change, **When** the owner activates Save sharing, **Then** the control reports progress and then Saved, Pending sync, Conflict, or Failed with an appropriate next action.
3. **Given** a list newly shared with a group, **When** an active member synchronizes, **Then** the member receives the list and every active non-removed list item that belongs to it.
4. **Given** a list moved from one audience to another, **When** synchronization completes, **Then** the prior audience loses access and cached content is removed or rendered inaccessible while the new audience receives a complete snapshot.
5. **Given** an owner changes sharing offline, **When** connectivity returns, **Then** the saved change synchronizes or presents a conflict without claiming the remote share succeeded prematurely.

### Edge Cases

- An assignee is deactivated, removed from the directory, or renamed while tasks and a filter URL still reference that user.
- Legacy data or an imported mutation contains no assignee; it is rejected or migrated to the task owner without creating an unassigned state.
- A task has an assignee outside its group, is owned by one user and assigned to another, or changes those relationships while a view is open.
- A task matches multiple OR conditions; it appears once and counts once.
- A user combines zero, one, or many values within a condition and switches between Match all and Match any.
- A group is archived or membership is revoked while tasks, list shares, filters, search results, or stack entries for it are cached offline.
- A public task becomes private while another user's device is offline; upon reconnection, the unauthorized cached record is removed or made inaccessible before it can be reopened.
- A shared list contains completed items, removed items, directory-linked values, attachments, or item edits made before the audience change.
- The user double-submits Save sharing, navigates away during a pending save, or receives a version conflict from another device.
- The Groups page contains many groups or members; automatic loading remains understandable and does not leak membership through errors or counts.
- Chrome and Safari/WebKit restore URL filters, Boolean mode, and scope consistently at desktop, iPhone, and iPad sizes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST distinguish authorization to read content from the default presentation scope; being readable MUST NOT by itself make content appear in an unfiltered default view.
- **FR-002**: With no explicit task filter, the Tasks view MUST show tasks assigned to the viewer plus tasks associated with the viewer's active groups, independent of task ownership.
- **FR-003**: The Tasks view MUST provide assignee and group conditions using active directory users and groups that the viewer is permitted to select.
- **FR-004**: Assignee and group conditions MUST support selecting more than one value; values within the same condition MUST match as alternatives.
- **FR-005**: The filter interface MUST provide clearly labeled Match all and Match any modes for combining different active condition types and MUST show a plain-language summary of the current expression.
- **FR-006**: Match all MUST require every active condition type to match; Match any MUST require at least one active condition type to match. Authorization constraints, lifecycle safety constraints, and Personal Stack eligibility MUST remain mandatory and MUST NOT become optional OR clauses.
- **FR-007**: A record matching more than one condition MUST appear and be counted only once.
- **FR-008**: The selected scope, assignees, groups, filter values, and Match all/any mode MUST be representable in a shareable URL, validated when restored, and reset to safe defaults when absent or invalid.
- **FR-009**: Every Task MUST have exactly one individual assignee backed by an existing user account. New Tasks MUST default to the creator when the creator does not explicitly select another active assignee. Task creation, edits, imports, synchronization, and restoration MUST reject an absent assignee rather than create an unassigned Task.
- **FR-010**: Existing Tasks without an assignee MUST be migrated to their owner before the mandatory-assignee rule is enforced, with a verified count before and after migration and no loss of other task fields.
- **FR-011**: Personal Stack MUST include only active open tasks assigned directly to the viewer or associated with one of the viewer's active groups.
- **FR-012**: Personal Stack MUST exclude Lists and readable public tasks that satisfy neither direct assignment nor active-group association; filters MUST only narrow Personal Stack eligibility.
- **FR-013**: Eligibility changes MUST add or remove Personal Stack entries without exposing another user's ranks and without silently reordering surviving entries.
- **FR-014**: Search MUST default to tasks assigned to the viewer, Lists owned by the viewer, and content associated with the viewer's active groups, and MUST provide a clearly labeled All content toggle.
- **FR-015**: Selecting an assignee other than the viewer, selecting a group outside the viewer's active groups when that group is available for filtering, or constructing an explicit cross-user Match any expression MUST automatically evaluate the expression over all otherwise-readable content without requiring All content to be enabled separately.
- **FR-016**: The interface MUST visibly indicate when an explicit filter has expanded evaluation beyond the default scope and MUST return to the default scope when the expanding conditions are removed.
- **FR-017**: All content MUST expand search only to content the viewer is authorized to read and MUST NOT expose private content, hidden memo text, inaccessible list items, or identifying metadata from an inaccessible parent.
- **FR-018**: Search scope MUST apply consistently to tasks, Lists, and List Items; conditions not applicable to a content type MUST be treated as non-matches rather than ignored when evaluating Match all/any.
- **FR-019**: The Groups page MUST automatically load and display members for every group whose membership roster the viewer is authorized to inspect, with per-group loading, failure, and retry states and no Show members control.
- **FR-020**: Unrelated task/search query parameters on the Groups route MUST NOT suppress member display or alter group-membership authorization.
- **FR-021**: List sharing changes MUST use an explicit Save sharing action and MUST expose Draft, Saving, Saved, Pending sync, Conflict, and Failed states as applicable.
- **FR-022**: A newly authorized list audience MUST receive a complete current snapshot of the parent List and all active non-removed List Items, including items created before the audience change.
- **FR-023**: When list access is revoked or moved, the former audience MUST receive revocation information for the parent and its items, and clients MUST remove or make inaccessible the revoked cached content.
- **FR-024**: The system MUST validate that a selected sharing group is active and that the owner is authorized to share with it both when the draft is created and when it is saved.
- **FR-025**: Counts, badges, empty states, reports, exports, reminders, notifications, parent-task selectors, and other derived views MUST document and consistently apply either default presentation scope, explicit filter scope, or authorization-only scope; no consumer may inherit scope accidentally.
- **FR-026**: Direct navigation to a known readable task or List MAY open it without first reproducing a discovery filter, but direct navigation MUST enforce the same authorization rules and MUST NOT add the item to default views or Personal Stack.
- **FR-027**: Historical or bookmarked URLs that omit the new scope and Boolean fields MUST resolve to the new safe default rather than the former all-readable-content behavior.
- **FR-028**: Existing saved Personal Stack order MUST be migrated by removing newly ineligible entries while retaining the relative order of surviving eligible entries.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: Authorization MUST be evaluated before scope or Boolean matching. Private content and unauthorized group content MUST remain undiscoverable through results, counts, suggestions, user/group options, URLs, rank gaps, errors, offline caches, exports, reports, notifications, or logs. Group membership roster access MUST follow an explicit policy. Owner, assignee, group, visibility, and active-membership roles MUST be separately represented and tested.
- **NFR-002 Data Durability & Recovery**: Accepted list-sharing and stack-eligibility changes MUST be durable, retry-safe, conflict-aware, and included in backup and restore. Audience transitions MUST be atomic or recoverably resumable across parent Lists and existing List Items. The interface MUST never report a remote share as saved unless it is durably accepted or explicitly labeled pending synchronization.
- **NFR-003 Offline Support**: Previously authorized cached content MUST remain filterable and searchable offline using the last known safe scope and membership state. Filter changes and list-sharing drafts made offline MUST survive browser restart. Reconnection MUST process revocations before permitting stale content to reopen and MUST visibly resolve sharing conflicts or failures.
- **NFR-004 Browser & Responsive Support**: Default scope, assignee/group selection, Match all/any controls, expression summary, All content search, automatic member display, and Save sharing states MUST work in current stable Chrome and Safari/WebKit at desktop, iPhone, and iPad sizes with keyboard, touch, and assistive technology.
- **NFR-005 Errors & Observability**: Users MUST receive actionable errors for directory loading, group roster loading, filter restoration, stack eligibility updates, audience transitions, and synchronization. Structured CloudWatch events MUST record safe correlation identifiers, operation class, affected entity identifiers, old/new audience class, result, retry/conflict status, and timing while excluding task text, list-item content, search terms, member names, and other protected content. Metrics and alarms MUST cover repeated audience-transition and revocation failures.
- **NFR-006 Performance**: With 50,000 readable work records, 10 active groups, and 500 selectable users, 95% of default-scope changes, Boolean filter changes, and searches MUST show results or a durable loading acknowledgement within one second on a supported mid-range device and degraded broadband. Group rosters MUST progressively render without blocking the page, and required pull-request validation MUST remain within the repository's ten-minute limit.
- **NFR-007 AWS Architecture & Cost Impact**: Planning MUST evaluate reuse of existing serverless synchronization, audience feeds, projections, and local indexes before introducing infrastructure. Cost analysis MUST include public-content fan-out, group and user filter indexes, complete list-audience transitions, revocation processing, and observability volume.

### Key Entities

- **Content Authorization Decision**: Whether the viewer may read a record at all, independent of whether the record belongs in the active presentation scope.
- **Presentation Scope**: The user-selected discovery boundary—default personal-and-group content or all readable content—applied before ordinary display or search results are shown.
- **Filter Condition**: One named criterion, such as assignee, group, priority, category, project, due date, progress, lifecycle, content type, or text query, with one or more selected values where applicable.
- **Filter Expression**: The active set of condition types plus a Match all or Match any operator; mandatory authorization and feature-specific eligibility constraints are outside this Boolean expression.
- **Task Relationship**: Distinct owner, required individual assignee, and optional group relationships used for authorization, discovery, and Personal Stack eligibility without treating the terms as interchangeable.
- **Personal Stack Eligibility**: A viewer-specific decision based on active state and direct or group assignment, narrower than general read authorization.
- **Group Membership Roster**: The active membership records and safe user identity fields that an authorized viewer may inspect for one group.
- **List Sharing Draft**: Unsaved owner-selected privacy and group values, separate from the list's persisted audience.
- **Audience Transition**: A durable change that grants or revokes access to a parent List and its existing active child items as one recoverable operation.

## Related Model Impacts for Review

The following existing behaviors are part of this feature's review surface because they can otherwise contradict the requested experience:

1. **Existing Personal Stack contract**: The earlier urgency/stack specification says Personal Stack contains every authorized active item, including public work and Lists. This feature proposes a narrower task-only assignment rule and therefore supersedes that assumption and its related admission behavior.
2. **Group versus public meaning**: The current authorization model treats unlocked content with a group as group-only. This feature changes Tasks so every unlocked Task is readable by all active users and group becomes a discovery/assignment attribute. Lists intentionally retain owner-only private mode and group-only sharing.
3. **Owner versus assignee**: Current records separately track task owner and optional assignee. This feature makes assignee mandatory, assigns legacy unassigned Tasks to their owners, and bases the default task scope on assignee rather than owner. Notifications, completion credit, and filters must preserve those distinctions.
4. **Lists have no assignee**: Search spans Tasks, Lists, and List Items. Boolean evaluation must define how task-only assignee conditions interact with list results, while list ownership and group sharing define list scope.
5. **Synchronization and local storage**: Devices currently synchronize broad public feeds. Presentation filtering alone can hide unrelated public records, but scale, offline indexing, revocation order, and local-cache retention still require an explicit decision.
6. **Audience changes for existing List Items**: Changing the parent List audience currently emits a transition for the List; existing child items also need a complete grant/revocation path so a recipient sees the whole list rather than only later item changes.
7. **Derived consumers**: Dashboard counts, archive, completion reporting, exports, notifications, reminders, workload/project views, parent-task pickers, list destinations, and navigation counts each need an intentional scope classification.
8. **URL and saved-state compatibility**: Existing URLs default missing filters to broad “all” values and share filter state between sections. New defaults need route-specific safe restoration, especially when moving among Tasks, Search, Groups, Archive, and Personal Stack.
9. **Membership lifecycle**: Join, removal, group archival, user deactivation, and offline membership changes affect default discovery, stack eligibility, filter options, cached records, and list access at the same time.
10. **Administration**: Administrator privileged reads remain authorization-only and must not silently place every user's content into the administrator's default task view, search, or Personal Stack.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of default-view fixtures, unrelated public tasks are absent while every task assigned to the viewer or associated with an active group of the viewer is present and counted exactly once.
- **SC-002**: In 100% of filter truth-table tests, Match all and Match any return the expected authorized set for every pairwise combination of assignee, group, priority, category, project, due date, progress, lifecycle, content type, and text query.
- **SC-003**: At least 90% of representative users can create “Steve's tasks OR Critical,” switch it to AND, and accurately predict the difference without assistance in under one minute.
- **SC-004**: In 100% of Personal Stack tests, only directly assigned or active-group-assigned tasks are present; unrelated public work and Lists are absent, and eligibility changes preserve the relative order of surviving entries.
- **SC-005**: In 100% of search fixtures, default scope excludes unrelated public content, All content includes every matching readable record, and neither mode reveals unauthorized content or hidden memo text.
- **SC-006**: Authorized group members are visible without a Show members action in 100% of Groups-page tests, while unauthorized viewers receive zero roster identity or count disclosures.
- **SC-007**: In 100% of successful list-sharing tests, a newly authorized member receives the parent List and every active non-removed item created before or after sharing; former audiences cannot reopen revoked content after synchronization.
- **SC-008**: Users see an accurate Draft, Saving, Saved, Pending sync, Conflict, or Failed state for 100% of list-sharing outcomes, with zero false success states.
- **SC-009**: At least 95% of default-scope, filter, and search interactions show results or a durable loading acknowledgement within one second at the target data volume and supported degraded-network conditions.
- **SC-010**: All primary journeys pass in current Chrome and Safari/WebKit at desktop, iPhone, and iPad sizes using keyboard, touch, and assistive technology.
- **SC-011**: Offline, retry, duplicate-delivery, membership-change, and audience-transition tests produce zero silently lost sharing changes, zero stale unauthorized reopenings after revocation is processed, and zero duplicated results.
- **SC-012**: Required hosted pull-request validation remains at or below ten minutes after representative coverage is added.
- **SC-013**: After migration and in 100% of create, edit, import, synchronization, and restore tests, every Task has exactly one valid individual assignee and zero Tasks are stored as unassigned.

## Assumptions

- “Private” continues to mean owner-only for ordinary users, with existing separately audited administrator-read behavior unchanged.
- Every unlocked Task is readable by every active user, including when it has a group. A Task's group controls default discovery and Personal Stack inclusion but does not restrict read authorization.
- Lists intentionally retain different sharing semantics: an unlocked List shared with a group is readable only by that group's active members; an unlocked List with no group is readable by every active user.
- Authorization is always evaluated before presentation scope and filters; no Boolean mode can broaden authorization.
- Values within a multi-select condition use OR, while the top-level Match all/any control combines different condition types.
- Every Task has one required individual assignee. New Tasks default to the creator, and legacy unassigned Tasks are assigned to their owner during migration.
- Personal Stack becomes task-only under this feature because the user explicitly described assignment-based task membership; Lists remain available through Lists and Search unless clarified otherwise.
- Explicitly selecting another assignee or otherwise constructing a cross-user expression automatically expands evaluation to all readable content and visibly communicates that expansion.
- A direct deep link is a deliberate retrieval action and may open readable public content without altering default discovery or Personal Stack membership.
- Search's default scope applies to Tasks, Lists, and List Items. For Tasks, personal content means assigned to the viewer; for Lists, personal content means owned Lists; group content means Tasks associated with an active group or Lists shared with an active group. Assignee conditions do not match Lists.
- Existing authentication, directory, group membership, synchronization, encryption, backup, and audit capabilities will be extended rather than replaced.
- No new required browser matrix will be added without measuring the current and proposed test counts and timing; exhaustive combinations remain in non-PR release gates.
