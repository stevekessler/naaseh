# Feature Specification: Native Apple Applications

**Feature Branch**: `codex/native-apple-apps`

**Created**: 2026-10-06

**Status**: Implementation in progress

**Input**: User description: "Create native Na'aseh applications for Siri AI-capable iPhones and
iPads on iOS/iPadOS 27 and Apple-silicon Macs on macOS 27. Include every existing end-user web
feature, native alerts and timers, Siri AI task creation using Na'aseh or GSD, tablet and desktop
experiences, TestFlight distribution, and no system-administration interface or older operating-
system compatibility."

## Clarifications

### Session 2026-10-06

- Q: What does the optional destination in a Siri task request mean? → A: If no project is specified,
  create the task with no project; if a project is specified, use that authorized project.
- Q: Which server environment should TestFlight builds use? → A: Use the existing production AWS
  environment with a gated smoke-account rollout; do not add a separate AWS test environment or new
  AWS costs for beta distribution.
- Q: How should biometrics and passkeys be used? → A: Face ID and Touch ID unlock protected local
  state only after normal sign-in; passkey-based server authentication is out of scope.
- Q: May Na'aseh donate data for proactive Siri AI or Apple Intelligence suggestions? → A: No. Siri
  task creation is on demand only; do not donate tasks, projects, usage history, or content.
- Q: When may native alerts show task names? → A: Alerts are generic by default; each device may opt
  into names for non-private tasks, but private-task alerts always remain generic.
- Q: Which Category and Project actions belong in the native apps? → A: Users may browse, filter,
  report on, and assign work to existing authorized Categories and Projects. Creating, editing,
  archiving, restoring, or deleting Categories and Projects remains in the authorized web
  administration interface for this release.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Securely Access the Same Work Everywhere (Priority: P1)

An existing Na'aseh user signs in on a supported iPhone, iPad, or Mac and accesses the same
authorized work available in the web application. The user can continue working without a network
connection, understand what remains pending, and synchronize safely when connectivity returns.

**Why this priority**: Every other native journey depends on trustworthy authentication,
authorization, encrypted local data, and cross-client synchronization without data loss.

**Independent Test**: Sign in on each supported platform, warm the local data, go offline, create and
edit work, terminate and reopen the application, reconnect, and verify that authorized changes
converge across the native and web clients with pending and conflict states accurately represented.

**Acceptance Scenarios**:

1. **Given** an active provisioned account, **When** the user signs in on a supported device,
   **Then** only data authorized for that account is downloaded, stored, and displayed.
2. **Given** the user has previously synchronized data, **When** connectivity is unavailable,
   **Then** supported cached workflows remain usable and every local mutation is durably marked as
   pending.
3. **Given** pending local work, **When** connectivity returns, **Then** the application retries
   safely, identifies conflicts without silent overwrite, and lets the user resolve each conflict.
4. **Given** the same account changes a record in the web and native clients, **When** both clients
   synchronize, **Then** they interpret ownership, versions, authorization, and conflict outcomes
   consistently.
5. **Given** an account is disabled, signed out, or loses access, **When** the native application
   next validates the session, **Then** protected local access is revoked and data is purged or
   retained only according to the existing unsynchronized-work recovery rules.

---

### User Story 2 - Manage Tasks with Full Product Parity (Priority: P1)

A user manages tasks and subtasks from a phone, tablet, or desktop using an interface suited to that
device while retaining the behavior, privacy, and data semantics of the web application.

**Why this priority**: Task management is the core product capability and the minimum useful native
experience.

**Independent Test**: Create, inspect, edit, rank, search, filter, complete, undo, restore, and archive
a task with representative fields on each platform, including offline and conflicting changes, and
verify the resulting record and history from the web application.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** the user creates or edits a task, **Then** all applicable
   current fields, validation rules, defaults, ownership rules, and immutable revision behavior are
   preserved.
2. **Given** a task with subtasks, **When** the user changes its hierarchy, **Then** invalid cycles are
   rejected and valid parent/child relationships remain consistent on every client.
3. **Given** authorized public, group, locked, private, or hidden-memo content, **When** it is viewed or
   changed, **Then** the existing visibility, mutation, unlock, and sharing boundaries are reapplied.
4. **Given** a task collection, **When** the user searches, filters, changes list/post-it presentation,
   or changes personal rank, **Then** results, saved choices, colors, urgency, and ordering agree with
   the web product.
5. **Given** a completion or restoration, **When** it succeeds, **Then** completion credit, archive
   state, undo behavior, feedback preferences, and related reports update exactly once.

---

### User Story 3 - Receive Native Alerts and Run the Task Timer (Priority: P1)

A user receives privacy-safe alerts for task reminders and work/rest timer transitions and can see
and control the current synchronized timer through the device's native surfaces.

**Why this priority**: Timely reminders and a reliable focus timer are central reasons to install a
native application instead of relying only on a browser.

**Independent Test**: Enable alerts, schedule and modify task reminders, run repeating work/rest
intervals, background or terminate the application, and verify delivery, cancellation, timer state,
and authorized actions across two devices.

**Acceptance Scenarios**:

1. **Given** alerts have not been authorized, **When** the user chooses to enable them, **Then** the
   application requests permission in context and accurately explains granted, denied, restricted,
   or unavailable status.
2. **Given** a scheduled task reminder, **When** its time arrives while the application is not active,
   **Then** the device attempts a native alert whose default content does not reveal the task label or
   other protected content.
3. **Given** task-name previews are enabled for the device, **When** an alert concerns an authorized
   non-private task, **Then** it may show the task name; a private task remains generic regardless of
   the preview setting.
4. **Given** a reminder changes, completes, is deleted, or loses authorization, **When** the native
   application reconciles state, **Then** obsolete pending alerts are cancelled or replaced.
5. **Given** a running work or rest interval, **When** the application is backgrounded, terminated, or
   reopened after the interval boundary, **Then** the displayed timer is derived from the canonical
   state and the transition is neither duplicated nor lost silently.
6. **Given** a timer action from an alert, lock-screen activity, tablet surface, desktop window, or
   desktop status item, **When** authorization and conflict checks succeed, **Then** all clients
   converge on the same timer state.

---

### User Story 4 - Create a Task with Siri AI (Priority: P1)

A signed-in user says a natural request such as “Use GSD to add a task to Project Alpha tomorrow at
3 PM” or invokes Na'aseh through another supported system surface. The system resolves the label,
project, and due date/time, asks only necessary follow-up questions, durably creates the task, and
confirms the result.

**Why this priority**: Hands-free task capture is a defining native capability explicitly requested
for the first release.

**Independent Test**: On each supported platform, invoke task creation using both Na'aseh and GSD,
cover complete, incomplete, ambiguous, locked, offline, cancelled, and repeated requests, and verify
that exactly one correct task appears in both native and web clients.

**Acceptance Scenarios**:

1. **Given** a signed-in and locally authorized user, **When** Siri AI receives a label, authorized
   project, and natural due date/time, **Then** one task is durably created with those values and the
   user receives a concise confirmation.
2. **Given** the user says either Na'aseh or GSD, **When** the spoken name is recognized, **Then** both
   names address the same task-creation capability.
3. **Given** two authorized projects have the same or similar name, **When** the requested destination
   is ambiguous, **Then** the user is asked to choose and no task is created before resolution.
4. **Given** optional values are omitted, **When** the request is otherwise valid, **Then** the same
   defaults used by ordinary task creation are applied, and an omitted project creates an Unassigned
   task.
5. **Given** the device is offline, **When** local authorization and secure durable storage are
   available, **Then** the task and its pending synchronization record are saved atomically before
   success is announced.
6. **Given** the device is locked, the session is invalid, or secure storage is unavailable, **When**
   the request cannot safely complete, **Then** the recognized values are preserved while the user is
   asked to authenticate or continue in the application.
7. **Given** the same invocation is delivered more than once, **When** it is processed, **Then** it
   creates no duplicate task and reports the existing outcome safely.

---

### User Story 5 - Use Lists, Organization, Files, and Reports (Priority: P2)

A user completes every existing non-administrative organization and integration workflow on the
native applications, including Lists, global items, groups, projects, archive, Completed Tasks,
attachments, and exports. Google Tasks synchronization is retired from every client and backend.

**Why this priority**: The first TestFlight release requires complete end-user web parity, not a
task-only subset.

**Independent Test**: Complete one representative end-to-end journey in each named product area on
phone, tablet, and desktop, then confirm data and authorization parity in the web application.

**Acceptance Scenarios**:

1. **Given** an authorized user, **When** the user manages a List and its items, **Then** order,
   completion, values, totals, global-item links, overrides, copy, visibility, and archive semantics
   match the current product.
2. **Given** existing authorized projects, categories, groups, or archived work, **When** the user
   browses, filters, assigns work, restores user-owned work, or performs another allowed
   non-administrative mutation, **Then** counts, relationships, permissions, and irreversible
   warnings remain accurate; Category and Project administration remains web-only.
3. **Given** an allowed attachment, **When** the user chooses, uploads, scans, downloads, previews,
   shares, retries, or removes it, **Then** size/type rules, encryption, progress, malware status,
   authorization, and temporary-file cleanup are enforced.
4. **Given** completed work, **When** the user views reports or requests an export, **Then** date
   boundaries, filters, positive-only periods, totals, urgency breakdowns, file integrity, and
   authorization agree with the web product.
5. **Given** any web or native client, **When** the user opens profile, task privacy, or integration
   surfaces, **Then** no Google Tasks control, route, scheduled worker, credential dependency, or
   synchronization behavior is present.

---

### User Story 6 - Use the Private Journal and Crisis Plans Safely (Priority: P1)

A journal owner records, reviews, and analyzes private journal entries and creates, views, updates,
and selectively shares a Crisis Plan without weakening the existing encryption, recovery,
authorization, offline, or safety boundaries.

**Why this priority**: These workflows contain the product's most sensitive data; full native parity
cannot ship unless their protections are equivalent to or stronger than the web experience.

**Independent Test**: Create and unlock a journal, create a Crisis Plan, record and edit entries
online and offline, inspect dashboard results, trigger plan display, share/revoke a plan, and verify
that unauthorized users, administrators, device surfaces, logs, and system intelligence features
cannot obtain protected content.

**Acceptance Scenarios**:

1. **Given** an authenticated journal owner, **When** journal or owner Crisis Plan data is persisted or
   synchronized, **Then** content and content-derived private data remain encrypted outside active
   authorized use.
2. **Given** no valid Crisis Plan, **When** the owner attempts to create a journal entry, **Then** entry
   creation remains blocked while existing entries remain readable and editable as currently
   specified.
3. **Given** triggering answers in a journal entry, **When** they are visible, **Then** the owner's
   current plan is shown without generating alerts, sharing information, making a clinical judgment,
   or discarding the journal draft.
4. **Given** a shared Crisis Plan, **When** a recipient opens it, **Then** current online authorization
   is required and no recipient-accessible offline copy is retained.
5. **Given** the application backgrounds, locks, changes user, or loses authorization, **When**
   sensitive content is no longer actively permitted, **Then** plaintext, unlocked keys, previews,
   and content-derived system surfaces are removed or obscured.

---

### User Story 7 - Work Naturally on Phone, Tablet, and Desktop (Priority: P2)

A user receives a native experience suited to each supported form factor: focused touch workflows on
iPhone, adaptable multi-column and multitasking workflows on iPad, and resizable windowed workflows
with menus and keyboard commands on Mac.

**Why this priority**: Full feature parity is not sufficient if the interface is merely stretched or
if controls fail under the interaction conventions of each device.

**Independent Test**: Complete the primary journeys on representative supported devices using touch,
keyboard, pointer/trackpad, VoiceOver, large text, reduced motion, multiple windows, and constrained
window sizes.

**Acceptance Scenarios**:

1. **Given** an iPhone, **When** the user navigates, edits, opens the keyboard, rotates, or encounters
   a safe area, **Then** all essential controls remain visible, reachable, and state-preserving.
2. **Given** an iPad, **When** the user changes orientation or window size or opens multiple scenes,
   **Then** the interface intentionally changes between compact and multi-column compositions without
   losing input, selection, focus, or pending work.
3. **Given** a Mac, **When** the user resizes or opens windows or uses the menu bar, keyboard, pointer,
   contextual actions, or file workflows, **Then** the application follows desktop conventions and
   does not behave like an enlarged phone screen.
4. **Given** an action supports drag, hover, context menu, gesture, or Pencil input, **When** the user
   cannot use that input, **Then** an equally functional visible keyboard, touch, or assistive-
   technology alternative remains available.
5. **Given** a notification, link, search result, or Siri action, **When** it opens content, **Then** it
   activates the correct authorized scene or window without duplicating or exposing state.

---

### User Story 8 - Manage Personal Settings without Native Administration (Priority: P2)

A user manages personal profile, reminder, sound, Google, password, and multifactor settings from
the native applications. System administration and operator-only workflows remain in the web and
operator tools.

**Why this priority**: Users need self-service account controls, while excluding administration
keeps the first native release bounded and avoids exposing high-risk operations unnecessarily.

**Independent Test**: Complete each personal setting on all supported platforms, verify online-only
failures and session revocation, and confirm that no user/category/project administration,
provisioning, or recovery-operator interface is present.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** the user opens Profile, **Then** all current personal
   settings remain available and use the same server-authoritative behavior as the web product.
2. **Given** a security-sensitive action while offline, **When** the user attempts it, **Then** the
   application explains that a connection is required and does not queue or claim success.
3. **Given** an administrator account, **When** it uses a native application, **Then** system-wide
   administration, provisioning, and recovery-operator controls remain absent.

---

### User Story 9 - Install and Evaluate Complete TestFlight Builds (Priority: P2)

Authorized testers install supported iPhone/iPad and Mac builds through TestFlight, upgrade without
losing local or pending work, provide feedback, and clearly understand beta limitations.

**Why this priority**: TestFlight is the required first distribution channel and must safely exercise
real devices before any public release decision.

**Independent Test**: Install clean builds, upgrade builds containing cached and pending work,
exercise primary journeys, submit feedback, revoke a build if necessary, and verify compatibility
with the currently supported server and web client.

**Acceptance Scenarios**:

1. **Given** an invited tester with supported hardware and operating system, **When** the tester
   installs the appropriate TestFlight build, **Then** configuration and sign-in target the existing
   production environment without embedding production secrets.
2. **Given** encrypted cached data and pending mutations, **When** the tester upgrades the native
   application, **Then** data is migrated or the upgrade is stopped with a recoverable explanation;
   it is never silently discarded.
3. **Given** a build is unsafe or incompatible, **When** operators stop its use, **Then** the tester
   receives an actionable upgrade or unavailable state without corrupting server data.
4. **Given** a new TestFlight build has passed local and device release gates, **When** production
   testing begins, **Then** access starts with the dedicated smoke account before the build is offered
   for use with ordinary production accounts.

### Edge Cases

- A device runs the required operating system but does not support Siri AI; it is outside the
  supported hardware boundary and must not be represented as fully supported.
- Siri AI is supported by the device but unavailable because it is disabled, not downloaded, limited
  by language/region/account, or temporarily unavailable; ordinary in-app task creation remains
  usable and voice availability is stated accurately.
- “Na'aseh” is mispronounced or not recognized while “GSD” is recognized, or vice versa; the user can
  discover and use either registered name without creating an unintended task.
- A spoken project name matches multiple authorized projects, an unauthorized project, or no
  project; no destination is guessed silently and no unauthorized name is disclosed.
- A reminder or timer transition occurs after a time-zone, daylight-saving, device-clock, or server-
  time correction; the canonical due instant and timer anchors govern the result.
- The operating system delays or suppresses an alert; the application does not treat notification
  delivery as proof that an event occurred and reconciles on its next activation.
- The same account changes a task, list, timer, journal entry, or Crisis Plan concurrently on web,
  phone, tablet, and desktop; all retained versions and conflict choices remain attributable.
- A native application is terminated during a local write, migration, encryption operation, upload,
  download, export, OAuth return, or synchronization batch; committed state remains valid and partial
  work is retryable or safely removed.
- Local storage is low, unavailable, corrupted, restored from backup, or missing a required key; the
  application prevents unsafe writes and gives a recovery path without inventing successful state.
- A user signs out with unsynchronized work; the application warns and follows a deliberate recovery
  or discard path rather than silently deleting or leaking it to the next account.
- Multiple iPad scenes or Mac windows edit the same record; local coordination prevents one window
  from silently overwriting the other and remote conflict behavior remains intact.
- A task or shared plan is opened from a stale alert, deep link, Siri result, or search result after
  deletion, revocation, privacy change, or account disablement; authorization is rechecked before any
  content is displayed.
- A private label, hidden memo, journal metric, Crisis Plan, attachment name, or decrypted value could
  enter an alert, system search, voice response, app-switcher preview, clipboard, crash report, or
  intelligence donation; protected content is omitted or replaced with a generic representation.
- An attachment is dragged from or exported to another application; the user is warned when data
  leaves Na'aseh control, and temporary internal copies are removed deterministically.
- A tablet or desktop window becomes extremely narrow, very wide, full-screen, restored off-screen,
  or connected to an external display; essential actions and accessible reading order remain usable.
- A hardware keyboard, pointer, trackpad, Pencil, touch input, VoiceOver, Full Keyboard Access,
  reduced motion, or large text setting is used; no primary workflow depends on one unavailable
  input method or on color alone.
- The web application and native application versions differ within the supported compatibility
  window; shared contracts remain interoperable or the outdated client is stopped before mutation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST provide native end-user applications for supported Siri AI-capable
  iPhones on iOS 27, iPads on iPadOS 27, and Apple-silicon Macs on macOS 27.
- **FR-002**: The native applications MUST NOT claim support for earlier operating systems, Intel
  Macs, non-Siri-AI hardware, compatibility modes, or other Apple platforms in this release.
- **FR-003**: The native applications MUST preserve every current non-administrative end-user
  capability and the authoritative behavior defined by specifications 001 through 011 unless this
  specification explicitly changes it. A maintained story-level coverage inventory MUST trace each
  source story to native implementation and validation or to an explicit web-only exclusion.
- **FR-004**: System administration, user provisioning, Category and Project creation/edit/archive/
  restore/deletion, and recovery-operator workflows MUST remain absent from the native applications
  and available only through their existing authorized web or operator channels. Native users MAY
  browse, filter, report on, and assign work to existing authorized Categories and Projects.
- **FR-005**: Users MUST be able to sign in, sign out, handle session expiry, change/reset supported
  credentials, manage multifactor authentication, and respond to account disablement using the same
  server-enforced security rules as the web application.
- **FR-006**: A signed-in user MUST be able to use device authentication to re-enter locally locked
  protected state after ordinary sign-in; device authentication MUST NOT replace server session
  validation or silently create a new server session. The native applications MUST NOT add passkey-
  based server authentication in this feature.
- **FR-007**: Each native application MUST store only authorized local data, encrypt protected local
  records and pending mutations, protect local key material, and purge data when access is revoked
  according to existing recovery rules.
- **FR-008**: Task, list, timer, journal, Crisis Plan, reference, preference, and synchronization data
  exchanged with the server MUST remain compatible with the web client's authoritative wire and
  cryptographic formats.
- **FR-009**: Every supported offline mutation MUST atomically save the changed local state and a
  retry-safe pending operation before reporting success.
- **FR-010**: The applications MUST show connectivity, freshness, pending operation, synchronization
  failure, and conflict states without representing cached or pending work as synchronized.
- **FR-011**: Reconnection MUST retry idempotently, reapply authorization, preserve concurrent
  versions, and require deliberate resolution whenever automatic convergence would discard user
  intent.
- **FR-012**: Users MUST be able to create, view, edit, complete, undo, restore, archive, search, and
  filter tasks and subtasks with all current applicable fields, defaults, validation, revision,
  privacy, lock, sharing, and hidden-memo behavior.
- **FR-013**: Users MUST be able to use list and post-it presentations, post-it colors, urgency
  filters, personal overall/project stacks, touch/pointer reordering, and equivalent non-drag ranking
  controls.
- **FR-014**: The applications MUST preserve current completion feedback, optional sound, reduced-
  motion behavior, completion credits, archive transitions, and undo semantics without duplicate
  completion events.
- **FR-015**: The product MUST maintain at most one synchronized account-wide task timer per user and
  preserve current work/rest/repeat, switching, pause, resume, reset, time-correction, offline, and
  conflict behavior.
- **FR-016**: The product MUST provide native alerts for task reminders and timer interval
  transitions on each supported platform after an explicit per-device opt-in.
- **FR-017**: Default alert, badge, lock-screen, status-item, and timer-surface content MUST be generic
  and MUST NOT reveal task labels or other protected content. A task-name preview option MUST be
  explicit, per-device, reversible, and disabled by default; it MAY show an authorized non-private
  task name, but private-task alerts MUST remain generic regardless of the setting.
- **FR-018**: Alerts and timer surfaces MUST reapply current authorization before opening content or
  mutating synchronized state and MUST safely handle stale, revoked, deleted, completed, or changed
  records.
- **FR-019**: Changed reminders and canonical timer state MUST cause obsolete local alerts and timer
  surfaces to be cancelled or replaced during reconciliation.
- **FR-020**: A signed-in user MUST be able to invoke task creation through Siri AI, Apple
  Intelligence, Spotlight, and Shortcuts using Na'aseh or GSD as the application name. The action
  MUST be available on demand without donating task, project, usage-history, or content records for
  proactive suggestions.
- **FR-021**: The voice task-creation action MUST accept a required task label plus optional project,
  due date, and due time expressed naturally and MUST apply ordinary task-creation defaults to
  omitted values; if no project is specified, the task MUST be created Unassigned.
- **FR-022**: Voice destination resolution MUST consider only authorized active projects, MUST ask
  the user to resolve ambiguous specified names, and MUST NOT reveal unauthorized or private
  candidate data. It MUST NOT ask for a project when the user omitted one.
- **FR-023**: Voice task creation MUST create one durable task and pending operation atomically before
  confirming success; duplicate delivery MUST NOT create duplicate tasks.
- **FR-024**: When a voice action cannot safely complete while locked, signed out, expired, or missing
  secure local state, the recognized parameters MUST be carried into an authenticated foreground
  continuation when the operating system permits.
- **FR-025**: Users MUST be able to create, edit, copy, archive, and view Lists and to add, reorder,
  complete, restore, remove, value, link, override, and reset list items according to the current
  global-item and visibility rules.
- **FR-026**: Users MUST be able to use current group workflows; browse and select existing authorized
  Categories and Projects; assign or remove work assignments; view archive, workload-count, end-date,
  and Completed Tasks reporting information; and restore or permanently delete user-owned work
  within existing authorization boundaries. Category and Project lifecycle administration remains
  web-only as defined by FR-004.
- **FR-027**: Users MUST be able to attach supported files while online and receive native selection,
  progress, scan, retry, download, preview, share, and removal behavior without weakening size,
  malware, encryption, authorization, or cleanup rules.
- **FR-028**: Users MUST be able to request, monitor, validate, save, and share authorized completed-
  task exports, and plaintext export files MUST NOT remain in protected application storage longer
  than required for the user's chosen handoff.
- **FR-029**: The product MUST NOT expose Google Tasks connection, import, export, sharing, conflict,
  scheduled synchronization, OAuth, or token-storage behavior in web, API, infrastructure, or
  native clients. A browser upgrade MUST delete the retired local encrypted integration cache.
- **FR-030**: Journal owners MUST be able to configure, unlock, browse, filter, create, read, edit,
  and analyze their private journal with all current fields, rich-text behavior, task reflections,
  section settings, no-delete rule, dashboard metrics, comparisons, and contributor details.
- **FR-031**: The applications MUST preserve journal and Crisis Plan encryption, owner authorization,
  recovery boundaries, offline behavior, conflicts, key zeroization, and content-derived privacy
  rules across every supported device and system surface.
- **FR-032**: Users MUST be able to create, update, trigger-display, share, view, revoke, and remove
  access to Crisis Plans under all current plan-before-entry, owner/recipient, online/offline,
  non-clinical, and no-delete rules.
- **FR-033**: Journal answers and activity MUST NOT generate native alerts, Siri responses,
  intelligence donations, external sharing, risk assessments, or emergency actions merely because
  of their values.
- **FR-034**: On iPhone, every primary workflow MUST remain operable with touch, VoiceOver, large
  text, reduced motion, portrait/landscape changes, safe areas, and the on-screen keyboard.
- **FR-035**: On iPad, every primary workflow MUST use an intentional adaptive tablet composition and
  remain operable in supported full-screen, portrait, landscape, resizable multitasking, external-
  display, and multiple-window states.
- **FR-036**: iPad workflows MUST support touch, hardware keyboard, trackpad/pointer, VoiceOver, Full
  Keyboard Access, and Apple Pencil where relevant, with a visible alternative for every drag,
  hover, context-menu, or Pencil action.
- **FR-037**: On Mac, every primary workflow MUST use an intentional desktop composition with
  resizable and restorable windows, sidebars, toolbars, menus, keyboard commands, pointer/context
  actions, drag/drop, and desktop file workflows.
- **FR-038**: Mac workflows MUST preserve a visible keyboard- and assistive-technology-accessible
  alternative for every pointer, hover, contextual, gesture, or drag action.
- **FR-039**: Links, alerts, Siri actions, search results, OAuth returns, and external-file actions
  MUST activate the correct authorized phone/tablet scene or desktop window and MUST recheck
  authorization before displaying protected content.
- **FR-040**: Personal Profile settings for reminders, alerts, sound, credentials,
  multifactor authentication, and other existing user-scoped settings MUST be available on every
  native platform unless the setting is inherently device-specific.
- **FR-041**: Security, credential, sharing, recipient access, export, and other
  server-authoritative actions that cannot safely queue offline MUST fail clearly while offline and
  MUST NOT claim or imply success.
- **FR-042**: Supported testers MUST be able to install and upgrade the iPhone/iPad and Mac beta
  applications through TestFlight without silently losing cached, encrypted, or pending work.
- **FR-043**: Every TestFlight build MUST connect to the existing production environment; rollout
  MUST begin with a dedicated production smoke account, and this feature MUST NOT create a separate
  AWS test environment solely for native beta testing.
- **FR-044**: The product MUST distinguish an unsupported device, unavailable Siri AI configuration,
  incompatible application version, expired beta, server outage, and ordinary offline state and
  provide an actionable response for each.
- **FR-045**: The native applications MUST NOT place credentials, tokens, encryption keys, hidden
  memos, journal data, Crisis Plans, private task content, attachment content, or derived protected
  values in logs, crash reports, alerts, badges, system search, voice output, previews, clipboard,
  URLs, feedback attachments, or intelligence donations.
- **FR-046**: Signing out or switching accounts MUST clear in-memory secrets, system surfaces,
  notifications, search contributions, previews, and account-specific transient state and MUST use a
  deliberate recovery/discard path for unsynchronized work.
- **FR-047**: The existing web application MUST remain available, interoperable, and behaviorally
  unchanged except for bounded server-contract additions required by the native clients.
- **FR-048**: After an authenticated session is available, native clients MUST submit bounded,
  content-free diagnostic events for significant client-only failures to the existing centralized
  production observability path. Events that cannot be submitted immediately MAY be retained in a
  small encrypted retry buffer when local keys are available; telemetry failure MUST NOT block or
  falsely change the outcome of user work, and pre-authentication protected context MUST NOT be
  transmitted.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: Native clients read and mutate only data already authorized
  for the authenticated actor. Server authorization remains authoritative for every request and is
  never replaced by a hidden control, device trust, local cache, biometric result, voice resolution,
  link, notification, or prior authorization. Private tasks, hidden memos, journals, Crisis Plans,
  attachments, credentials, keys, and content-derived values remain protected in transit, at rest,
  in backups, and across operating-system surfaces. Administrators receive no new native access to
  another user's protected data or to excluded administration workflows.
- **NFR-002 Data Durability & Recovery**: Every native mutation must be validated, durably persisted,
  retry-safe, and recoverable according to its risk. Local writes, upgrades, migrations,
  synchronization, attachments, exports, sign-out, and account switching must withstand application
  termination and partial failure without silent loss, duplicate effects, or corrupt committed
  state. Existing server revision history, idempotency, backup, restore, key-retention, and recovery
  processes remain authoritative and must be extended to validate native-client data where needed.
- **NFR-003 Offline Support**: All existing offline-capable end-user reads and mutations remain
  offline-capable in native clients after an authorized cache is established. Online-only actions
  are identified before submission. Connectivity, freshness, pending work, conflicts, and retries
  remain visible. Reconnection is automatic and user-triggerable, never assumes background
  execution, and never silently discards either local or remote intent.
- **NFR-004 Platform & Responsive Support**: Supported platforms are limited to Siri AI-capable
  iPhones on iOS 27, iPad mini (A17 Pro) and M-series iPads on iPadOS 27, and Apple-silicon Macs
  capable of Siri AI on macOS 27. Primary journeys must pass with each platform's required touch,
  keyboard, pointer, window, accessibility, text-size, motion, safe-area, and lifecycle states. The
  existing Chrome and Safari/WebKit application remains supported and interoperable under its
  current specifications.
- **NFR-005 Errors & Observability**: User-actionable failures must state what failed, whether work is
  saved or pending, and what the user can do next. Existing centralized production observability
  must distinguish native platform, application/contract version, operation class, bounded outcome,
  safe correlation identifier, duration, and retry/conflict category. Logs, metrics, alarms, crash
  reports, and feedback diagnostics must exclude protected content, identifiers not needed for
  diagnosis, credentials, keys, tokens, notification content, voice transcripts, and private system
  context. Authenticated client-only migration, encrypted-store, cryptographic, lifecycle, Siri,
  notification, and file-workflow failures must reach CloudWatch through a bounded existing-service
  ingestion path when connectivity permits; buffered delivery is best-effort and must never become a
  correctness dependency.
- **NFR-006 Performance**: On representative supported hardware, a warm launch must present usable
  cached navigation within 2 seconds; an ordinary local create/edit/complete action must visibly
  commit or show a safe pending/error state within 500 milliseconds; search/filter changes over
  10,000 authorized cached work records must present updated results within 1 second; window or
  orientation reflow must settle within 250 milliseconds; and a Siri task request with resolved
  parameters must confirm a durable local result within 2 seconds, excluding operating-system speech
  recognition and explicit user clarification time.
- **NFR-007 AWS Architecture & Cost Impact**: Native clients reuse the existing request-driven,
  serverless AWS application, synchronization, storage, export, notification, key, backup, and
  observability services. Native beta testing must use the existing production environment and must
  not provision a separate AWS test environment. No always-on compute or new managed service is
  introduced solely for native clients unless the user separately approves its documented need and
  cost. Planning must estimate incremental API, synchronization, notification, storage, transfer,
  logging, and alarm costs at current scale and at 1,000 users and must choose the lowest-cost design
  that preserves security and durability.
- **NFR-008 Accessibility**: One hundred percent of primary workflows must be operable without color,
  animation, drag, hover, fine pointer movement, speech, or audio as the sole means of understanding
  or action. Controls require accurate names, values, traits, order, focus behavior, error/status
  announcements, and platform-appropriate minimum target sizes.
- **NFR-009 Privacy & System Intelligence**: Siri AI, Apple Intelligence, system search, shortcuts,
  notifications, live activities, desktop status surfaces, previews, and donations receive only the
  minimum transient representation required for the explicitly invoked action. Native clients must
  not donate tasks, projects, usage history, or content for proactive suggestions. The user can see
  and disable each optional integration. Journal content/metrics, Crisis Plans, hidden memos,
  credentials, attachment content, and unrelated private task content are categorically excluded.
- **NFR-010 Validation Runtime**: Required pull-request validation must remain at or below ten minutes
  with measured before/after test counts and duration. A focused representative native smoke set may
  enter the required gate only after measurement; exhaustive platform, device, window, Siri,
  notification, failure, and interoperability matrices remain release gates. VoiceOver support is
  required, but manual VoiceOver execution is not a first-release gate.

### Key Entities

- **Native Installation**: One installed Na'aseh application instance, identified by platform,
  application/contract version, environment, device-scoped preferences, notification association,
  secure local-key state, and last validated user; it contains no authority beyond the current
  server session.
- **Local Secure Store**: The encrypted authorized cache, synchronization cursors, pending operations,
  conflicts, migrations, and health state for one installation. It must separate accounts and
  survive ordinary termination and upgrades.
- **Native Scene**: An independently restorable phone/tablet scene or desktop window with route,
  selection, draft, filter, focus, and sensitivity state. Multiple scenes may refer to the same
  canonical record without becoming independent sources of truth.
- **Alert Registration**: A device-scoped opt-in and delivery association for generic task reminder
  and timer alerts, including permission state, privacy preference, pending requests, actions, and
  reconciliation metadata.
- **Timer Presentation**: A privacy-safe system or application surface derived from the canonical
  account timer, including interval type, start/pause anchors, duration, repeat state, and last
  reconciled version; it does not independently advance or complete tasks.
- **Voice Task Request**: A retry-identifiable request containing a required label, optional
  authorized project reference, optional due date/time, recognition/clarification state, user and
  installation context, and durable creation outcome. Raw voice recordings and unrelated transcript
  content are not Na'aseh records.
- **System Entity Representation**: The minimum authorized name/identifier exposed temporarily to a
  system surface for intent resolution or navigation. It excludes protected body content and must
  become unusable after revocation.
- **Platform Capability State**: The supported-device, operating-system, Siri AI, language/region,
  notification, biometric, storage, connectivity, and input capabilities currently available to an
  installation.
- **TestFlight Build**: A signed beta release for the universal phone/tablet application or desktop
  application, with supported platform versions, application/contract compatibility window,
  migration range, release notes, test focus, expiration, and rollback/upgrade disposition.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On every supported platform, 100% of designated primary end-user journeys from current
  specifications 001 through 011 can be completed without entering the web application, excluding
  the explicitly web-only administration and operator workflows.
- **SC-002**: In offline/reconnection and four-client concurrency tests, 100% of acknowledged local
  mutations are either synchronized exactly once or remain visibly pending/conflicted; zero are
  silently lost, duplicated, or overwritten.
- **SC-003**: Across authorization-negative tests, zero private tasks, hidden memos, journal values,
  Crisis Plans, attachment content, credentials, keys, or unauthorized entity names appear in
  another account, alert, system search result, voice response, preview, diagnostic, or feedback
  artifact.
- **SC-004**: On the first-release `en-US` evaluation corpus, at least 95% of 240 complete,
  unambiguous Siri AI task requests—80 each on representative supported iPhone, iPad, and Mac
  hardware, evenly covering Na'aseh/GSD names, project omission/selection, date/time forms, and
  natural filler—create the intended task on the first attempt; 100% of 60 ambiguous project cases,
  20 per platform, request clarification rather than choosing silently.
- **SC-005**: Replaying each of 1,000 unique representative operation identifiers two to five times—
  200 voice task creations, 200 alert actions, 200 synchronization mutations, 150 completion
  operations, 150 timer transitions, and 100 sharing operations—produces zero duplicate tasks,
  completion events, timer transitions, synchronization effects, or sharing relationships.
- **SC-006**: One hundred percent of changed, completed, deleted, revoked, or rescheduled reminder
  test cases remove or replace obsolete pending alerts on the next authorized reconciliation.
- **SC-007**: The canonical timer differs by no more than 1 second among active native and web clients
  after reconciliation under ordinary clock correction, suspension, termination, and device-switch
  scenarios.
- **SC-008**: On representative supported hardware, warm cached navigation appears within 2 seconds,
  ordinary local mutations show a durable outcome within 500 milliseconds, 10,000-record searches
  update within 1 second, and layout changes settle within 250 milliseconds in at least 95% of runs.
- **SC-009**: Automated accessibility checks find zero blocking issues in primary workflows, and
  every drag-, hover-, gesture-, Pencil-, sound-, or speech-dependent action has an implemented
  equivalent. Manual VoiceOver testing is recommended but not required for the first release.
- **SC-010**: Phone journeys have zero essential controls obscured by safe areas or the on-screen
  keyboard; tablet journeys preserve state across every required window class; and desktop journeys
  preserve state across resize, multiple-window, quit, and restoration tests.
- **SC-011**: Clean install, upgrade, forced termination during migration, low-storage, sign-out, and
  account-switch test matrices produce zero silent loss or cross-account disclosure of cached or
  pending user data.
- **SC-012**: One hundred percent of unsupported-device, unavailable-Siri, offline-only, expired-
  session, expired-build, and incompatible-version scenarios display the correct state and an
  actionable next step without claiming unavailable functionality succeeded.
- **SC-013**: The focused required validation suite, after measured additions, completes within ten
  minutes in the hosted pull-request check; exhaustive native release matrices remain outside the
  required pull-request path.
- **SC-014**: Both phone/tablet and desktop TestFlight builds install, upgrade, authenticate, and
  complete the release smoke journeys on physical supported devices before the first tester rollout.
- **SC-015**: Incremental monthly AWS cost at the expected initial user count remains within the
  planning estimate and introduces no always-on service; any variance greater than 20% is explained
  before expanding TestFlight access.

## Assumptions

- The existing web application, API, authorization model, domain semantics, encryption formats,
  synchronization protocols, AWS deployment, backup/recovery processes, and specifications 001
  through 011 remain the authoritative source for product behavior.
- The first-release Siri AI recognition evaluation language is `en-US`. Additional supported launch
  languages require their own versioned corpus and the same per-language success threshold before
  being represented as validated.
- Native applications are additive clients. The web application remains supported and is the only
  interface for system administration, provisioning, and recovery-operator work.
- The first distribution channel is TestFlight for invited testers; public, unlisted, enterprise,
  and managed distribution are outside this feature. TestFlight builds use the existing production
  environment, beginning with a dedicated production smoke account after local and physical-device
  release gates pass; no separate AWS beta environment is created.
- Supported hardware is intentionally limited to Siri AI-capable devices: the current iOS 27 Siri AI
  iPhone set, iPad mini (A17 Pro) and M-series iPads, and Apple-silicon Macs capable of Siri AI.
- Only iOS 27, iPadOS 27, and macOS 27 are supported; compatibility code and validation for older
  operating systems are outside scope.
- A Siri task project is optional. An omitted project creates an Unassigned task; a specified project
  resolves an authorized active Project. Voice assignment to a person, group, category, parent task,
  or lightweight List is outside the first action unless a later clarification expands it.
- Device authentication provides convenient local re-entry after a successful ordinary sign-in.
  Passkey-based server authentication is outside this feature.
- Native task alerts and timer transitions are best-effort system deliveries. Product correctness
  depends on canonical task/timer state and activation-time reconciliation, not guaranteed alert
  delivery or continuous background execution.
- System search and intelligence integrations expose only the minimum task-creation action and
  transient authorized project representations required to resolve an explicit invocation. Native
  clients do not donate tasks, projects, usage history, or content for proactive suggestions; broad
  indexing of tasks, Lists, journal entries, Crisis Plans, or attachments is outside scope.
- Existing account, data-volume, 10,000-row, and approximately 50-current-user assumptions remain in
  force, while cost and performance planning also evaluates 1,000 users.
- Native application development and release require current Apple development tooling, signing
  identities, entitlements, App Store Connect access, supported physical devices, and TestFlight
  tester accounts; these are planning and operational dependencies, not new end-user workflows.
