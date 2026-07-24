# Feature Specification: Na'aseh v1 Baseline

**Feature Branch**: `001-naaseh-v1-baseline`

**Created**: 2026-07-22

**Status**: Ready for planning

**Input**: User description: "Create the baseline specification for Na'aseh v1, including
authentication, task and category management, sharing, privacy, offline synchronization,
responsive list and post-it views, reminders, search, AWS serverless constraints,
CloudWatch logging, and GitHub Actions delivery."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Sign In Securely (Priority: P1)

A provisioned user opens Na'aseh and signs in with a username and password from a minimal,
branded login screen. After authentication, the user can access only data allowed by the
visibility rules.

**Why this priority**: Every other capability depends on secure identity and authorization.

**Independent Test**: Provision a user through the administrative backend, authenticate
with valid and invalid credentials, and verify that only an authenticated session reaches
task data.

**Acceptance Scenarios**:

1. **Given** a provisioned user, **When** the user submits the correct username and password,
   **Then** the user is authenticated and reaches the regular task list.
2. **Given** an invalid username or password, **When** sign-in is attempted, **Then** access
   is denied with a generic error that does not reveal which credential was incorrect.
3. **Given** the login screen, **When** it is displayed at any supported viewport,
   **Then** it contains the Na'aseh logo, username input, password input, and sign-in action
   without account registration or password-management controls.

---

### User Story 2 - Manage Tasks and Subtasks (Priority: P1)

An authenticated user creates, views, edits, completes, and organizes tasks and subtasks.
The user can capture enough context to act on a task and can review its change history.

**Why this priority**: Creating and completing durable tasks is the core product value.

**Independent Test**: Create a task with every supported field, add and complete a subtask,
edit and complete the parent task, and verify the saved values and revision history.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** the user creates a task with a label, link,
   memo, due date and time, assignee, and category, **Then** the task is saved with its
   creation date and appears in the regular task list.
2. **Given** an existing task, **When** the user adds or updates a subtask, **Then** the
   relationship and changes are durable and visible from the parent task.
3. **Given** an existing task, **When** any tracked field or completion state changes,
   **Then** an immutable revision entry identifies the change, time, and acting user.
4. **Given** a due task, **When** its due time arrives and notification permission exists,
   **Then** the user receives an in-browser reminder even if Internet access is unavailable.

---

### User Story 3 - Work Offline and Synchronize (Priority: P1)

An authenticated user continues viewing and changing available task data in the browser
without Internet access. When connectivity returns, Na'aseh synchronizes pending changes
without silently losing work.

**Why this priority**: Browser offline operation is a mandatory reliability requirement.

**Independent Test**: Load the app online, disconnect it, create and edit tasks, close and
reopen the browser, restore connectivity, and verify that all pending changes synchronize
or produce a visible conflict requiring resolution.

**Acceptance Scenarios**:

1. **Given** a user has previously loaded authorized task data, **When** Internet access is
   lost, **Then** the user can view that data and create, edit, complete, search, and filter
   tasks locally.
2. **Given** locally pending changes, **When** Internet access returns, **Then** Na'aseh
   synchronizes them, updates status visibly, and preserves a revision record.
3. **Given** conflicting offline and remote edits, **When** synchronization runs, **Then**
   neither change is silently discarded and the conflict is resolved deterministically or
   presented for user resolution.
4. **Given** a synchronization failure, **When** automatic retry cannot complete it,
   **Then** pending work remains locally durable and the user sees an actionable error.

---

### User Story 4 - Back Up and Recover All Data (Priority: P1)

An administrator can recover Na'aseh after data loss or infrastructure failure without
losing tasks or rendering encrypted hidden memos permanently unreadable.

**Why this priority**: Task data and the cryptographic material needed to decrypt it are
equally essential. A backup that cannot decrypt restored content does not prevent data loss.

**Independent Test**: Restore an isolated Na'aseh environment from backups after removing
the active data store and active application key access, then verify users, groups,
categories, tasks, revisions, private-task boundaries, and authorized hidden-memo decryption.

**Acceptance Scenarios**:

1. **Given** production task and identity data, **When** automated backup runs, **Then** it
   captures all durable records and the encrypted or wrapped cryptographic recovery material
   required to restore protected content.
2. **Given** a simulated loss of the active data store, **When** the documented recovery
   procedure runs, **Then** the restored service meets the recovery objectives and authorized
   users can access all recovered content they could access before the failure.
3. **Given** restored private tasks and hidden memos, **When** recovery is validated,
   **Then** authorization and PIN-unlock boundaries remain enforced and plaintext protected
   content does not appear in backup files, recovery output, or logs.
4. **Given** cryptographic key rotation or retirement, **When** older backed-up data is
   restored, **Then** retained key-version and wrapping metadata permits authorized recovery.

---

### User Story 5 - Find and Focus Tasks (Priority: P2)

An authenticated user searches accessible tasks by label or memo and filters them by date,
date range, assignee, or category in order to focus on relevant work.

**Why this priority**: A task system becomes difficult to use once task volume grows unless
users can quickly retrieve a useful subset.

**Independent Test**: Seed tasks spanning labels, memo text, dates, assignees, categories,
privacy states, and hidden memos; exercise each filter alone and in combination, online and
offline; and verify that unauthorized content never appears.

**Acceptance Scenarios**:

1. **Given** accessible tasks, **When** a user searches by full or partial label or memo
   text, **Then** matching authorized tasks are returned.
2. **Given** accessible tasks, **When** a user filters by one or more supported criteria,
   **Then** only tasks satisfying all active criteria appear and active filters are visible.
3. **Given** private or PIN-concealed content the user has not unlocked, **When** a search is
   run, **Then** result text, counts, and highlighting do not disclose protected content.

---

### User Story 6 - Switch Between List and Post-it Views (Priority: P2)

An authenticated user views the same task collection as a regular task list or as responsive
post-it notes. Category colors visually connect tasks to their category.

**Why this priority**: The two views support different ways of scanning and organizing work
without changing the underlying tasks.

**Independent Test**: View the same categorized tasks in both modes across desktop, iPhone,
and iPad sizes; complete a task in post-it mode; and verify color, animation, accessibility,
and persistence.

**Acceptance Scenarios**:

1. **Given** categorized tasks, **When** post-it mode is selected, **Then** each task uses its
   category color by default and remains readable at every supported viewport.
2. **Given** a task in post-it mode, **When** it is completed, **Then** a crumpling post-it
   animation communicates completion and the completion is persisted.
3. **Given** reduced-motion preferences, **When** a post-it task is completed, **Then** an
   equivalent non-motion completion treatment replaces the crumpling animation.
4. **Given** either view, **When** the user switches modes, **Then** the active search,
   filters, and visible task set remain consistent.

---

### User Story 7 - Share Work and Protect Private Tasks (Priority: P2)

Users collaborate through groups while retaining the ability to make a task visible only to
its owner. By default, non-private tasks follow the v1 shared-visibility rule.

V1 uses discoverable self-join groups rather than targeted invitations. Discovering a group
does not grant membership: a user accepts participation by explicitly joining and supplying
the group PIN when one is configured. The group owner may revoke membership. A task may carry
an optional group association for organization and assignment context, but that association
does not hide a non-private task and does not itself grant permission to edit the task; the
task owner remains the only user who can change its content or privacy state in v1.

**Why this priority**: Sharing is required in v1, and its authorization boundaries must be
correct before collaborative data is introduced.

**Independent Test**: Create users and a PIN-protected group, create non-private and private
tasks under multiple users, change membership, and verify visibility from every affected
account online and offline.

**Acceptance Scenarios**:

1. **Given** multiple active users, **When** a non-private task is created or associated with
   a group, **Then** every active user can discover and view it regardless of group membership.
2. **Given** a task owner, **When** the owner marks the task private, **Then** no other user
   can discover, retrieve, search, or infer the task or its revisions.
3. **Given** a group with a PIN, **When** a non-member attempts to join it, **Then** the
   correct PIN is required, and repeated incorrect attempts are rate limited and logged.
4. **Given** a group membership change, **When** the affected user next accesses cached or
   live data, **Then** group participation privileges and group-targeted behavior update, while
   visibility of non-private tasks remains unchanged.
5. **Given** an active user, **When** the user discovers a joinable group and explicitly joins,
   **Then** that action records acceptance of membership, requires the configured group PIN,
   and does not grant access to private tasks or ownership-only task mutations.
6. **Given** a group-associated non-private task, **When** a non-member views the global task
   collection, **Then** the task remains visible, while group-only organization and membership
   management remain unavailable to that non-member.

---

### User Story 8 - Protect Sensitive Memos with a PIN (Priority: P2)

A user marks a task memo as hidden so that revealing it requires the user's PIN, including
when the authorized task is available offline.

**Why this priority**: Memo concealment is an explicit privacy capability whose guarantees
must be understandable and consistent online and offline.

**Independent Test**: Hide a memo, lock and unlock it with correct and incorrect PINs online
and offline, search for its text before and after unlocking, and inspect logs and other user
sessions for leakage.

**Acceptance Scenarios**:

1. **Given** a hidden memo, **When** it is displayed in a locked state, **Then** its contents
   are concealed until the current user supplies the correct PIN.
2. **Given** a hidden memo, **When** an incorrect PIN is supplied repeatedly, **Then** access
   remains denied, attempts are rate limited, and no memo content is logged.
3. **Given** an offline authorized session with the encrypted memo package cached, **When**
   the correct PIN is supplied, **Then** the memo is decrypted locally without contacting
   the service and plaintext is retained only for the minimum active viewing period.
4. **Given** copied browser storage containing a hidden memo, **When** the PIN-derived key is
   unavailable, **Then** the memo remains cryptographically unreadable.

---

### User Story 9 - Administer Users and Categories (Priority: P3)

An administrator provisions user accounts through the backend and centrally manages the
categories used by every task.

**Why this priority**: Controlled provisioning and consistent category metadata support the
primary workflows but do not independently deliver task management.

**Independent Test**: Provision a user with all required profile fields, create and edit a
category, and verify authentication, default assignment, and category color behavior.

**Acceptance Scenarios**:

1. **Given** authorized backend administration access, **When** an administrator creates a
   user with username, initial password, picture, and PIN, **Then** the user can authenticate
   and the supplied secrets cannot be retrieved in plaintext.
2. **Given** central category administration, **When** a category is created or updated with
   a name, default assignee, and color, **Then** those values are available consistently to
   task creation and both task views.
3. **Given** a category with a default assignee, **When** a user creates a task in that
   category without choosing an assignee, **Then** the default assignee is applied and can be
   explicitly changed before saving.
4. **Given** an authorized operator, **When** the operator runs the Python user-creation
   command with a username, securely supplied password, and selected `user` or `admin` role,
   **Then** exactly one account is created and no password or PIN appears in arguments, output,
   logs, or shell history.
5. **Given** an authenticated non-admin user, **When** that user attempts to add or administer
   users or create, update, or archive categories, **Then** the operation is denied; an
   application administrator may perform those operations but gains no additional access to
   another user's private tasks or hidden-memo plaintext.

### Edge Cases

- A username differs from an existing username only by case or surrounding whitespace.
- A user, assignee, category, or group is disabled or removed while referenced by tasks.
- A task or subtask is edited concurrently in multiple browsers or while one browser is offline.
- A subtask relationship would create a cycle or attach a task beneath itself.
- An entered link is malformed or uses an unsafe protocol.
- A due time falls in a daylight-saving transition or the user changes time zones offline.
- Notification permission is denied, revoked, or unavailable in the current browser state.
- The browser is offline long enough for the authenticated session or cached authorization
  information to expire.
- Group membership or private status changes while another browser retains cached task data.
- A hidden memo matches a search query while it remains locked.
- Category color is missing, invalid, or lacks sufficient contrast for readable text.
- Reduced-motion mode is enabled when a task is completed in post-it view.
- A synchronization batch partially succeeds, is retried, or arrives out of order.
- Browser storage is full, cleared, unavailable, or interrupted during a local write.
- A database backup restores successfully but a current or historical wrapping key is missing.
- A cryptographic key is rotated, disabled, scheduled for deletion, or unavailable during recovery.
- A backup or restore operator attempts to view private-task or hidden-memo plaintext.
- Verbose logging is unset, false, malformed, or enabled during an authentication or memo flow.
- Chrome and Safari/WebKit differ in notification, background execution, storage, or installability support.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST present a responsive login screen containing the Na'aseh logo,
  username input, password input, and sign-in action.
- **FR-002**: The system MUST authenticate provisioned users by username and password and
  MUST return a generic failure for invalid credentials.
- **FR-003**: User accounts MUST be provisioned through an authorized backend operation with
  a unique username, initial password, profile picture, and user PIN.
- **FR-004**: The system MUST support centrally managed categories with a unique name,
  default assignee, and accessible display color.
- **FR-005**: Users MUST be able to create, view, edit, complete, and organize tasks with a
  label, link, memo, creation date, optional due date and time, assignee, category, privacy
  state, memo-hidden state, and synchronization state.
- **FR-006**: Tasks MUST support subtasks, MUST prevent cyclic parent relationships, and MUST
  preserve each subtask's independent completion state and revision history.
- **FR-007**: Every task and subtask mutation MUST append an immutable revision record with
  the acting user, timestamp, changed fields, prior and resulting values where safe, source
  client, and synchronization outcome.
- **FR-008**: Users MUST be able to switch between a regular task list and a post-it view
  without changing the active task set, search, or filters.
- **FR-009**: Post-it notes MUST default to the associated category color and MUST use a
  crumpling animation when completed unless reduced-motion preferences require a non-motion alternative.
- **FR-010**: Users MUST be able to search all authorized tasks by label and memo and filter
  them by exact date, date range, assignee, and category, online and offline.
- **FR-011**: The system MUST schedule in-browser reminders for task due dates and times so
  supported browsers can deliver them without Internet access after permission is granted.
- **FR-012**: The system MUST preserve task changes made offline and synchronize them when
  Internet access returns, with visible pending, synchronized, failed, and conflicted states.
- **FR-013**: The system MUST never silently discard conflicting changes and MUST preserve
  enough revision information to recover or resolve each version.
- **FR-014**: Users MUST be able to create groups and set an optional group PIN. When set,
  the PIN MUST be required for a non-member to join the group, but MUST NOT hide non-private
  tasks or authorize group-administration actions. V1 groups MUST be discoverable self-join
  groups with no targeted invitation workflow; an explicit successful join is membership
  acceptance, and the group owner MUST be able to revoke membership.
- **FR-015**: Group PINs MUST be stored only as one-way hashes with a unique random salt,
  MUST never be logged, and MUST be subject to rate limiting and access auditing.
- **FR-016**: Every active user MUST be able to discover and view every non-private task,
  including tasks associated with groups to which the user does not belong. Groups organize
  collaboration but MUST NOT restrict the default visibility of non-private tasks. A group
  association MUST NOT grant task-edit or privacy-management permission; those mutations
  remain owner-only in v1.
- **FR-017**: A task owner MUST be able to mark a task private, after which only that owner
  can discover, retrieve, search, synchronize, or view the task and its revision history.
- **FR-018**: A task memo MUST be markable as hidden, MUST be stored and cached only as
  authenticated ciphertext, and MUST require the current user's PIN to unlock its randomly
  generated data-encryption key before its contents are revealed online or offline.
- **FR-019**: User PIN verifiers MUST be stored only as one-way hashes with a unique random
  salt and MUST never be logged. PIN-derived key-encryption keys MUST use a memory-hard,
  well-maintained cryptographic implementation and MUST NOT be stored. Online PIN attempts
  MUST be rate limited; offline design MUST document the residual brute-force risk.
- **FR-020**: The interface MUST use `assets/naaseh_logo.png` as the authoritative logo and
  MUST derive its core visual palette from colors present in that asset.
- **FR-021**: The application MUST provide actionable errors for failed authentication,
  storage, synchronization, reminder, search, and authorization operations without exposing
  protected data.
- **FR-022**: An administrator MUST be able to disable a user and revoke that user's active
  access without deleting historical task attribution.
- **FR-023**: The system MUST automatically back up users, groups, memberships, categories,
  tasks, subtasks, revisions, synchronization state, reminders, and configuration required
  for recovery.
- **FR-024**: Backups MUST include hidden-memo ciphertext, wrapped data-encryption keys,
  independent recovery wrapping, salts, non-secret derivation parameters, key identifiers,
  key versions, and rotation metadata required to decrypt restored content through an
  authorized recovery process.
- **FR-025**: Backup and recovery processes MUST preserve private-task and hidden-memo
  authorization boundaries and MUST NOT expose plaintext secrets or protected content to
  backup storage, routine operators, command output, or logs.
- **FR-026**: The system MUST retain sufficient historical cryptographic material to restore
  every retained backup after normal key rotation, while preventing retired keys from being
  used for new encryption.
- **FR-027**: The repository MUST provide `scripts/create_user.py` for authorized user
  provisioning. It MUST accept a username and `user` or `admin` role, securely collect or read
  the initial password without placing it in process arguments, validate all inputs, invoke
  the same backend provisioning service used by other administration paths, and never print
  credential material.
- **FR-028**: Only active users with the application `admin` role may add, list, disable, or
  reactivate users and create, update, or archive categories. All authenticated users may read
  active categories for task workflows. Admin status MUST NOT bypass task ownership, private
  task visibility, hidden-memo unlock, or group-ownership rules.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: Authentication, backend administration, group
  membership, task ownership, private-task access, hidden-memo access, offline caches, and
  synchronization MUST each enforce explicit authorization. Passwords, PINs, tokens, private
  tasks, and hidden memo contents MUST NOT appear in logs or unauthorized responses. AWS
  Secrets Manager is an approved trust boundary for application secrets and cryptographic
  recovery credentials when least-privilege access, encryption, rotation, and auditing apply.
- **NFR-002 Password Storage**: Passwords MUST be stored only as Argon2id one-way hashes
  produced through a well-maintained authentication library, never as plaintext or reversible
  encryption. Each password MUST use a cryptographically random unique salt, at least 100 MiB
  of Argon2id memory and parallelism 1. The iteration count MUST be calibrated to the highest
  value that keeps password verification at or below one second at p95 on the configured
  Lambda environment under the agreed authentication load test.
- **NFR-003 Data Durability & Recovery**: Acknowledged task changes MUST survive application
  restarts and ordinary component failures. Local pending changes MUST survive browser
  reloads. Server data and the cryptographic material required to recover it MUST use
  automated continuous or point-in-time protection with a recovery point objective of no
  more than five minutes and a recovery time objective of no more than four hours. Recovery
  MUST be tested in an isolated environment before initial production release and at least quarterly.
- **NFR-004 Offline Support**: Previously authorized task data and primary task operations
  MUST work without Internet access. Local changes MUST be durable, visibly pending, and
  synchronized after reconnection without silent loss.
- **NFR-005 Browser & Responsive Support**: Primary journeys MUST work in current stable
  Chrome and Safari/WebKit, including relevant iPhone and iPad viewport sizes. Touch targets,
  text, list rows, post-it notes, dialogs, and forms MUST remain usable without horizontal
  page scrolling at supported sizes.
- **NFR-006 Errors & Observability**: Production application and infrastructure events MUST
  use detailed structured Amazon CloudWatch logging with safe correlation identifiers,
  outcomes, timing, and actionable errors. Log retention, metrics, and alarms MUST be defined.
  Logs MUST exclude credentials, password and PIN material, tokens, protected task content,
  and unnecessary personal data.
- **NFR-007 Verbose Logging**: A deployment variable MUST control additional CloudWatch log
  detail. Verbose logging MUST be false when the variable is absent, empty, malformed, or not
  explicitly true. Enabling it MUST NOT weaken protected-data exclusions.
- **NFR-008 Performance**: On a representative supported device and normal connection, at
  least 95% of task-list loads, local searches, filter changes, task saves, and view switches
  MUST show a meaningful result or pending-state acknowledgement within one second. Sign-in
  MUST meet the clarified password-hash budget without freezing the interface.
- **NFR-009 AWS Architecture & Cost**: Planning MUST evaluate AWS Lambda for stateless compute
  and prefer it wherever it satisfies security, performance, reliability, and cost needs.
  Planning MUST prefer Amazon DynamoDB for primary persistence and document any requirement
  it cannot satisfy before choosing another database. Non-serverless components require a
  documented serverless comparison and cost justification.
- **NFR-010 Delivery Automation**: GitHub Actions MUST run automated tests, browser tests,
  security checks, and deployment validation for proposed changes and MUST prevent deployment
  when required checks fail.
- **NFR-011 Accessibility & Motion**: Core workflows MUST be keyboard accessible, expose
  meaningful names and status to assistive technology, maintain readable color contrast, and
  honor reduced-motion preferences.
- **NFR-012 Cryptographic Recovery**: No single routine data-store loss, key rotation, key
  retirement, or application deployment failure may permanently prevent authorized recovery
  of retained hidden memos. Recovery keys and wrapping material MUST be encrypted separately
  from task ciphertext, access controlled, auditable, versioned, and included in restore
  tests. Secrets stored in AWS Secrets Manager MUST have their versions, policies, rotation
  state, encryption dependencies, and recovery procedure covered by the backup design.
- **NFR-013 AWS Region**: Na'aseh v1 production Region-scoped application resources, live
  data, keys, secrets, and backup resources MUST be deployed only in `us-west-2`; global edge
  services such as CloudFront do not authorize a second Regional workload. The Region MUST be
  the validated `NAASEH_AWS_REGION` deployment setting defaulting to `us-west-2`; production
  MUST reject another value until a later approved multi-Region design. V1 MUST use backup
  and restore controls, not a duplicate live or passive application architecture.

### Planning Constraints

- Stateless backend workloads are expected to use AWS Lambda wherever feasible.
- Amazon DynamoDB is the preferred primary database.
- Production logs and operational metrics are centralized in Amazon CloudWatch.
- AWS Secrets Manager is the approved managed store for application secrets and recoverable
  cryptographic credentials; secrets must not be placed in source code, logs, or ordinary
  deployment variables.
- GitHub Actions is the required continuous integration and deployment automation service.
- The exact AWS service design, data model, indexes, sync protocol, backup policy, retention
  periods, alarms, and deployment topology are planning decisions subject to the constitution.

### Key Entities

- **User**: A provisioned person with a unique username, password hash, profile picture, PIN
  hash, status, authorization metadata, and session-revocation state.
- **Group**: A collaboration boundary with a name, creator, membership records, optional PIN
  hash, status, and audit history.
- **Group Membership**: A relationship between a user and group, including role, state,
  explicit self-join acceptance history and revocation time. Targeted invitations are not a
  v1 membership mechanism.
- **Category**: Centrally managed task classification with a unique name, default assignee,
  accessible color, status, and revision metadata.
- **Task**: A user-owned work item with label, link, memo, creation time, optional due date
  and time, assignee, category, completion state, privacy state, hidden-memo state, optional
  parent task, optional organizational group association, and synchronization metadata. The
  group association does not change global non-private visibility or owner-only mutation rights.
- **Task Revision**: An immutable record of a task mutation, actor, timestamp, safe before
  and after values, originating client, and synchronization or conflict result.
- **Reminder**: A browser-schedulable notification derived from a task due date and time,
  with permission, scheduling, delivery, and cancellation state.
- **Synchronization Operation**: A durable local or remote mutation with ordering,
  idempotency, retry, conflict, and completion information.
- **Cryptographic Recovery Package**: Versioned encrypted material needed to recover hidden
  memos, including wrapped data keys, independent recovery wrapping, salts, algorithms,
  derivation parameters, key identifiers, and rotation state without memo plaintext.
- **Backup Manifest**: An auditable inventory linking a backup snapshot to its data range,
  cryptographic recovery package versions, integrity evidence, creation time, and restore status.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An authorized user can sign in and reach the task list within two seconds for
  at least 95% of attempts under normal operating conditions.
- **SC-002**: A user can create a fully populated task and see it in the active view within
  one second of submission or see a durable pending indicator within that time.
- **SC-003**: All acknowledged task mutations produce exactly one durable logical revision,
  including after retry or offline synchronization.
- **SC-004**: In automated disconnection tests, 100% of locally acknowledged task changes
  remain available after a browser reload and either synchronize or surface an actionable
  conflict after reconnection.
- **SC-005**: Search and filter operations return the correct authorized result set within
  one second for at least 95% of runs against the agreed v1 data-volume test fixture.
- **SC-006**: The complete primary workflow passes automated tests in Chromium and WebKit at
  desktop, representative iPhone, and representative iPad viewport sizes.
- **SC-007**: Private tasks and locked hidden-memo content produce zero unauthorized results,
  search disclosures, offline-cache disclosures, or protected log entries in security tests.
- **SC-008**: A due reminder already scheduled in a supported browser is delivered within
  one minute of its due time while the device is offline, subject to operating-system and
  browser notification scheduling guarantees documented during planning.
- **SC-009**: Switching between list and post-it views preserves the task set, filters, and
  search state in 100% of automated view-switch tests.
- **SC-010**: Every production error class defined during planning produces a correlated,
  actionable CloudWatch event and user-visible handling where user action is relevant.
- **SC-011**: Required GitHub Actions checks block deployment for failing automated,
  browser-compatibility, or security tests.
- **SC-012**: All primary workflows meet WCAG 2.2 AA acceptance checks selected during
  planning, including keyboard use, contrast, accessible status, and reduced motion.
- **SC-013**: An isolated full-restore exercise recovers all retained entity types and
  cryptographic recovery material within four hours with no more than five minutes of
  acknowledged server-side data loss.
- **SC-014**: After every restore exercise, authorized users can decrypt 100% of sampled
  hidden memos from current and retained key versions, while unauthorized users and routine
  recovery operators can decrypt none of them.
- **SC-015**: Automated integrity validation detects missing, mismatched, or corrupted data
  and cryptographic recovery material before a restore is declared successful.

## Assumptions

- Na'aseh v1 is a single shared deployment with a small, administrator-provisioned user base.
- Steve is the initial administrator; self-registration and public account creation are out
  of scope for this baseline.
- The initial administrator is bootstrapped by an IAM-authorized operator through the Python
  command; application administrators may provision subsequent users through authorized
  administration paths.
- Regional failover and recovery from total loss of `us-west-2` are explicitly deferred.
  V1 protects against application, data-store, and operator failures through same-Region PITR,
  locked backups, retained key material, and tested restore procedures.
- Password reset, account recovery, and profile self-service are out of scope until separately specified.
- A user's PIN is distinct from the login password and is entered only after authentication.
- A group PIN is optional and is treated as a secret verifier, not stored or recoverable in plaintext.
- User and group PINs are numeric and contain at least six digits for the v1 baseline.
- A random data-encryption key encrypts each hidden memo; a PIN-derived key wraps that data
  key for offline use, and an independently protected recovery path wraps it for disaster recovery.
- The authorized recovery process may restore encrypted private content but does not grant
  administrators application-level permission to view that content.
- References to "Amazon Secrets" mean AWS Secrets Manager for this baseline.
- Reminders default to the task due date and time; separate reminder-offset rules are out of scope.
- Tasks and subtasks use the same field model, and cyclic nesting is prohibited.
- The regular task list is the default authenticated view.
- Browser notification delivery is subject to permission and supported browser/operating-system
  behavior; the app must clearly disclose when offline delivery cannot be guaranteed.
- Server-side full-text behavior may normalize case and whitespace; exact tokenization and
  ranking are planning decisions that must preserve authorization boundaries.
- Revision retention is indefinite for v1 unless a later data-retention policy supersedes it.
