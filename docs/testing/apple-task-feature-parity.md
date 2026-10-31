# Apple task feature parity audit — 2026-10-30

Scope: current task workflows in the native macOS, iOS, and iPadOS applications,
including task-related search, reports, files, finance links, Siri, and timer surfaces.
The implementation gaps from the earlier audit are now connected to the live workspace.
Physical-device acceptance remains separate from implementation and simulator validation.

## Implemented parity

All three platform shells use the shared authenticated task workspace.

| Workflow | Native implementation |
| --- | --- |
| Task editing | Title, priority, progress, privacy, color, link, assignee, category, project, group, parent, due date/time, and repeating schedules. Searchable authorized reference pickers include the people directory. Patches send only changed fields and explicitly clear removed values. |
| Task lifecycle | Create, edit, complete, completion undo, archive, restore, subtasks, cycle prevention, recurring completion, and retained failed drafts. Mac New Task commands route to the live workspace. |
| Rich and hidden memos | Structured rich text; PIN unlock, edit, save, relock, protected-memo creation, and audited account-password recovery. Recovery registry signatures and recipient bindings are checked. Backgrounding clears unlocked content. |
| Attachments | File import on all platforms; photo import and camera capture on iPhone/iPad where available. Signed upload, scan status, retry, removal, authorized download, checksum verification, preview, and export use the actual attachment contract. Temporary previews and photo staging are cleaned up. |
| Search and filters | Task and combined task/list search, default assignment/group scope, all-readable scope, match-any conditions, multi-select people/groups, lifecycle, progress, date presets/ranges, and existing task sort choices. Hidden memo plaintext is excluded. |
| Personal stacks | Overall/project stacks, encrypted caching, drag and explicit position controls, filtered-slot preservation, and canonical text-search basis for reordering. |
| Account timer | Durable server timer, pause/resume/stop/restart, duration and repeat controls, task-switch confirmation, canonical server-time projection, and Mac timer/menu surfaces. Timer mutations use sync contract v5; other current task/stack batches use v4. |
| Reminders and activities | Per-device opt-in, APNs registration/unregistration, generic notification content and authorized routing, offline local reminder fallbacks, timer notifications, iPhone/iPad Live Activities, and persisted completion-sound preference. Activity actions validate the current timer run. |
| Reports and export | Live completion summaries, filters, completion-event history, encrypted matching-filter offline cache, and full CSV export with header, row-count, and SHA-256 verification. |
| Sync review | Pending/conflicted/rejected work remains durable. Review compares saved fields with fresh authorized task/timer/stack state; retry rebases ordered commands atomically, and use-current explicitly discards saved changes. Account and generation checks prevent stale cache writes. |
| Finance links | A dual-authorized task-link endpoint and native related budget-item view show planned/actual/variance information only when the account can read both sides. |
| Siri | Explicit opt-in, authenticated app continuation, current authorized project choices, local-time due-date parsing, durable deterministic creation IDs, and replay protection across service recreation. |
| Lock and logout | Background locking clears sensitive views, notifications unregister before logout, activities end, and account-specific caches and Siri state are purged. |

## Validation

- `npm run apple:test`: **119 tests passed** across sync, services, persistence,
  performance, features, crypto, and contracts. Coverage includes signed attachment
  transfers, report verification, hidden-memo recovery, atomic conflict resolution,
  account isolation, timer/stack wire contracts, changed-field patches, and Siri replay.
- `npm run apple:build:ios`: **passed**, including the universal iPhone/iPad simulator
  application and extensions.
- `npm run apple:build:macos`: **passed**.
- Create → complete → undo UI journey: **passed** on iOS 27 iPhone 18 Pro and
  iPad Pro 11-inch (M5) simulators (18.54 s and 18.62 s respectively).
- Mac create → complete → undo UI journey: **passed**, 12.05 s, zero failures.
  The test fixture uses memory-only telemetry and ignores saved window state; the main
  workspace is explicitly presented on launch. This resolved the initial keychain/startup
  blockers. The test asserts the accessible completion control used by the Mac task row.
- `npm run typecheck` and `npm run lint`: **passed**.
- Four targeted API/security test files: **12 tests passed**, 0.63 s wall time.
- `git diff --check`: **passed**.

The required PR workflow and browser quick-suite configuration were not expanded by
this parity work. Assertions were added within existing API test cases: task tests
remained 5 cases (0.65 s before, 0.48 s after); finance link tests remained 7 cases
(0.57 s before, 0.50 s after). Added Swift tests and focused native UI journeys run
through optional Apple validation. No hosted required-check duration is claimed;
Apple app builds have not been uploaded to TestFlight. Backend release evidence follows below.

## Device acceptance

Physical APNs delivery, camera hardware, Siri invocation, Live Activity lifecycle,
VoiceOver, and real multi-client/offline scenarios still require device acceptance.
The implemented service contracts and simulator tests do not certify those external
system behaviors. Backend changes must ship with the corresponding native release.

## Backend-only production release

PR [#86](https://github.com/stevekessler/naaseh/pull/86) deployed task patch support
for explicitly clearing `categoryId` and `memoDocument` at commit
`c3aba0ac3eaa3469d59744b336fef7a54e2d9368`. The release delta contains four
task API/contract/test files and excludes new Finance changes and Apple app builds.
Existing production Finance behavior remains at its previously deployed version.

[Production run 41168977514](https://github.com/stevekessler/naaseh/actions/runs/41168977514)
completed successfully at 2026-10-31 04:43 UTC: validation, CloudFormation deployment,
and authenticated production canary all passed; rollback was not needed.
The required validation job took 5 minutes 32 seconds. Before merge, local release
gates passed 1,364 tests and 528 browser cases, with 20 expected skips; hosted PR
validation took 6 minutes 34 seconds.
