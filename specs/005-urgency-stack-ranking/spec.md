# Feature Specification: Urgency Levels and Stack Ranking

**Feature Branch**: `not created`

**Created**: 2026-08-04

**Status**: Ready for planning

**Input**: User description: "Add urgency levels (extra low, low, medium, high, critical), add stack ranking independent of urgency, allow filtering by urgency level, and add urgency levels to all existing reporting."

## Clarifications

### Session 2026-08-04

- Q: What collection is being stack-ranked? → A: Maintain an overall stack and a separate stack per Project; an item can be first in its Project and fifth overall.
- Q: Who controls stack ranks? → A: Every user has personal overall and Project stack ranks for authorized work; one user's ranking does not affect another user's ranking.
- Q: How does reordering work while search or filters hide some stack items? → A: Visible matching items reorder among their existing occupied positions; hidden, unauthorized, and nonmatching items retain their positions.
- Q: How should historical completions without urgency appear in reports? → A: No legacy handling is needed because there are no existing work items or completion events at rollout.
- Q: Which active items appear in each user's personal stacks? → A: The overall stack includes all authorized visible active work, and each Project stack includes all authorized visible active work in that Project.

### Session 2026-08-05

- Q: Can work that becomes active, authorized, or Project-assigned enter a non-tail position as part of the same membership change? → A: No. Each applicable personal stack first admits the work at its bottom; the user may move it elsewhere only through a separate explicit reorder after admission succeeds.
- Q: Where must personal stack-rank changes be recorded? → A: Record each accepted rank change as an owner-private Personal Stack Operation; personal rank changes are never shared Work Revisions and are never visible to other users.
- Q: Which work types create counted Completion Events? → A: To-dos and subtasks only; finishing or archiving a List does not create a Completion Event, although List urgency remains available in current workload, archive, Category, Project, drill-down, and export reporting wherever Lists already appear.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set Work Urgency (Priority: P1)

An authorized editor can assign one of five urgency levels—Extra Low, Low, Medium, High, or Critical—to a to-do, subtask, or List so that its time sensitivity and consequence are immediately clear wherever the work appears.

**Why this priority**: A consistent urgency signal is the foundation for filtering, ranking context, and reporting.

**Independent Test**: Create and edit work at every urgency level, then verify that the saved level is visible and consistently labeled in all supported active and archived views.

**Acceptance Scenarios**:

1. **Given** an authorized user creates a to-do, subtask, or List, **When** the user selects an urgency level and saves, **Then** that exact level is retained and displayed with the work.
2. **Given** a user creates work without explicitly selecting urgency, **When** it is saved, **Then** its urgency defaults to Medium.
3. **Given** a user changes a work item's urgency, **When** the change is accepted, **Then** every active view shows the new level and the revision history identifies the change without altering its stack rank.
4. **Given** color is used to help distinguish urgency, **When** the level is viewed with reduced color perception or assistive technology, **Then** the full text label remains available and color is not the only indicator.

---

### User Story 2 - Stack Rank Work Independently (Priority: P1)

Each user can place authorized active work into a personal overall order and, for Project-assigned work, an independent personal order within that Project. Stack rank is a deliberate planning decision independent of urgency, so an Extra Low item may appear above a Critical item and an item may be first in its Project while fifth overall for the same user. Another user may rank the same item differently.

**Why this priority**: Urgency alone does not express the user's chosen execution order; the stack provides a single unambiguous answer to what comes next.

**Independent Test**: Arrange work containing all five urgency levels in the overall and Project stacks, including Extra Low above Critical and one item ranked differently in each stack, then reload and synchronize it and verify both relative orders are preserved.

**Acceptance Scenarios**:

1. **Given** several authorized active items, **When** a user moves one item above or below another in the personal overall stack, **Then** the resulting personal order is saved and remains stable across views, reloads, and supported devices without changing another user's order.
2. **Given** an Extra Low item below a Critical item, **When** the Extra Low item is moved above the Critical item, **Then** the system accepts and preserves that order without changing either urgency level.
3. **Given** a user changes an item's urgency, **When** the change is saved, **Then** the item retains its existing overall and Project stack positions unless the user separately reorders it.
4. **Given** a Project-assigned item, **When** it is ranked first in its Project and fifth overall, **Then** each view preserves and clearly identifies the applicable independent position.
5. **Given** a filtered or searched view, **When** the user reorders matching items, **Then** those items take one another's previously occupied positions in the applicable personal stack while hidden, unauthorized, and nonmatching items retain their positions.
6. **Given** a newly created or restored active item becomes visible to a user, **When** it enters that user's overall stack or an applicable Project stack, **Then** it appears at the bottom of each entered personal stack until that user explicitly reorders it.
7. **Given** two users can view the same item, **When** each assigns it different overall and Project ranks, **Then** each user continues to see only their own chosen order and neither ranking changes the shared work item.
8. **Given** active work is authorized and visible to a user but is owned by or assigned to someone else, **When** the user's stacks load, **Then** the work appears in the personal overall stack and in its applicable personal Project stack and can be personally ranked without granting edit rights.
9. **Given** a user completes an accepted overall or Project stack move, **When** the rank change is recorded, **Then** it is stored as that user's private Personal Stack Operation and not as a shared Work Revision visible to collaborators.

---

### User Story 3 - Filter by Urgency (Priority: P2)

A user can narrow authorized work to one or more urgency levels and combine that choice with existing search and filters while preserving stack order among the matching items.

**Why this priority**: Users need to focus on a chosen urgency range without losing the explicit execution order they established.

**Independent Test**: Apply every single-level and representative multi-level urgency selection together with existing date, assignee, Category, Project, archive, and search criteria, then verify the authorized result set and order.

**Acceptance Scenarios**:

1. **Given** authorized work at all five levels, **When** the user selects High and Critical, **Then** only matching authorized work appears in the user's applicable personal stack order.
2. **Given** urgency and other filters are active, **When** one criterion is changed or cleared, **Then** the remaining criteria stay active and the result set updates accurately.
3. **Given** no urgency levels match, **When** the filter is applied, **Then** the user sees a clear empty state and can remove or change the filter.
4. **Given** the user is offline with previously synchronized work, **When** urgency filters are applied, **Then** filtering works locally over the authorized cached data and clearly reflects any pending urgency changes.

---

### User Story 4 - Report on Urgency (Priority: P2)

Users reviewing any existing workload, completion, Category, Project, archive, dashboard, drill-down, or export report can see and filter by urgency and understand how totals break down across the five levels.

**Why this priority**: Urgency must be a consistent reporting dimension rather than a field visible only during day-to-day task handling.

**Independent Test**: Populate active work at all supported levels and completed to-dos and subtasks at all urgency levels, including later urgency changes, then verify every existing report displays the applicable urgency context, offers the level filter, and produces correct breakdowns and totals. Finish or archive a List and verify that no Completion Event is counted for the List while its urgency remains visible in non-completion reports that include Lists.

**Acceptance Scenarios**:

1. **Given** an existing report containing authorized work at multiple levels, **When** the report opens, **Then** it provides an urgency breakdown using all five standard labels and a total that matches the sum of the breakdown.
2. **Given** a user selects one or more urgency levels in a report, **When** the report refreshes, **Then** its totals, charts, rows, drill-downs, and export include only matching authorized records.
3. **Given** a to-do was Critical when completed and later has a different urgency after restoration, **When** a historical completion report is viewed, **Then** the report uses and identifies the urgency captured at completion rather than silently rewriting history.
4. **Given** a current workload detail report, **When** rows are displayed, **Then** each row exposes its current urgency and applicable overall and Project stack positions and may be ordered by either rank without implying that urgency determined that order.
5. **Given** archived Categories, Projects, or work, **When** an authorized historical report is run, **Then** urgency remains available using the same labels, filters, and authorization rules as active reporting.
6. **Given** a List has an urgency and is later finished or archived, **When** historical completion reporting is viewed, **Then** the List does not create a Completion Event or completion count, while its urgency remains available in archive and other non-completion reporting that includes Lists.

### Edge Cases

- Two clients belonging to the same user reorder overlapping portions of that user's overall or Project stack while one or both are offline.
- Two different users rank the same authorized item differently at the same time.
- An urgency edit and a stack-rank move for the same item synchronize in a different order.
- A task is completed, archived, restored, reassigned, or permanently deleted while a filtered stack is open.
- An item moves into, out of, or between Projects while its overall rank remains valid.
- A subtask's urgency differs from its parent task, or a List is finished or archived: the subtask creates its own counted Completion Event when completed, while the List never creates one and retains its urgency only in reports that include Lists as work records.
- A newly created item relies on the default urgency while another client immediately edits or ranks it.
- A filtered result omits unauthorized or nonmatching records that sit between two matching items; reordering the matching items must not move the omitted records.
- A report has no records at one or more urgency levels, or its entire result is empty.
- Stack sizes reach the target data volume, and items are repeatedly moved between the first and last positions.
- Current Chrome and Safari/WebKit differ in drag-and-drop, touch reordering, keyboard interaction, offline storage, or accessible announcements.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every to-do, subtask, and List MUST have exactly one urgency level chosen from Extra Low, Low, Medium, High, and Critical.
- **FR-002**: Newly created work MUST default to Medium when the user does not explicitly select another urgency level.
- **FR-003**: Authorized editors MUST be able to set or change urgency during creation and editing, and an urgency change MUST NOT automatically change stack rank, due date, assignment, Category, Project, completion state, or archive state.
- **FR-004**: Every visible urgency indicator MUST include an accessible text label. Color, icon shape, position, or abbreviation MAY reinforce the level but MUST NOT be the only way to distinguish it.
- **FR-005**: For every user, every active to-do, subtask, and List that the user is authorized to view MUST have one canonical relative position in that user's personal overall stack, regardless of owner or assignee and independent of urgency and every other user's positions.
- **FR-006**: For every user, every active Project-assigned work item that the user is authorized to view MUST also have one canonical relative position within that user's personal stack for the Project, regardless of owner or assignee. A user's overall and Project positions MUST be independent, so changing one MUST NOT change the other.
- **FR-007**: A user MUST be able to move any authorized visible active item to any position in each applicable personal stack, including placing any lower-urgency item above any higher-urgency item, without changing the shared work item, its urgency, its position in the user's other stack, or any other user's positions. Ranking permission derives from authorized visibility and does not grant permission to edit shared work content.
- **FR-008**: Work that newly becomes active and authorized for a user MUST first enter the bottom of that user's overall stack and, when Project-assigned, the bottom of that user's applicable Project stack. Activation, restoration, authorization, and stack admission MUST NOT also assign a different position. After admission succeeds, the user MAY move the work through a separate explicit personal-ranking action governed by FR-007 and FR-011.
- **FR-009**: Completing, archiving, becoming unauthorized to view, or permanently deleting an item MUST remove it from each affected user's active personal stacks without disturbing the relative order of remaining items. If it is restored or becomes authorized again, it MUST follow FR-008.
- **FR-010**: Assigning or moving an active item to a Project MUST preserve each authorized user's personal overall position, remove any former Project-stack position, and first place it at the bottom of that user's destination Project stack. After Project-stack admission succeeds, that user MAY move it through a separate explicit personal-ranking action. Removing its Project assignment MUST preserve each user's overall position and remove its Project-stack position.
- **FR-011**: The system MUST preserve deterministic accepted personal overall and Project stack orders across reloads, supported devices, offline synchronization, retries, and duplicate submissions. Conflicting reorder operations from the same user MUST never silently discard an accepted change and MUST either resolve deterministically with visible outcome or surface an actionable conflict; different users' rank changes MUST remain independent and require no conflict resolution between them.
- **FR-012**: Users MUST be able to filter active and archived authorized work by one or more urgency levels, and urgency filtering MUST combine with existing search, date, assignee, Category, Project, lifecycle, and other applicable filters.
- **FR-013**: Filtered and searched results MUST preserve the relative order of matching items from the viewing user's applicable overall or Project stack. Applying, changing, or clearing criteria without reordering MUST NOT mutate either personal canonical stack order. When the user explicitly reorders filtered or searched results, only the visible matching items MUST be permuted among the personal stack positions those matching items occupied before the move; hidden, unauthorized, and nonmatching items MUST retain their positions.
- **FR-014**: Urgency filtering MUST work offline for previously synchronized authorized data, including locally pending urgency changes, with visible pending, synchronized, failed, and conflicted states.
- **FR-015**: All existing workload counts, completion dashboards, Category reports, Project reports, archive reports, drill-downs, and report exports MUST support urgency as a visible reporting dimension and as a single- or multi-level filter wherever record-level filters are supported. Completion dashboards and their detail rows apply urgency to counted to-do and subtask Completion Events; report types that already contain Lists MUST continue to include List urgency.
- **FR-016**: Every applicable aggregate report MUST show counts for Extra Low, Low, Medium, High, and Critical within the authorized result set; omitted zero-value levels MUST remain discoverable, and the sum of level counts MUST equal the report total.
- **FR-017**: Only to-dos and subtasks MUST create counted Completion Events. Historical completion reporting MUST use the urgency captured at each such event. Reopening a to-do or subtask MUST reverse that event according to existing lifecycle rules, and a later re-completion MUST capture the urgency current at the new Completion Event. Finishing, archiving, reopening, or restoring a List MUST NOT create, reverse, or recreate a Completion Event for the List itself.
- **FR-018**: Current workload reports and detail rows MUST use current urgency. Reports MUST clearly identify whether urgency reflects current state or historical completion state when both interpretations are possible.
- **FR-019**: Report detail rows and applicable exports MUST expose the viewing user's current overall position and, for Project-assigned active work, that user's current Project position. Applicable reports MUST permit ordering by either personal rank without describing stack rank as derived from urgency. Aggregate reports MUST NOT calculate an average or implied numerical score from categorical urgency levels.
- **FR-020**: Urgency changes MUST be recorded in immutable shared Work Revision history. Each accepted change to either personal stack rank MUST instead be recorded as an owner-private Personal Stack Operation containing the ranking user, time, safe prior and resulting positions, source, and synchronization outcome. Personal Stack Operations MUST NOT be represented as Work Revisions, shared as work-item edits, or exposed to other users.
- **FR-021**: Search, filtering, personal stack positions, counts, reports, exports, caches, synchronization responses, and histories MUST enforce existing ownership, privacy, group, lock, and hidden-content authorization boundaries and MUST NOT reveal unauthorized work or another user's ranks through rank gaps or aggregate differences.
- **FR-022**: User-visible controls and documentation MUST explain that urgency communicates time sensitivity or consequence while overall and Project stack ranks communicate chosen execution order, and that none automatically controls another.
- **FR-023**: Existing integrations and synchronized representations that cannot carry urgency or either stack rank MUST preserve those Na'aseh values without loss and MUST NOT infer or overwrite one value from another.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: Existing ownership, edit, group, privacy, lock, hidden-memo, report, and export permissions MUST apply to urgency. A user may rank only work they are authorized to view, and personal ranks MUST be visible only to that user. Reordering MUST NOT grant content-edit permission or reveal unauthorized work or another user's ranks. Operational logs MUST exclude task content, urgency values tied to identifiable protected work, personal rank values, and report contents.
- **NFR-002 Data Durability & Recovery**: Accepted urgency edits, overall and Project stack reorders, completion-time urgency snapshots, and histories MUST be durable, retry-safe, included in backup and recovery, and protected from silent loss. Recovery MUST restore the same relative overall and Project stack orders and historical reporting totals.
- **NFR-003 Offline Support**: Previously authorized urgency, overall and Project stack orders, and urgency-aware reports MUST remain readable offline. Authorized urgency edits and reorders made offline MUST survive browser restart, synchronize visibly after reconnection, and either merge deterministically or surface an actionable conflict.
- **NFR-004 Browser & Responsive Support**: Urgency selection, multi-level filtering, stack reordering, reporting breakdowns, and accessible labels MUST work in current stable Chrome and Safari/WebKit at desktop, iPhone, and iPad sizes. Every pointer or touch reordering journey MUST have a keyboard-accessible alternative and an assistive-technology announcement of the result.
- **NFR-005 Errors & Observability**: Users MUST receive actionable errors for failed urgency edits, reorders, filters, synchronization, and report calculations. Structured Amazon CloudWatch events MUST include safe correlation identifiers, operation class, outcome, timing, retry/conflict status, and non-sensitive error context. Metrics and alarms MUST cover repeated reorder-conflict, synchronization, and report-consistency failures.
- **NFR-006 Performance**: With 50,000 authorized work records overall and 10,000 in one Project stack, 95% of urgency filter changes, first/last-position moves, list refreshes, and urgency-aware report changes MUST show a result or durable pending acknowledgement within one second on a supported mid-range device and degraded broadband connection.
- **NFR-007 AWS Architecture & Cost Impact**: Planning MUST evaluate managed serverless AWS options first and extend existing persistence, synchronization, reporting, backup, and observability capabilities where suitable. Cost analysis MUST include rank maintenance, urgency indexes, historical snapshots, filtering, report aggregation, backups, and logs; needless always-on capacity requires measured justification.

### Key Entities

- **Urgency Level**: One required categorical value—Extra Low, Low, Medium, High, or Critical—attached to each to-do, subtask, and List and displayed by a stable human-readable label.
- **Personal Overall Stack Position**: The canonical relative position assigned by one user to one authorized active work item across that user's overall stack, independent of urgency and inaccessible to other users.
- **Personal Project Stack Position**: The canonical relative position assigned by one user to one authorized active Project item within that user's stack for the Project, independent of the user's overall position, urgency, and every other user's ranks.
- **Work Item**: An existing to-do, subtask, or List extended with shared current urgency and related to personal overall and Project rank records while active and authorized; all existing ownership, assignment, privacy, lifecycle, Category, Project, and revision behavior remains in force.
- **Personal Stack Ranking**: A user-owned ordering relationship between the user and authorized active work, containing an overall position and an optional Project position without changing the shared work item.
- **Completion Event**: An existing record of a counted to-do or subtask completion, extended with the urgency in effect when completion was accepted, allowing stable historical urgency reporting. Lists do not create Completion Events.
- **Urgency Filter**: A saved or transient selection of one or more urgency levels that combines with existing criteria without mutating stack order.
- **Personal Stack Operation**: An owner-private immutable record of an accepted overall or Project stack-rank change, including the ranking user, affected work, stack scope, safe prior and resulting positions, source, time, and synchronization outcome. It is not a shared Work Revision.
- **Work Revision**: An existing immutable shared mutation record extended to represent urgency changes. Personal stack-rank changes are explicitly excluded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of creation, edit, archive, restore, and synchronization tests, every retained to-do, subtask, and List has exactly one valid urgency level, with newly created work defaulting to Medium when no other level is selected.
- **SC-002**: Users can place any Extra Low item above any Critical item and give one item different personal overall and Project positions in under 20 seconds; both chosen relative orders remain correct in 100% of reload, device-switch, filter, and successful synchronization tests without changing another user's ranks.
- **SC-003**: Changing urgency leaves both stack positions unchanged, and changing either stack position leaves urgency and the other stack position unchanged, in 100% of automated independence tests.
- **SC-004**: Single- and multi-level urgency filters return exactly the authorized matching records in the viewing user's personal relative stack order in 100% of test fixtures, including combinations with every existing applicable filter; filtered reordering changes only matching items' occupied slots in 100% of tests.
- **SC-005**: Urgency breakdowns equal their authorized record-level drill-downs and sum to the displayed total in 100% of active, archived, Category, Project, and export reporting tests for every work type those reports already contain, and in daily, weekly, and monthly completion-reporting tests for counted to-do and subtask Completion Events.
- **SC-006**: Historical completion reports retain the urgency captured at each counted to-do or subtask completion in 100% of tests involving later urgency edits, archive, restore, reassignment, reopen, and re-completion; Lists contribute no Completion Event or completion count in 100% of List lifecycle tests.
- **SC-007**: At least 90% of first-time users can explain the difference between urgency and stack rank and correctly rank a lower-urgency item above a Critical item without assistance in under one minute.
- **SC-008**: With the target data volume, at least 95% of urgency filters, stack moves, and urgency-aware report interactions show a result or durable pending acknowledgement within one second.
- **SC-009**: All primary urgency, filtering, reordering, and reporting journeys pass in current Chrome and Safari/WebKit at desktop, iPhone, and iPad sizes using keyboard, touch, and assistive technology.
- **SC-010**: In 100% of offline, retry, duplicate-delivery, and conflicting-reorder tests, accepted changes either converge to a visible deterministic order or surface an actionable conflict, with zero silently lost urgency or rank changes.
- **SC-011**: Security tests produce zero unauthorized task or other-user rank disclosures through urgency filters, rank positions or gaps, report totals, exports, offline caches, histories, synchronization, or operational logs.

## Assumptions

- Urgency is a shared work-item attribute governed by existing edit permissions; it is not a per-viewer preference.
- Every user has a private overall ordering of authorized active work and a private ordering of authorized active work within each Project. Authorized visibility permits personal ranking but does not grant permission to edit the shared work item; no user can view or change another user's ranks.
- Personal stacks include all authorized visible active work, not only work owned by or assigned to the viewing user.
- Urgency defaults to Medium for newly created work when the user makes no explicit selection.
- The production deployment has no existing work items or completion events when this feature is introduced, so legacy urgency and historical-completion backfill are out of scope.
- Each user's overall and Project stack orders are canonical and manual. Urgency, due date, creation date, assignee, Category, and filters never silently recompute them; activation, authorization, restoration, and Project membership changes admit applicable work at the stack bottom before any separate user-directed reorder, as specified in FR-008 and FR-010.
- Subtasks have their own urgency and applicable overall and Project stack positions rather than inheriting those values from the parent. Existing parent-governed lifecycle and permission rules remain unchanged.
- Lightweight List Items remain governed by their parent List and do not receive independent urgency or stack positions.
- “All existing reporting” includes the workload counts, personal completion dashboards, Category and Project reports, archive reports, detail drill-downs, and exports specified in prior features.
- Counted Completion Events and personal completion dashboards apply only to to-dos and subtasks. Lists retain urgency in current workload, archive, Category, Project, drill-down, and export reporting wherever those reports already include Lists, but List lifecycle changes do not create Completion Events.
- Historical reports use urgency captured at completion; current workload reports use current urgency. Stack position is meaningful only for active work and is not reconstructed as a historical aggregate.
- Existing Google Tasks synchronization does not natively determine Na'aseh urgency or stack rank; those fields remain authoritative in Na'aseh unless a later integration specification explicitly maps them.
- Existing authentication, ownership, assignment, privacy, groups, locking, archive, reporting, offline synchronization, backup, audit, and accessibility behavior is extended rather than replaced.
