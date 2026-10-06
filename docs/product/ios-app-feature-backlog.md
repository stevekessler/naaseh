# Na'aseh iPhone App Feature Backlog

## Purpose

This document turns the current Na'aseh web specifications into a set of bounded features that can
be specified and implemented one at a time with Spec Kit. It describes work needed for an App Store
iPhone application; it does not repeat every web requirement. Unless a feature says otherwise, the
existing product behavior and authorization rules remain the source of truth.

## Selected product direction

Build a fully native SwiftUI application. The iOS client will reuse the existing backend APIs,
wire-format contracts, authorization model, product requirements, synchronization semantics, and
cryptographic formats. It will not embed the web application or directly reuse the React UI, Dexie
repositories, TypeScript sync engine, browser crypto implementation, or browser test suite.

This is a native client rewrite. Every feature must include the necessary Swift domain models,
networking, persistence, synchronization, cryptography, SwiftUI presentation, accessibility, and
native tests. Contract fixtures and cross-client compatibility tests must ensure the SwiftUI and web
clients interpret server data and security rules identically.

## Confirmed release decisions

- The first release will be distributed through TestFlight rather than submitted to the public App
  Store.
- The first release will provide every current end-user web feature, including lists, reports,
  Journal, Crisis Plans, Google Tasks, files, offline work, reminders, ranking, and timers.
- System administration and operator-only recovery/provisioning will remain web-only. The iOS app
  will retain personal Profile and account-security settings.
- SwiftUI is the selected implementation strategy. iPhone/iPad device scope and biometric scope
  remain to be decided.

## Cross-cutting rules for every iOS feature

- Preserve the current server-side authorization, privacy, role, sharing, and conflict rules.
- Preserve encrypted-at-rest local data and ciphertext-only handling for hidden memos, journals, and
  crisis plans.
- Never silently discard offline or conflicting work.
- Do not make background execution a correctness dependency; iOS may suspend the app at any time.
- Keep secrets, protected content, credentials, notification payloads, and cryptographic material out
  of logs, analytics, crash reports, URLs, previews, and screenshots.
- Meet iOS accessibility expectations for VoiceOver, Dynamic Type, reduced motion, contrast,
  keyboard/switch input, and 44-by-44-point touch targets.
- Treat existing API and sync contracts as backward-compatible interfaces shared with the PWA.
- Keep required pull-request validation below ten minutes. Measure test count and runtime before and
  after adding iOS-related tests to required validation; keep exhaustive device matrices in release
  gates.

## Feature sequence

Each numbered section is intended to become its own Spec Kit feature. The suggested slug can be used
as the starting feature name.

### 1. iOS Application Foundation

**Suggested slug:** `012-ios-app-foundation`

Create a native SwiftUI application with a maintainable modular architecture, separate development
and production configuration, and repeatable simulator and physical-device builds.

Include:

- Xcode workspace/project, Swift package/module boundaries, iOS bundle identifier, app icons, launch
  screen, display name, versioning, and signing configuration without committed signing secrets.
- Native application, scene, dependency, navigation, networking, persistence, synchronization,
  cryptography, and feature-module boundaries.
- Environment configuration for API origin, universal/deep links, notification environment, and
  feature flags, with no production secrets compiled into the application.
- Swift request/response models that match the existing API and sync wire formats, backed by shared
  fixtures and compatibility tests rather than duplicated undocumented assumptions.
- A design-system foundation derived from the existing Na'aseh colors, logo, terminology, state
  meanings, and accessibility rules while following native iOS interaction conventions.
- A documented local build, simulator run, physical-device run, archive, and troubleshooting flow.

**Depends on:** none.

**Source specifications:** 001 baseline, 008 responsive experience, repository architecture.

### 2. Native App Shell, Navigation, and Lifecycle

**Suggested slug:** `013-ios-shell-lifecycle`

Adapt the responsive interface to behave correctly inside an iPhone app across cold launch,
foregrounding, backgrounding, suspension, termination, memory pressure, orientation change, and the
on-screen keyboard.

Include:

- Safe-area-aware header, menus, dialogs, sheets, rich-text toolbars, bottom actions, and status
  banners.
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

**Depends on:** 1.

**Source specifications:** 008 responsive experience and the UI/accessibility requirements in all
current specs.

### 3. iOS Authentication and Secure Session Handling

**Suggested slug:** `014-ios-auth-session`

Provide sign-in, sign-out, password/PIN flows, TFA, session renewal, account-disable handling, and
safe device-local session storage in the iPhone container.

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

**Suggested slug:** `015-ios-offline-sync`

Implement a native encrypted local store, outbox, cursors, conflicts, and migrations that remain
reliable across iOS app upgrades, storage pressure, suspension, and forced termination.

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
- Correctness when iOS prevents or ends background work; no false “synced” state.
- Storage quota/health warnings, migration rollback or recovery behavior, and protection against a
  partially upgraded database.
- Compatibility tests between PWA and iOS clients editing the same account concurrently.

**Depends on:** 1-3.

**Source specifications:** offline, sync, encryption, conflict, privacy-purge, and migration
requirements in 001-005 and 009-011.

### 5. Core Tasks, Search, and Post-it Experience

**Suggested slug:** `016-ios-core-tasks`

Deliver iPhone parity for the primary task workflow using the existing domain rules and mobile UI.

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

Bring the personal overall/project stack and the synchronized repeating task timer to iPhone.

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

Deliver the current list and collaboration workflows with native iPhone file handling.

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

Provide iPhone workflows for organizing, reviewing, restoring, reporting, and exporting work.

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
dashboard to iPhone without weakening its privacy model.

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

### 11. Native Notifications and Reminder Preferences

**Suggested slug:** `022-ios-notifications`

Replace browser-install-dependent Web Push behavior with an iOS notification channel while keeping
the existing per-device opt-in and privacy rules.

Include:

- APNs registration, application-server device-token association, rotation, invalidation, sign-out
  cleanup, and environment separation.
- User-initiated permission request, accurate denied/unavailable states, Settings deep link, and a
  per-device enable/disable preference.
- Generic lock-screen-safe task reminder payloads by default; notification previews must not expose
  private task, journal, memo, list, group, or crisis-plan content.
- Tap routing to the authorized record after session validation, with a safe fallback when it was
  deleted, revoked, private, or unavailable.
- Foreground presentation, badge policy, duplicate suppression, changed/cancelled reminders, time
  zones, daylight-saving transitions, and multi-device behavior.

**Depends on:** 3-5. Can proceed in parallel with 6-10 after those foundations exist.

**Source specifications:** 001 reminders, 006 browser push preference, 009 profile/reminder settings.

### 12. Google Tasks OAuth and Deep Links

**Suggested slug:** `023-ios-google-tasks`

Make Google Tasks connection and bidirectional sync work through an iOS-safe OAuth flow and return
reliably to the app.

Include:

- ASWebAuthenticationSession or system-browser authorization, PKCE/state validation where
  applicable, universal/custom callback links, cancellation, and expired-flow handling.
- Connect, preview, scope selection, manual sync, pause, resume, conflict resolution, status,
  disconnection, and token-revocation behavior.
- Foreground reconciliation after the callback; no assumption that the embedded web view or app ran
  continuously during authorization.
- Deep-link allowlisting and prevention of callback, token, task, or user data leakage to logs or
  third-party handlers.

**Depends on:** 2-5.

**Source specifications:** 004 Google Tasks sync and 009 profile separation.

### 13. Profile and Account Security

**Suggested slug:** `024-ios-profile-security`

Provide mobile access to personal settings and account-security workflows while keeping system
administration on the web.

Include:

- Profile photo/avatar, completion sound, reminders/notifications, Google connection, password,
  TFA, and other personal settings.
- Clear online-only behavior for security and account actions that cannot safely queue offline.
- Administrator TFA enforcement and session revocation/disabled-account behavior.
- Keep user administration, category/project administration, operator-only user provisioning, and
  recovery-administrator operations out of the iOS app. Direct affected users to the web app when an
  administrative workflow is required.

**Depends on:** 3-4; integrates with 7, 8, 11, and 12.

**Source specifications:** 001 baseline, 003 projects, 007 account UX, 009 security modernization.

### 14. App Privacy, Platform Security, and Abuse Resistance

**Suggested slug:** `025-ios-platform-security`

Threat-model and harden the native container and bridges before external distribution.

Include:

- Allowed-origin/navigation policy, content-security behavior, bridge method allowlists, input
  validation, and denial of arbitrary web content access to native capabilities.
- Keychain accessibility classes, biometric policy, backup exclusion, clipboard policy, temporary
  file protection, screenshot/app-switcher treatment, jailbreak/debugger risk decision, and secure
  deletion limits.
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

### 15. iOS Quality, Release, and App Store Operations

**Suggested slug:** `026-ios-release-operations`

Create repeatable testing, signing, beta distribution, App Store submission, monitoring, rollback,
and support processes.

Include:

- Unit/contract tests for platform adapters and a focused required iOS smoke suite whose measured PR
  runtime keeps total required validation at or below ten minutes.
- Exhaustive simulator/device matrices as local or release gates: supported iOS versions, small and
  large iPhones, orientation, Dynamic Type, VoiceOver, reduced motion, offline/reconnect, low storage,
  background/termination, notification, OAuth, migration, and multi-device conflict cases.
- Physical-device validation for Keychain/biometrics, APNs, camera/files, audio, background behavior,
  app upgrades, and real Safari/PWA interoperability.
- CI archive/signing with protected credentials, TestFlight workflow, release notes, phased release,
  crash/health review, rollback/kill-switch decision, and support diagnostics that do not expose user
  data.
- App Store metadata, screenshots made from non-sensitive fixtures, review notes/demo account,
  privacy/support URLs, age-rating decision, and review-guideline checks.
- A compatibility policy stating the minimum supported app version, API contract window, forced vs.
  optional upgrades, and behavior when the installed app is too old.

**Depends on:** starts with 1 and is completed after the intended v1 feature set.

**Source specifications:** validation, accessibility, performance, recovery, release, and operations
requirements across all current specs and runbooks.

## First TestFlight release scope

The first TestFlight release will include all 15 backlog features for full end-user web parity,
except that Feature 13 excludes system administration and operator-only workflows. Keep the feature
order so foundations, privacy, and data durability are validated before higher-level parity work.
Do not treat the build as TestFlight-ready until all features pass the platform-security and release
gates.

## Remaining decisions before running `/speckit.specify` for Feature 1

1. **Device scope:** iPhone only initially, or a universal iPhone/iPad app? Should Mac Catalyst be
   explicitly excluded?
2. **Biometrics:** Should Face ID/Touch ID merely unlock local protected state after a normal sign-in,
   or should the app also pursue passkey-based server authentication in a later feature?

## Current-spec coverage map

| Existing specification                          | iOS backlog features |
| ----------------------------------------------- | -------------------- |
| 001 Na'aseh v1 Baseline                         | 1-5, 7, 11, 13-15    |
| 002 Enhanced List Management                    | 7-8, 14-15           |
| 003 Archive, Projects, and Completion Reporting | 8, 13-15             |
| 004 Bidirectional Google Tasks Sync             | 12, 14-15            |
| 005 Urgency Levels and Stack Ranking            | 5-6, 8, 15           |
| 006 Per-Browser Push Notifications              | 11, 14-15            |
| 007 Task and Account Experience Refinements     | 3, 5, 13, 15         |
| 008 Responsive Completed Tasks Experience       | 1-2, 5, 8, 15        |
| 009 Task Security and Experience Modernization  | 3-6, 8, 11, 13-15    |
| 010 Private Journal and Wellness Dashboard      | 4, 9, 14-15          |
| 011 Journal Crisis Plan                         | 4, 9-10, 14-15       |
