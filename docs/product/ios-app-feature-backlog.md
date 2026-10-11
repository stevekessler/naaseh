# Na'aseh SwiftUI Apps Feature Backlog

## Purpose

This document turns the current Na'aseh web specifications into a set of bounded features that can
be specified and implemented one at a time with Spec Kit. It describes work needed for native
iPhone, iPad, and Mac applications; it does not repeat every web requirement. Unless a feature says
otherwise, the existing product behavior and authorization rules remain the source of truth.

## Selected product direction

Build native SwiftUI applications for iOS 27, iPadOS 27, and macOS 27 from shared Swift packages and
platform-adaptive targets. The clients will reuse the existing backend APIs, wire-format contracts,
authorization model, product requirements, synchronization semantics, and cryptographic formats.
They will not embed the web application or directly reuse the React UI, Dexie repositories,
TypeScript sync engine, browser crypto implementation, or browser test suite.

This is a native client rewrite. Every feature must include the necessary Swift domain models,
networking, persistence, synchronization, cryptography, SwiftUI presentation, accessibility, and
native tests. Contract fixtures and cross-client compatibility tests must ensure the SwiftUI and web
clients interpret server data and security rules identically.

## Confirmed release decisions

- The first release will be distributed through TestFlight rather than submitted to the public App
  Store.
- The first release will provide every current end-user web feature, including lists, reports,
  Journal, Crisis Plans, files, offline work, reminders, ranking, and timers. Google Tasks
  synchronization is retired product-wide.
- System administration and operator-only recovery/provisioning will remain web-only. The native
  apps will retain personal Profile and account-security settings.
- SwiftUI is the selected implementation strategy.
- The deployment target is iOS 27.0 on a Siri AI-capable iPhone. The supported hardware boundary is
  Apple's iOS 27 Siri AI set (currently iPhone 15 Pro/Pro Max, iPhone 16 or later, and iPhone Air).
  Other iOS 27 iPhones and iOS 26 and earlier are outside the first release.
- Add iPadOS 27 support for Siri AI-capable iPads: iPad mini (A17 Pro) and iPad models with M1 or
  later. Other iPadOS 27 devices and iPadOS 26 or earlier are outside the first release.
- Add a native macOS 27 desktop target for Apple Intelligence-capable Apple-silicon Macs. macOS 26
  and earlier, Intel Macs, Mac Catalyst, visionOS, and watchOS targets are outside the first release.
- Voice integration targets Siri AI and Apple Intelligence. No legacy SiriKit or pre-iOS-27 voice-
  integration path is required. On supported hardware, the app must show a clear unavailable state
  when Apple Intelligence is disabled or unavailable because of language, region, account, download,
  or system configuration.
- Face ID and Touch ID unlock protected local state only after normal server sign-in. They do not
  replace server authentication, and passkey-based server sign-in is outside the first release.

## Cross-cutting rules for every native-app feature

- Preserve the current server-side authorization, privacy, role, sharing, and conflict rules.
- Preserve encrypted-at-rest local data and ciphertext-only handling for hidden memos, journals, and
  crisis plans.
- Never silently discard offline or conflicting work.
- Do not make background execution a correctness dependency; iOS may suspend the app at any time.
- Keep secrets, protected content, credentials, notification payloads, and cryptographic material out
  of logs, analytics, crash reports, URLs, previews, and screenshots.
- Meet iOS accessibility expectations for VoiceOver, Dynamic Type, reduced motion, contrast,
  keyboard/switch input, and 44-by-44-point touch targets.
- Use iOS 27, iPadOS 27, and macOS 27 SwiftUI, Observation, App Intents, notifications, and other
  current platform APIs directly. Use ActivityKit where available on iPhone/iPad and a native Mac
  timer surface rather than forcing mobile-only presentation onto macOS. Do not add availability
  branches, compatibility wrappers, polyfills, or tests for iOS 26, iPadOS 26, macOS 26, or earlier.
- Share domain, API, cryptography, persistence, sync, and feature logic where behavior is identical,
  but give each form factor an intentional interface. The iPad app must use tablet navigation,
  adaptable columns, multitasking windows, keyboard/trackpad interaction, and tablet file workflows;
  it must not present a stretched phone layout. The Mac app must use desktop windows, sidebars,
  toolbars, menus, commands, keyboard shortcuts, pointer interactions, and desktop file workflows;
  it must not present a stretched phone or tablet layout.
- Treat existing server API and sync contracts as backward-compatible interfaces shared with the
  PWA. Dropping older iOS support does not authorize breaking the web client or stored/synchronized
  data.
- Keep required pull-request validation below ten minutes. Measure test count and runtime before and
  after adding iOS-related tests to required validation; keep exhaustive device matrices in release
  gates.

## Feature sequence

Each numbered section is intended to become its own Spec Kit feature. The suggested slug can be used
as the starting feature name.

### 1. SwiftUI Application Foundation

**Suggested slug:** `012-swiftui-app-foundation`

Create native iOS 27, iPadOS 27, and macOS 27 SwiftUI applications with a maintainable shared modular
architecture, separate development and production configuration, and repeatable simulator,
physical-device, and Mac builds.

Include:

- Xcode workspace/project, shared Swift package/module boundaries, a universal iPhone/iPad target and
  separate macOS target, bundle identifiers, app icons, launch experiences, display names,
  versioning, entitlements, and signing configuration without committed signing secrets.
- An iOS 27.0 phone presentation and Siri AI-capable iPhone support policy, with no older-OS
  availability branches.
- An iPadOS 27.0 deployment target and Siri AI-capable iPad support policy, with no older-OS
  availability branches for the tablet presentation.
- A macOS 27.0 deployment target for Apple-silicon Macs capable of Siri AI, with no Intel or
  Catalyst destination.
- Native application, scene, dependency, navigation, networking, persistence, synchronization,
  cryptography, and feature-module boundaries.
- Environment configuration for API origin, universal/deep links, notification environment, and
  feature flags, with no production secrets compiled into the application.
- Swift request/response models that match the existing API and sync wire formats, backed by shared
  fixtures and compatibility tests rather than duplicated undocumented assumptions.
- A cross-platform design-system foundation derived from the existing Na'aseh colors, logo,
  terminology, state meanings, and accessibility rules while following native iPhone, iPad, and Mac
  interaction conventions.
- Documented local iPhone/iPad simulator, physical-device, Mac run, archive, TestFlight, and
  troubleshooting flows.

**Depends on:** none.

**Source specifications:** 001 baseline, 008 responsive experience, repository architecture.

### 2. Native App Shells, Navigation, and Lifecycle

**Suggested slug:** `013-ios-shell-lifecycle`

Create separate native phone, tablet, and desktop shells that share navigation state and feature
logic while behaving correctly across launch, activation, backgrounding, suspension or termination,
memory pressure, window restoration, orientation change, and text input.

Include:

- Safe-area-aware header, menus, dialogs, sheets, rich-text toolbars, bottom actions, and status
  banners on iPhone.
- iPad `NavigationSplitView` composition, adaptable two- and three-column layouts, resizable
  multitasking windows, popovers, inspectors, toolbars, and state restoration across portrait,
  landscape, full-screen, and compact window sizes.
- Mac `WindowGroup`, sidebar/content/inspector structure, resizable windows, toolbars, sheets,
  popovers, menu-bar commands, and state restoration using desktop conventions.
- iOS back-navigation and deep-link behavior that preserves the current task, list, journal entry,
  crisis plan, and modal context.
- State restoration rules for drafts, filters, scroll position, open records, pending mutations, and
  sensitive unlocked content.
- A launch/loading experience that distinguishes locked, signed-out, offline, restoring, syncing,
  migrating, and unrecoverable states.
- External-link rules that keep trusted application routes in-app and open untrusted sites safely in
  the system browser.
- VoiceOver order, Dynamic Type/reflow, reduced motion, dark-mode decision, and hardware/software
  keyboard behavior.
- VoiceOver, Full Keyboard Access, pointer/trackpad, Apple Pencil, focus-ring, drag/drop, and
  keyboard-shortcut behavior on iPad, with visible alternatives for hover-, Pencil-, or drag-only
  interactions.
- VoiceOver, Full Keyboard Access, pointer, context-menu, focus-ring, keyboard-shortcut, and large-
  text behavior on Mac without making hover or drag the only way to perform an action.

**Depends on:** 1.

**Source specifications:** 008 responsive experience and the UI/accessibility requirements in all
current specs.

### 3. Apple-platform Authentication and Secure Session Handling

**Suggested slug:** `014-apple-auth-session`

Provide sign-in, sign-out, password/PIN flows, TFA, session renewal, account-disable handling, and
safe device-local session storage in both native applications.

Include:

- A native URLSession-compatible form of the current opaque-session and CSRF protections, including
  cookie or token persistence, origin expectations, revocation, and expired-session behavior. Any
  server contract change must remain compatible with the web client and preserve current security
  properties.
- Secure storage of only the minimum device/session material in Keychain; no plaintext credentials.
- Password-manager and AutoFill-compatible username, password, one-time-code, and new-password
  fields.
- Optional Face ID/Touch ID re-entry for a locally locked but still server-authenticated app, with
  device-passcode fallback and an explicit sign-out path.
- Automatic locking and in-memory key zeroization when the app backgrounds or the configured idle
  interval expires.
- Account switch/sign-out cleanup that removes the previous user's cached records, keys, pending
  previews, notification association, and transient UI state without deleting unsynchronized work
  silently.

**Depends on:** 1-2.

**Source specifications:** 001 baseline, 007 account UX, 009 task security modernization.

### 4. Encrypted Local Store Migration and Offline Synchronization

**Suggested slug:** `015-native-offline-sync`

Implement native encrypted local stores, outboxes, cursors, conflicts, and migrations that remain
reliable across iOS, iPadOS, and macOS app upgrades, storage pressure, suspension, and forced
termination.

Include:

- Select and document a native persistence layer such as SwiftData/Core Data or SQLite based on
  atomic transactions, migration control, encrypted-record handling, query needs, testability, and
  predictable behavior under termination. Do not assume a framework encrypts application fields.
- Implement the established encrypted-record envelope and associated-data rules with audited Apple
  cryptographic APIs or a narrowly reviewed dependency; prove byte-level interoperability with web
  fixtures before storing production-compatible data.
- Device-key generation and wrapping with Keychain protection, including reinstall, device restore,
  keychain synchronization policy, and unavailable-key behavior.
- Atomic local mutation plus outbox writes, idempotent replay, authorized pulls, privacy purge, and
  visible pending/conflict/retry states.
- Foreground sync on launch, resume, manual refresh, and connectivity restoration.
- Correctness when iOS, iPadOS, or macOS prevents or ends background work; no false “synced” state.
- Storage quota/health warnings, migration rollback or recovery behavior, and protection against a
  partially upgraded database.
- Compatibility tests among PWA, iPhone, iPad, and Mac clients editing the same account concurrently.

**Depends on:** 1-3.

**Source specifications:** offline, sync, encryption, conflict, privacy-purge, and migration
requirements in 001-005 and 009-011.

### 5. Core Tasks, Search, and Post-it Experience

**Suggested slug:** `016-ios-core-tasks`

Deliver native iPhone, iPad, and desktop Mac parity for the primary task workflow using the existing
domain rules with platform-appropriate interfaces.

Include:

- Create, view, edit, complete, restore, and archive tasks and subtasks.
- Labels, safe rich-text memo, links, owner/assignee, category/project/group, privacy/lock state,
  priority/urgency, due date/time, reminder, and post-it color.
- List and post-it views, search across authorized content, filters, cached results, and empty/error
  states.
- Completion undo, completion sound preference, reduced-motion behavior, and immutable revision
  semantics.
- Hidden-memo unlock/edit/relock behavior and protection in app-switcher snapshots.
- Touch-friendly menus and pickers with no hover-only, drag-only, or fine-pointer-only actions.

**Depends on:** 1-4.

**Source specifications:** 001 baseline, 005 urgency/ranking, 007 account UX, 008 responsive
experience, 009 task security modernization.

### 6. Personal Stack and Task Timer

**Suggested slug:** `017-ios-stack-timer`

Bring the personal overall/project stack and synchronized repeating task timer to iPhone, iPad, and
Mac.

Include:

- Touch drag ranking plus accessible move-up, move-down, and direct-position alternatives.
- Filtered and project-specific ranking with the existing per-user ownership rules.
- One account-wide timer, task switching confirmation, work/rest/repeat intervals, pause/resume/reset,
  server-time correction, and multi-device conflict behavior.
- Timer continuity across navigation, screen lock, backgrounding, suspension, clock changes, and
  relaunch without depending on continuous execution.
- Optional local timer-completion feedback that does not mark the task complete or disclose its name
  on the lock screen without user consent.

**Depends on:** 4-5.

**Source specifications:** 005 urgency/ranking and 009 task security modernization.

### 7. Lists, Global Items, Groups, and Attachments

**Suggested slug:** `018-ios-lists-files`

Deliver the current list and collaboration workflows with native iPhone, iPad, and Mac file handling.

Include:

- Create/edit/archive/copy lists; add, reorder, edit, complete, restore, and remove list items; signed
  costs/credits and totals.
- Reusable global items, overrides, reset-to-global, visibility scopes, owner locks, and groups.
- Online-only encrypted attachment upload with progress, cancellation/retry, malware-scan state,
  download, preview, share sheet, and removal.
- iOS document picker, Files integration, photo library, and optional camera capture with just-in-time
  permissions and clear 25 MiB/type validation.
- Temporary-file cleanup and prevention of protected attachments entering unencrypted caches,
  backups, logs, or previews after sign-out/revocation.

**Depends on:** 4-5.

**Source specifications:** 001 baseline and 002 enhanced list management.

### 8. Projects, Archive, Completed Tasks, and Export

**Suggested slug:** `019-ios-organize-report`

Provide native phone, tablet, and desktop workflows for organizing, reviewing, restoring, reporting,
and exporting work.

Include:

- Category/project browsing, unassigned work, workload counts, end dates, and authorized
  administration.
- Task/list archive, restore, deliberate permanent-delete warnings, and server-authoritative delete
  preconditions.
- Completed Tasks filters, positive-only periods, totals, urgency breakdowns, local-time boundaries,
  cached/offline status, and accessible empty states.
- Asynchronous verified CSV export, progress/status, secure download to Files, and share-sheet handoff
  without retaining an unmanaged plaintext copy inside the app.

**Depends on:** 4-5 and 7 for list archive parity.

**Source specifications:** 003 archive/project/reporting, 005 urgency/ranking, 008 responsive
experience, 009 complete export.

### 9. Private Journal and Wellness Dashboard

**Suggested slug:** `020-ios-private-journal`

Bring the owner-only encrypted journal, settings, rich-text entries, task reflections, and wellness
dashboard to iPhone, iPad, and Mac without weakening its privacy model.

Include:

- Journal key setup/unlock/recovery compatibility and optional biometric re-unlock of a Keychain-
  wrapped local key.
- Add, browse/filter, read, and edit one entry per local date; preserve the no-delete rule.
- All current numeric, yes/no, DBT, configurable-section, task-reference, and rich-text fields.
- Dashboard ranges, metric cards, comparisons, contributor dialogs, and exact no-data semantics.
- Offline encrypted drafts, deliberate conflict resolution, app-background relock, memory zeroization,
  and app-switcher screenshot protection.
- No analytics, notification text, crash breadcrumb, Siri suggestion, search index, or widget may
  contain journal content or content-derived values.

**Depends on:** 3-4 and 5 for task references.

**Source specifications:** 010 private journal.

### 10. Crisis Plans and Selective Sharing

**Suggested slug:** `021-ios-crisis-plans`

Implement crisis-plan creation, journal gating, triggered display, owner editing, and registered-user
sharing with the same privacy and availability rules as the web product.

Include:

- Require a valid current plan before a new journal entry while retaining access to existing entries.
- Show the owner's plan for the current in-form triggering answers without interpreting risk,
  alerting anyone, or claiming clinical monitoring.
- Owner offline availability and pending edits; recipient online reauthorization on every open or
  refresh; no recipient offline copy.
- Share, revoke, recipient-remove, relationship status, and immediate subsequent-read denial.
- Universal/deep links to authorized shared plans that reveal no protected content before sign-in and
  authorization.
- Screen-capture/background-preview protections and explicit communication of the limits of
  revoking copies made outside the app.

**Depends on:** 9, plus 3-4.

**Source specifications:** 011 journal crisis plan.

### 11. Native Alerts, Timer Activities, and Reminder Preferences

**Suggested slug:** `022-apple-notifications`

Replace browser-install-dependent Web Push behavior with native iOS, iPadOS, and macOS alerts for
task events and timer transitions while keeping the existing per-device opt-in and privacy rules.

Include:

- APNs registration, application-server device-token association, rotation, invalidation, sign-out
  cleanup, and environment separation.
- User-initiated permission request, accurate denied/unavailable states, Settings deep link, and a
  per-device enable/disable preference.
- Local notifications for task due/reminder events and work/rest timer interval completion, including
  reliable system delivery when the app is backgrounded or terminated. APNs remains available for
  server-known changes and cross-device reminder reconciliation.
- A timer Live Activity with Lock Screen and supported Dynamic Island presentation, showing current
  interval type, remaining time, paused/running state, and privacy-safe controls without requiring
  the application to execute continuously.
- A desktop timer surface on Mac using an ordinary window/toolbar and an optional menu-bar status
  item with keyboard-accessible controls. Do not imitate Dynamic Island or require the main window
  to remain open.
- Generic lock-screen-safe notification and Live Activity content by default; previews must not
  expose private task, journal, memo, list, group, or crisis-plan content. Any option to show a task
  label must be explicit, reversible, and off by default.
- Notification actions for open, snooze, and other safe event-specific actions. Timer pause, resume,
  reset, repeat, or task-switch actions must reapply authorization and canonical timer conflict rules
  before changing synchronized state.
- Tap routing to the authorized record after session validation, with a safe fallback when it was
  deleted, revoked, private, or unavailable.
- Foreground presentation, sound/haptic preferences, badge policy, duplicate suppression,
  changed/cancelled reminders, time zones, daylight-saving transitions, and multi-device behavior.
- Reconciliation on launch/resume so delivered or pending alerts are cancelled or replaced when the
  task, due time, reminder, or canonical timer changed on another device. Notification delivery must
  never be treated as guaranteed or as proof that an event occurred.

**Depends on:** 3-5. Can proceed in parallel with 6-10 after those foundations exist.

**Source specifications:** 001 reminders, 006 browser push preference, 009 profile/reminder settings.

### 12. Retired Google Tasks integration

Remove connection, OAuth, import/export, conflict, sharing, worker, schedule, credential, local
cache, and observability paths from web, API, AWS, and native clients. Preserve existing completed-
task CSV column positions as blank v1 compatibility fields. Delete the browser cache on schema
upgrade and decommission any retained production OAuth secret through a reviewed operator step.

### 13. Profile and Account Security

**Suggested slug:** `024-apple-profile-security`

Provide native iPhone, iPad, and Mac access to personal settings and account-security workflows
while keeping system administration on the web.

Include:

- Profile photo/avatar, completion sound, reminders/notifications, password,
  TFA, and other personal settings.
- Clear online-only behavior for security and account actions that cannot safely queue offline.
- Administrator TFA enforcement and session revocation/disabled-account behavior.
- Keep user administration, category/project administration, operator-only user provisioning, and
  recovery-administrator operations out of the native apps. Direct affected users to the web app
  when an administrative workflow is required.

**Depends on:** 3-4; integrates with 7, 8, 11, and 12.

**Source specifications:** 001 baseline, 003 projects, 007 account UX, 009 security modernization.

### 14. App Privacy, Platform Security, and Abuse Resistance

**Suggested slug:** `025-ios-platform-security`

Threat-model and harden both native applications, their extensions, shared storage, Mac sandbox,
and system integrations before external distribution.

Include:

- Allowed-origin and universal-link policy, untrusted web-content isolation, extension/app-group
  boundaries, input validation, and denial of unauthorized processes or content access to native
  capabilities.
- Keychain accessibility classes, biometric policy, backup exclusion, clipboard policy, temporary
  file protection, screenshot/app-switcher treatment, jailbreak/debugger risk decision, and secure
  deletion limits.
- Mac App Sandbox entitlements, application-group boundaries, hardened runtime, file-access security
  scopes, Keychain access groups, window restoration, pasteboard exposure, and local backup policy.
- ATS configuration and certificate/domain policy without unsafe production exceptions.
- Privacy manifest, required-reason APIs, permission purpose strings, App Store privacy labels, data
  retention/deletion disclosures, and export-encryption questionnaire inputs.
- Redacted native logs, metrics, traces, and crash reports with correlation to existing backend
  observability but no protected content.
- Negative tests for cross-account data remnants, malicious links/files, revoked sharing, disabled
  users, replay, stale notification taps, and compromised bridge inputs.

**Depends on:** begins with 1 and becomes a release gate across all features.

**Source specifications:** security and threat-model sections of 001, 002, 004, 009, 010, and 011;
existing documents under `docs/security/`.

### 15. Siri, Apple Intelligence, and Shortcuts Task Actions

**Suggested slug:** `026-ios-siri-task-actions`

Let a signed-in user create a task by voice with Siri using either the Na'aseh or GSD app name and
make the same action available through Apple Intelligence, Spotlight, the Shortcuts app, and other
supported iOS 27, iPadOS 27, and macOS 27 system experiences. Share the intent contract and execution
logic between platforms; do not implement or test a legacy SiriKit fallback.

Include:

- A native `Create Task` App Intent with parameters for label, due date, due time, destination, and
  other deliberately supported fields. The minimum utterance creates a task label; omitted optional
  values use the same defaults as in-app task creation.
- App Shortcut phrases such as “Add a task in Na'aseh” and “Use GSD to add a task,” using the system
  application-name token plus approved spoken/alternative app-name metadata. Validate pronunciation
  and recognition for both names on Siri AI-capable physical devices with matching supported system
  and Siri languages.
- Runtime capability handling on supported hardware when Apple Intelligence is disabled, not
  downloaded, or unavailable for its language, region, or account. The rest of the Na'aseh app must
  remain usable without claiming voice actions are available.
- Native Siri AI and Shortcuts registration on iPhone, iPad, and Mac, including continuation into the
  correct phone/tablet scene or Mac window when an action requires authentication, disambiguation,
  or review.
- Destination App Entities and queries for authorized projects and other supported destinations.
  Siri must ask a concise disambiguation question when names collide or “to …” could refer to more
  than one destination; it must never silently choose the wrong record.
- Natural date/time handling for requests such as “tomorrow at 3 PM,” with the existing browser-
  local due-date/due-time semantics reproduced for the user's current calendar and time zone.
- Authentication and privacy rules for foreground and background execution. Create in the background
  only when the current user, local key, requested destination, and mutation store are safely
  available; otherwise ask the user to unlock or continue in the app without losing recognized
  parameters.
- Atomic offline task creation plus outbox entry when permitted, followed by the same idempotent sync
  and conflict behavior as an in-app creation. Never announce success until the local durable write
  succeeds.
- A brief spoken/displayed confirmation that identifies the new task without revealing private
  content on a locked device. Provide an undo path when supported and a deep link to review or edit
  the created task.
- An explicit per-device Siri/Shortcuts opt-in and explanation that intent phrases and exposed entity
  representations participate in Apple system experiences. Do not expose hidden memos, journal
  content or metrics, crisis plans, attachments, credentials, private task content, or unrelated
  search indexes to Siri or Apple Intelligence.
- App Intent and App Entity contract tests, locked/unlocked/offline/ambiguous-name tests, VoiceOver
  and audio-only responses, cancellation, duplicate invocation, extension termination, and physical-
  device Siri validation.

**Depends on:** 2-6 and 14. Integrates with 11 for alerts created from spoken due times.

**Source specifications:** task creation and authorization in 001, offline/conflict behavior in 001
and 009, due-date/time behavior in 009, and Apple-platform security in Feature 14.

### 16. Native macOS Desktop Experience

**Suggested slug:** `027-macos-desktop-experience`

Deliver every in-scope end-user feature through an intentional macOS 27 desktop interface built in
SwiftUI, sharing business logic with iPhone without reusing the phone composition as the desktop
layout.

Include:

- A desktop information architecture using resizable `WindowGroup` scenes, sidebars, content
  columns, inspectors, toolbars, sheets, popovers, and status surfaces appropriate to each workflow.
- Multi-window behavior for useful independent contexts such as a task, list, journal entry, report,
  or timer; deterministic routing when Siri, a notification, Spotlight, or a deep link opens content;
  and safe restoration after quit or system restart.
- Native application menus and discoverable keyboard shortcuts for create, save, search, navigate,
  complete, undo/redo, sync, open settings, operate the timer, and close windows. Respect standard
  macOS menu placement and reserved shortcuts.
- Pointer precision, hover as supplemental feedback, selection, right-click context menus, drag and
  drop, trackpad gestures, focus rings, and full keyboard operation. Every drag or context-menu
  command must retain a visible accessible alternative.
- Desktop-density task/list tables and adaptable post-it boards that use wide windows effectively
  without sacrificing readable line length, zoom, VoiceOver order, or narrow-window operation.
- Native `NSOpenPanel`/`NSSavePanel`-backed file selection and export, Finder drag/drop, Quick Look or
  safe preview where authorized, security-scoped URL handling, and deterministic temporary-file
  cleanup.
- Mac Notification Center alerts and actions, dock badge policy, and a desktop timer surface with an
  optional menu-bar status item. Timer correctness must not depend on keeping a window open.
- macOS Keychain, app sandbox, local encrypted-store location, backup exclusion, screen-lock/relock,
  clipboard, Services, Spotlight, Siri AI, and Apple Intelligence privacy behavior.
- Mac-specific authentication and OAuth browser-return behavior, password AutoFill, TFA, universal
  links, app activation, and multiple-window session-expiry handling.
- SwiftUI previews plus macOS unit, integration, UI, accessibility, resize, multiple-window,
  keyboard, menu-command, file, notification, offline/reconnect, upgrade, and Siri AI tests on Apple
  silicon with macOS 27 only.

**Depends on:** 1-15. Desktop acceptance criteria must also be added to each applicable feature
rather than deferred entirely to this final integration feature.

**Source specifications:** all current end-user specifications, Feature 2 native shells, Feature 11
alerts/timers, Feature 14 platform security, and Feature 15 Siri/Apple Intelligence.

### 17. Native iPadOS Tablet Experience

**Suggested slug:** `028-ipados-tablet-experience`

Deliver every in-scope end-user feature through an intentional iPadOS 27 interface built in SwiftUI,
sharing business logic with iPhone and Mac without stretching the phone composition or copying the
desktop arrangement unchanged.

Include:

- A tablet information architecture using `NavigationSplitView`, adaptable sidebars, content and
  detail columns, inspectors, toolbars, sheets, and popovers that respond deliberately to available
  window width.
- Full-screen, portrait, landscape, external-display, and resizable multitasking-window behavior
  with no clipped actions, accidental compact-mode data loss, or reliance on a fixed screen size.
- Multiple-window behavior for useful independent contexts such as a task, list, journal entry,
  report, or timer; deterministic routing when Siri, a notification, Spotlight, or a deep link opens
  content; and safe state restoration after termination or restart.
- Hardware-keyboard navigation and shortcuts, trackpad/pointer interaction, focus rings, selection,
  context menus, drag and drop, and Apple Pencil-aware input. Every pointer, Pencil, hover, or drag
  action must retain a visible touch and accessibility alternative.
- Tablet-density task/list tables and adaptable post-it boards that use wide screens effectively
  while remaining usable in narrow multitasking windows, at large Dynamic Type sizes, and with
  VoiceOver or Full Keyboard Access.
- Native document/photo pickers, Files integration, drag/drop between apps, share sheets, and safe
  attachment/export previews with temporary-file cleanup and authorization checks.
- iPad notification and timer presentation, Lock Screen activity where supported, badge policy, and
  scene routing without assuming the app remains foregrounded.
- iPadOS Keychain, local encrypted-store location, backup exclusion, screen-lock/relock,
  pasteboard, Spotlight, Siri AI, Apple Intelligence, and onscreen-content privacy behavior.
- iPad-specific sign-in, password AutoFill, TFA, biometric unlock, OAuth return, universal links,
  scene activation, and multi-window session-expiry handling.
- SwiftUI previews plus iPadOS unit, integration, UI, accessibility, resize, multiple-window,
  keyboard/trackpad, Pencil, drag/drop, file, notification, offline/reconnect, upgrade, and Siri AI
  tests on iPad mini (A17 Pro) and representative M-series iPads with iPadOS 27 only.

**Depends on:** 1-15. Tablet acceptance criteria must also be added to each applicable feature
rather than deferred entirely to this final integration feature.

**Source specifications:** all current end-user specifications, Feature 2 native shells, Feature 11
alerts/timers, Feature 14 platform security, and Feature 15 Siri/Apple Intelligence.

### 18. Apple App Quality, Release, and TestFlight Operations

**Suggested slug:** `029-apple-release-operations`

Create repeatable testing, signing, beta distribution, App Store submission, monitoring, rollback,
and support processes.

Include:

- Unit/contract tests for shared and platform adapters plus focused required iPhone, iPad, and macOS
  smoke suites whose measured PR runtime keeps total required validation at or below ten minutes.
- Exhaustive simulator/device matrices as local or release gates on iOS 27 only: representative
  supported Apple Intelligence-capable iPhones, enabled and unavailable Siri AI states, orientation,
  Dynamic Type, VoiceOver, reduced motion, offline/reconnect, low storage,
  background/termination, notification, Live Activity, Siri/App Intents, OAuth, migration, and
  multi-device conflict cases. Do not spend validation time on iOS 26 or earlier.
- Physical-device validation for Keychain/biometrics, APNs, local alerts, Live Activities,
  Siri/Apple Intelligence phrases, camera/files, audio, background behavior, app upgrades, and real
  Safari/PWA interoperability.
- Physical iPad validation for resizing/multitasking, multiple windows, keyboard/trackpad, Apple
  Pencil, Files drag/drop, Keychain/biometrics, notifications, Siri AI, OAuth return, app upgrades,
  and web/iPhone/Mac interoperability.
- Physical Apple-silicon Mac validation for windowing, menus, keyboard commands, file access,
  Keychain, notifications, timer surface, Siri AI, OAuth return, app upgrades, and web/iPhone
  interoperability.
- CI archive/signing with protected credentials, a universal iPhone/iPad TestFlight build and a
  separate macOS TestFlight build, release notes, phased testing, crash/health review,
  rollback/kill-switch decisions, and support diagnostics that do not expose user data.
- App Store metadata, screenshots made from non-sensitive fixtures, review notes/demo account,
  privacy/support URLs, age-rating decision, and review-guideline checks.
- A compatibility policy stating the iOS 27.0, iPadOS 27.0, and macOS 27.0 minimums, minimum
  supported Na'aseh app versions, server API contract window, forced vs. optional upgrades, and
  behavior when an installed app is too old.

**Depends on:** starts with 1 and is completed after the intended v1 feature set.

**Source specifications:** validation, accessibility, performance, recovery, release, and operations
requirements across all current specs and runbooks.

## First TestFlight release scope

The first TestFlight release will include all 18 backlog features for full end-user web parity on
iPhone, iPad, and Mac, plus native alerts, timer activities, and Siri task creation. Feature 13
excludes system administration and operator-only workflows. Keep the feature order so foundations,
privacy, and data durability are validated before higher-level parity work.
Do not treat the build as TestFlight-ready until all features pass the platform-security and release
gates.

## Confirmed security decision

Face ID and Touch ID only unlock locally protected state after ordinary server sign-in. Passkey-
based server authentication is outside this feature and may be evaluated separately later.

## Current-spec coverage map

| Existing specification                          | iOS backlog features |
| ----------------------------------------------- | -------------------- |
| 001 Na'aseh v1 Baseline                         | 1-5, 7, 11, 13-18    |
| 002 Enhanced List Management                    | 7-8, 14, 16-18       |
| 003 Archive, Projects, and Completion Reporting | 8, 13-14, 16-18      |
| 004 Bidirectional Google Tasks Sync (retired)   | 12                   |
| 005 Urgency Levels and Stack Ranking            | 5-6, 8, 16-18        |
| 006 Per-Browser Push Notifications              | 11, 14, 16-18        |
| 007 Task and Account Experience Refinements     | 3, 5, 13-18          |
| 008 Responsive Completed Tasks Experience       | 1-2, 5, 8, 16-18     |
| 009 Task Security and Experience Modernization  | 3-6, 8, 11, 13-18    |
| 010 Private Journal and Wellness Dashboard      | 4, 9, 14, 16-18      |
| 011 Journal Crisis Plan                         | 4, 9-10, 14, 16-18   |
