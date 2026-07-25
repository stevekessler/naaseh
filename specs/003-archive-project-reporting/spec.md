# Feature Specification: Archive, Projects, and Completion Reporting

**Feature Branch**: `not created`

**Created**: 2026-07-24

**Status**: Ready for planning

**Input**: User description: "Archive finished to-dos and lists without deleting them; provide warned permanent deletion; replace the flat category model with Category and Project levels; preserve group permissions and historical statistics in archives; show roll-up counts, completion dashboards, category/project reporting, project end dates, editing, archiving, and hard deletion; and allow unclassified work."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Finish Work Without Losing It (Priority: P1)

An authenticated user completes a to-do and sees it leave active work for a global archive rather than being deleted. A user finishes a list and archives the list together with all of its lightweight list items. Archived work remains available according to the same ownership, privacy, and group permissions it had before archival.

**Why this priority**: Preserving completed work and its access boundaries is the foundation for trustworthy history and reporting.

**Independent Test**: Complete personal, group-associated, and locked to-dos; finish lists containing open and completed list items; verify active views, archives, restoration, permissions, and history online, offline, and after synchronization.

**Acceptance Scenarios**:

1. **Given** an active to-do, **When** an authorized user completes it, **Then** it is automatically moved out of active views into the global to-do archive with its fields, relationships, permissions, attachments, revisions, completion attribution, and timestamps intact.
2. **Given** an active list with lightweight list items, **When** its owner marks the list finished, **Then** the list and every contained list item are archived as one unit and no list item is added independently to the global to-do archive.
3. **Given** archived group-associated or locked work, **When** users with and without the required access browse, search, report on, or directly request it, **Then** the same authorization rules that apply to active work are enforced.
4. **Given** an archived to-do or list, **When** an authorized user restores it, **Then** it returns to active work with its relationships, content, permissions, and history intact.

---

### User Story 2 - Permanently Delete Work Deliberately (Priority: P1)

An authorized user can permanently delete a to-do or list when preservation is not wanted. Before deletion, the user sees a clear warning that names the target and explains that the content, history, attachments, and reporting contribution cannot be recovered.

**Why this priority**: Permanent deletion is explicitly required and must be difficult to trigger accidentally because there is no recycle bin.

**Independent Test**: Attempt permanent deletion from active and archived views as authorized and unauthorized users, cancel and confirm the warning, and verify that confirmed records cannot be searched, restored, synchronized, or included in reporting.

**Acceptance Scenarios**:

1. **Given** an authorized user selects delete, **When** the confirmation is shown, **Then** it identifies the target, summarizes all dependent data that will be removed, states that deletion is permanent, and offers distinct cancel and confirm actions.
2. **Given** the warning, **When** the user cancels, **Then** no data or statistics change.
3. **Given** the warning, **When** the user explicitly confirms, **Then** the target and its dependent content are permanently removed, no recycle-bin record is created, and the operation is auditable without logging protected content.
4. **Given** an offline user, **When** permanent deletion is requested, **Then** the system does not represent the deletion as final until server authorization and completion are confirmed.

---

### User Story 3 - Organize Work by Category and Project (Priority: P1)

An administrator manages a two-level tree. The top level is called Category, such as PAAO, and its children are called Projects, such as Network and API. To-dos and lists may be assigned to a Project, thereby inheriting its Category, or may remain unassigned.

**Why this priority**: The hierarchy supplies the organizational structure required by counts, reporting, deadlines, and filters.

**Independent Test**: Create two Categories with Projects that share a name, edit them, assign and unassign work, move a Project between Categories, and verify hierarchy, inheritance, access, and validation.

**Acceptance Scenarios**:

1. **Given** a Category named PAAO, **When** an administrator creates Network and API beneath it, **Then** the administration interface shows both as child Projects in a two-level tree.
2. **Given** PAAO already has an API Project, **When** an administrator creates an API Project under another Category, **Then** creation succeeds because Project names need be unique only within their parent Category.
3. **Given** a user assigns a to-do or list to PAAO → API, **When** it is saved, **Then** its Project is API and its Category is inherently PAAO without a separate Category selection.
4. **Given** a to-do or list with no Project, **When** it is saved, **Then** it remains valid and appears as unassigned in applicable filters and reports.
5. **Given** an existing Category or Project, **When** an administrator edits its allowed details, **Then** all linked active and archived records reflect the current organizational metadata without losing historical completion facts.

---

### User Story 4 - See Workload Counts and Project End Dates (Priority: P2)

A user can quickly see active to-do and list counts beside each Category and Project. Category counts roll up all Projects below them; Project counts include only work assigned to that Project. Project end dates and remaining-item counts make upcoming endings visible.

**Why this priority**: Immediate workload and deadline visibility turns the hierarchy into an operational planning tool.

**Independent Test**: Seed assigned and unassigned active and archived work across several Projects, then verify the tree counts, roll-ups, end dates, overdue states, and access filtering.

**Acceptance Scenarios**:

1. **Given** PAAO → API has three active to-dos and two active lists, **When** an authorized user views the tree, **Then** API shows both counts separately and PAAO includes those counts plus all other PAAO Projects.
2. **Given** archived or permanently deleted work, **When** active workload counts are shown, **Then** that work is excluded.
3. **Given** work the viewer may not access, **When** hierarchy counts are shown, **Then** neither the count nor any drill-down reveals that work.
4. **Given** a Project with an end date, **When** it is viewed in the tree, dashboard, or detail view, **Then** the date, whether it is upcoming or overdue, and its remaining active to-do and list counts are clear.

---

### User Story 5 - Review Personal Completion Statistics (Priority: P2)

An authenticated user opens a dashboard showing how many to-do items they completed per day, per week, and per month. The user can filter the statistics by Category or Project, including archived organizational entries, and can report at either hierarchy level.

**Why this priority**: Durable completion statistics provide the requested view of personal productivity and project progress.

**Independent Test**: Complete, reopen, archive, restore, reassign, and permanently delete fixtures across dates, users, Categories, and Projects; verify daily, weekly, monthly, Category, Project, and unassigned totals.

**Acceptance Scenarios**:

1. **Given** a user has completion activity across multiple dates, **When** the dashboard opens, **Then** it shows that user's daily, weekly, and monthly completion totals using the user's local time zone.
2. **Given** completions in PAAO → API and PAAO → Network, **When** PAAO is selected, **Then** the report includes both Projects; **when** PAAO → API is selected, **Then** it includes only that Project.
3. **Given** completed work or its Category or Project has been archived, **When** an authorized user runs the same report, **Then** its completion contribution remains present and filterable.
4. **Given** a completion is attributed to another user or is inaccessible to the viewer, **When** a personal dashboard or authorized aggregate report is calculated, **Then** attribution and visibility rules are applied without leaking protected information.

---

### User Story 6 - Archive or Permanently Delete Categories and Projects (Priority: P2)

An administrator can archive a Category or Project to remove it from active assignment while retaining linked work, access rules, and statistics. An administrator may also permanently delete an empty Category or Project after a detailed irreversible-action warning.

**Why this priority**: Organizational structures have their own lifecycle and must not erase history accidentally.

**Independent Test**: Archive and restore populated Categories and Projects, attempt assignments, report on their history, then permanently delete empty entries and verify naming and reporting behavior.

**Acceptance Scenarios**:

1. **Given** an active Project with linked work, **When** an administrator archives it, **Then** it and its links remain reportable but it cannot receive new assignments until restored.
2. **Given** a Category, **When** it is archived, **Then** all of its Projects become unavailable for new assignments while each Project and linked record retain their own data and status.
3. **Given** an archived Category or Project, **When** it is restored, **Then** it returns to active administration and assignment subject to parent state and authorization.
4. **Given** a Category or Project still containing child Projects or linked active or archived work, **When** hard deletion is requested, **Then** deletion is blocked and the administrator is shown what must be reassigned, unassigned, or permanently deleted first.
5. **Given** an empty Category or Project, **When** an administrator confirms its permanent deletion after the warning, **Then** it is irrecoverably removed with no recycle-bin entry.

### Edge Cases

- A to-do completion is saved while archival fails, or archival succeeds while the client loses confirmation.
- A user completes, reopens, and completes the same to-do across day, week, month, or daylight-saving boundaries.
- A list is marked finished while it has open list items or pending attachment uploads.
- A group is disabled, a membership is revoked, or a lock changes while archived data is cached offline.
- A Project is moved to another Category after completions already exist; historical reports must remain understandable while current organization reflects the move.
- A Category is archived while one of its Projects is already archived, or a Project restore is attempted while its Category remains archived.
- A Project end date is today, has passed, is removed, or is changed after the Project is archived.
- Two administrators create the same Project name under one Category concurrently, or create the same name under different Categories.
- Counts change while the tree is open, include thousands of records, or contain records inaccessible to the viewer.
- A permanent deletion is confirmed on one device while another device has pending edits to the same record.
- The browser is offline, storage is full, or synchronization conflicts with archive, restore, reassignment, completion, or deletion.
- Current Chrome and Safari/WebKit differ in date display, time-zone boundaries, tree controls, touch interaction, local storage, or background synchronization.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Completing a to-do or subtask MUST automatically archive it globally rather than delete it, preserving all content, relationships, attachments, revisions, authorization metadata, completion actor, and completion time.
- **FR-002**: A list owner MUST be able to mark a list finished, which MUST archive the list and all of its lightweight list items as one unit; lightweight list items MUST NOT appear as independent records in the global to-do archive.
- **FR-003**: Archived to-dos, subtasks, and lists MUST be excluded from active views and active workload counts by default but remain available in clearly identified archive views, authorized search, historical reports, and export where applicable.
- **FR-004**: Authorized users MUST be able to restore archived to-dos, subtasks, and lists with their data, relationships, completion history, and permissions intact.
- **FR-005**: Archival and restoration MUST NOT widen ownership, group, privacy, lock, attachment, edit, search, or reporting access. Current group membership and other current authorization rules MUST be evaluated whenever archived content is accessed.
- **FR-006**: Authorized users MUST be able to permanently delete active or archived to-dos and lists; permanent deletion MUST remove their dependent subtasks or list items, attachments, revisions, completion records, and reporting contributions and MUST create no recoverable recycle-bin entry.
- **FR-007**: Every permanent-delete action MUST require a warning that identifies the target, describes affected dependent data and statistics, states that recovery is impossible, and requires an explicit confirmation distinct from cancel.
- **FR-008**: Permanent deletion MUST require online authorization and a confirmed server outcome; offline clients MUST retain an explicit pending or failed state and MUST NOT present deletion as final prematurely.
- **FR-009**: The organizational hierarchy MUST contain exactly two assignable levels: top-level **Category** and child **Project**. Deeper nesting and Projects without a Category MUST be rejected.
- **FR-010**: Administrators MUST be able to create, view, and edit Categories and Projects in a tree-oriented administration interface.
- **FR-011**: Category names MUST be unique among Categories. Project names MUST be unique within a Category but MAY repeat under different Categories, including multiple Projects named API under different parents.
- **FR-012**: A to-do, subtask governed by its parent, or list MAY be assigned to one Project or left unassigned. Assigning a Project MUST inherently assign its parent Category; users MUST NOT independently select a conflicting Category.
- **FR-013**: Authorized users MUST be able to change or remove a Project assignment on active work. Archived work MUST preserve its assignment and be reassigned only after restoration.
- **FR-014**: Each Project MUST support an optional end date that can be added, edited, or removed and displayed with upcoming, ending-today, and overdue states.
- **FR-015**: Each active Category and Project visible to a user MUST show separate active to-do and active list counts. Project counts MUST include only directly assigned work; Category counts MUST equal the authorized roll-up across all of its Projects.
- **FR-016**: Project status views MUST show the Project end date and separate remaining active to-do and list counts. Archived and permanently deleted work MUST not count as remaining.
- **FR-017**: Users MUST be able to drill from a visible Category or Project count to the authorized records included in that count, and the displayed total MUST match the drill-down result.
- **FR-018**: The system MUST record completion activity for each user, including the completed to-do identity, completing user, completion time, Project and Category context, and reversal state. Reopening a to-do MUST reverse its prior counted completion; completing it again MUST create a new current completion event without double-counting the reversed event.
- **FR-019**: Each user MUST have a dashboard showing their counted to-do completions grouped per calendar day, calendar week, and calendar month in their local time zone.
- **FR-020**: Dashboard and reporting filters MUST support all authorized work, unassigned work, a selected Category including all its Projects, or one selected Project.
- **FR-021**: Authorized reporting MUST support Category-level roll-ups and Project-level detail and MUST preserve historical completion statistics when work, Categories, or Projects are archived.
- **FR-022**: Historical completion context MUST remain attributable to the Project and Category associated at completion time even if the work or Project is later moved; reports MUST clearly distinguish historical attribution from current organization when they differ.
- **FR-023**: Administrators MUST be able to archive and restore Categories and Projects. Archived entries MUST remain editable and reportable but MUST be unavailable for new assignments.
- **FR-024**: Archiving a Category MUST make every child Project unavailable for new assignments without silently changing each Project's own lifecycle state. A Project MUST NOT become assignable while its parent Category is archived.
- **FR-025**: Administrators MUST have a hard-delete function for Categories and Projects. Deletion MUST be blocked while the target has child Projects or any linked active or archived work, and the interface MUST identify the blocking relationships.
- **FR-026**: Hard deletion of an empty Category or Project MUST use the permanent-delete warning in FR-007, be irreversible, create no recycle-bin entry, and preserve an audit fact that the operation occurred without retaining the deleted business content.
- **FR-027**: Archived Categories and Projects MUST retain existing group-related access and visibility metadata, and their counts, tree presence, reports, searches, and linked archived work MUST enforce the same authorization boundaries as active content.
- **FR-028**: Search, filters, counts, dashboards, reports, direct access, offline caches, exports, and notifications MUST NOT disclose the existence, names, totals, dates, or activity of records the current user is not authorized to view.
- **FR-029**: Archive, restore, edit, assignment, completion, reversal, and permanent-delete operations MUST record actor, time, target reference, action, and outcome for audit without recording protected task content in operational logs.
- **FR-030**: Existing flat-category assignments MUST be migrated into the two-level model without data loss, with a deterministic Project assignment or explicit unassigned status documented during planning.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: Existing ownership, group, lock, privacy, and administrative boundaries MUST apply consistently to active, archived, counted, filtered, reported, cached, synchronized, and deleted representations. Aggregate values MUST be calculated only from records the viewer may access. Permanent deletion and Category/Project administration require explicit authorization and audit.
- **NFR-002 Data Durability & Recovery**: Archive, restore, completion, reassignment, and hierarchy edits MUST be durable, retry-safe, and included in backup and recovery. Multi-record list archival and Category state changes MUST be atomic from the user's perspective or expose a clear retriable failure without partial success. Confirmed hard deletions are intentionally excluded from application recovery and ordinary backups according to an operational purge policy defined during planning.
- **NFR-003 Offline Support**: Previously synchronized authorized active and archived data, hierarchy, counts, and reports MUST remain readable offline. Non-destructive pending changes MUST survive restart and synchronize visibly. Hard deletion requires connectivity. Conflicts involving completion, archive, restore, assignment, or hierarchy edits MUST be resolved deterministically or surfaced to the user without silent loss.
- **NFR-004 Browser & Responsive Support**: Tree administration, archive browsing, destructive warnings, dashboards, filters, counts, and date states MUST work in current stable Chrome and Safari/WebKit at desktop, iPhone, and iPad sizes using keyboard, touch, and assistive technology without horizontal page scrolling.
- **NFR-005 Errors & Observability**: Users MUST receive actionable errors for failed archive, restore, completion, reassignment, counting, reporting, and deletion operations. Structured Amazon CloudWatch events MUST include safe correlation identifiers, operation outcomes, timing, and non-sensitive error context while excluding names, task content, report values, secrets, and credentials. Metrics and alarms MUST cover repeated authorization, synchronization, reporting, and lifecycle failures.
- **NFR-006 Performance**: With 50,000 authorized work records and 1,000 Categories and Projects, 95% of hierarchy loads, count refreshes, archive searches, filter changes, and dashboard period changes MUST show a result or pending acknowledgement within one second on a supported mid-range device and degraded broadband connection. Confirmed multi-record operations MUST show progress when completion takes longer than two seconds.
- **NFR-007 AWS Architecture & Cost Impact**: Planning MUST evaluate managed serverless AWS options first and extend existing authorization, synchronization, backup, and observability capabilities where suitable. Cost analysis MUST include lifecycle history, completion events, count/report computation, indexes, backups, logs, and purge processing; needless always-on capacity requires measured justification.

### Key Entities

- **Category**: A unique top-level organizational entry with name, display metadata, lifecycle state, optional group-related access metadata, audit history, and child Projects.
- **Project**: A Category child with a name unique within that parent, optional end date, lifecycle state, optional group-related access metadata, historical identity, and assigned work.
- **To-do Item**: An existing task or subtask with active, completed/archived, restored, or permanently deleted lifecycle transitions and an optional Project assignment.
- **List**: An existing owner-controlled container with an optional Project assignment that archives and restores together with its lightweight List Items.
- **List Item**: An entry whose lifecycle is governed by its parent List; its completed state is preserved but it is not independently placed in the global to-do archive or personal to-do completion statistics.
- **Archive Record**: Preserved content and lifecycle metadata allowing authorized discovery, reporting, and restoration without changing security boundaries.
- **Completion Event**: A completion transition attributed to a user and time, with historical Category and Project context and a reversal state used for personal and aggregate statistics.
- **Workload Count**: An authorization-filtered count of active to-dos or lists at one Project or rolled up to its Category.
- **Deletion Audit Event**: Non-content evidence of an authorized or denied permanent-delete operation retained for security and operational accountability.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of completion tests, a successfully completed to-do appears in the authorized global archive with all fields, relationships, attachments, permissions, and completion attribution intact and disappears from active views without data loss.
- **SC-002**: In 100% of authorization tests, active and archived content, counts, reports, searches, direct requests, caches, and exports reveal no records or aggregates outside the viewer's ownership, group, lock, or privacy permissions.
- **SC-003**: At least 90% of first-time users can locate an archived item and restore it in under one minute without assistance.
- **SC-004**: Every tested permanent deletion requires an explicit irreversible-action warning; cancellation preserves 100% of data, and confirmation leaves no restorable application record or dependent attachment.
- **SC-005**: Administrators can create PAAO → API and a second Category → API, assign work, and find either Project in the tree in under two minutes, with 100% enforcement of two-level hierarchy and scoped-name rules.
- **SC-006**: Category and Project to-do/list counts exactly match their authorized drill-down results in 100% of test fixtures, including unassigned, archived, locked, group-associated, and permanently deleted work.
- **SC-007**: Daily, weekly, and monthly dashboard totals match the authoritative completion events in 100% of tests across local-time, daylight-saving, archive, restore, reassignment, reopen, and re-completion scenarios.
- **SC-008**: Category-level reports equal the authorized sum of their Project-level reports in 100% of test fixtures, while archived Categories and Projects retain their historical statistics.
- **SC-009**: At least 90% of users can identify the next-ending Project and its remaining work within 30 seconds using a desktop or supported mobile viewport.
- **SC-010**: With the target data volumes, 95% of hierarchy, archive, count, filter, and dashboard interactions show results or visible pending acknowledgement within one second.
- **SC-011**: All primary archive, restore, hierarchy, count, dashboard, report, and deletion-warning journeys pass in current Chrome and Safari/WebKit at desktop, iPhone, and iPad sizes, including keyboard, touch, offline, and synchronization-conflict variants.
- **SC-012**: In 100% of interruption tests, accepted non-destructive changes either synchronize successfully or surface an actionable conflict, with zero silently lost work and no offline hard deletion falsely shown as complete.

## Assumptions

- “To-do List item” means an existing to-do or subtask. Lightweight items inside a reusable List are List Items and archive only with their parent List.
- Completing a to-do automatically archives it. Finishing a List is an explicit list-level action; completing every List Item does not silently archive the List.
- The “global archive” is a unified authorized archive experience, not globally public visibility.
- Archived work can be restored. Permanent deletion is a separate deliberate action and has no application recycle bin.
- Permanent deletion of a List includes its List Items and attachments. Permanent deletion of a to-do includes its subordinate content and attachments. Category and Project hard deletion is limited to empty entries so organization deletion cannot silently cascade into user work.
- Administrators manage Categories and Projects, consistent with the baseline Category administration model. Existing permissions governing who may edit, archive, restore, or delete work remain in effect.
- Project names are unique case-insensitively within one Category; Category names are unique case-insensitively. Display spelling may be edited while preserving identity.
- Active counts show to-dos and Lists separately and exclude archived work. Project “items left” means the sum of its remaining active to-do and List counts, with both components visible.
- Personal completion statistics count to-do/subtask transitions attributed to the completing user, not List Item crossings or List archival. Reopening reverses the currently counted event; re-completion establishes a new counted event.
- Calendar weeks use the user's locale preference, defaulting to Monday through Sunday when no preference exists. Historical timestamps are stored independently of display time zone.
- Historical reporting uses the Category and Project context captured at completion time. Current workload views use current assignments.
- Existing authentication, groups, ownership, privacy, locking, search, offline synchronization, attachments, backups, and audit capabilities are extended rather than replaced.
