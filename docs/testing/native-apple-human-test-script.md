# Native Apple human test script

Use this script for behavior that cannot be proven completely by unit tests or simulators. Run it
before the first internal TestFlight release and repeat the affected section after any related
change. Use only the dedicated smoke account and synthetic content. Do not put real Journal,
Crisis Plan, task, project, category, contact, or file content in screenshots or defect reports.

VoiceOver support is part of the implementation, but manual VoiceOver testing is optional for this
release and is not included as a pass/fail gate below.

## 1. Test record and preparation

Record these values before testing:

- Tester and date:
- Source revision:
- TestFlight build number, if applicable:
- iPhone model and iOS 27 build:
- iPad model and iPadOS 27 build:
- Mac model and macOS 27 build:
- Network used: normal Wi-Fi / offline / constrained:
- Smoke-account fixtures reset: yes / no

Prepare the smoke account in the web app:

1. Create two active projects named `Alpha Home` and `Beta Work`.
2. Create two active categories named `Personal` and `Planning`.
3. Create two projects with the same synthetic spoken name, `Shared Plan`, for ambiguity testing.
4. Create one active task with an alert due at least 15 minutes in the future.
5. Create one completed task, one archived task, one list, one synthetic directory entry, one
   synthetic Journal entry, and a Crisis Plan containing no real health or safety information.
6. Sign in on the web, iPhone, iPad, and Mac. Confirm that the same synthetic records appear.
7. On the Mac, open **System Settings > Privacy & Security > Automation** and allow Xcode to
   control the Na’aseh test runner if macOS asks. Keep the Mac unlocked during Mac UI tests.

Pass condition: all three apps are on OS 27, the fixtures are visible, and no personal data is in
the smoke account.

## 2. Sign-in, TFA, local lock, and account separation

Run on iPhone, iPad, and Mac:

1. Delete the app, reinstall the current TestFlight build, and launch it.
2. Sign in with the smoke account and enter the valid TFA code.
3. Close and reopen the app. Confirm the session is remembered without storing or displaying the
   password or TFA code.
4. Enable the device's biometric lock. Background the app, lock the device, unlock it, and return.
5. Confirm protected content is hidden until Face ID, Touch ID, or the device credential succeeds.
6. Cancel biometric authentication once. Confirm no protected content flashes on screen.
7. Sign out. Confirm cached tasks, Journal content, notification routes, and credentials for that
   account are unavailable.
8. Sign in with a second synthetic account, if available. Confirm no first-account records appear.

Pass condition: authentication, cancellation, lock, and sign-out fail closed, and account data is
strictly separated.

## 3. Core feature and web-parity journey

Run once on each platform, then verify the final state in the web app:

1. Open Tasks and create `Human Test Task` with no project. Confirm it remains unassigned.
2. Create `Project Task` in the existing `Alpha Home` project and `Planning` category.
3. Edit its title and due time, then complete it. Undo completion and complete it again.
4. Archive and restore the task. Confirm every state change appears once in the web app.
5. Open Lists, Directory, Reports, Files, Journal, Crisis Plan, and Settings. Confirm no Google Tasks
   setup or sharing control appears anywhere in the app.
6. Confirm existing projects and categories can be selected.
7. Confirm there is no native control to create, rename, archive, or delete a project or category.
8. Create a project in the web app, refresh native data, and confirm it becomes selectable.
9. Create a task while offline, force-quit, relaunch while offline, and confirm the pending task is
   still present. Reconnect and confirm it syncs exactly once.
10. Edit the same synthetic task differently on web and native while one client is offline. Reconnect
    and confirm an explicit conflict or deterministic winner appears without silent data loss.

Pass condition: supported web features work natively, administrative project/category operations
remain web-only, and offline work survives relaunch and converges exactly once.

## 4. Siri AI spoken-command corpus

Use `packages/test-fixtures/fixtures/apple/siri-en-US-v1.json`. You may first run the intent UI,
parameter resolution, project matching, error, and duplicate-replay cases in the simulator. That is
useful preflight coverage, but it does not replace the release corpus because the simulator cannot
prove real “Hey Siri” recognition, on-device Siri AI routing, locked-device behavior, or physical
microphone behavior. Run all 80 complete and 20 ambiguous requests assigned to each platform on real
Siri AI-capable hardware before release.

For every corpus row:

1. Read the exact utterance naturally after “Hey Siri.” Do not type it.
2. Record only the corpus ID, device, recognition pass/fail, parse pass/fail, clarification result,
   commit result, duration, and a bounded error code. Never record recognized task/project text.
3. For an omitted-project request, confirm the task is created with no project.
4. For a specified-project request, confirm Siri uses the existing authorized project.
5. For a `Shared Plan` request, confirm Siri asks which project and creates nothing before selection.
6. Repeat the same invocation through the provided duplicate-replay procedure. Confirm only one
   durable task and one sync mutation exist.
7. Repeat representative `Na’aseh` and `GSD` requests while the app is locked, offline, signed out,
   and on an unsupported/expired build. Confirm Siri opens a safe continuation or gives a safe error;
   it must never create an unauthorized task.
8. Verify the created task and due date/time in the web app.

Pass condition: at least 228 of 240 complete requests succeed on the first attempt, all 60 ambiguous
requests clarify before mutation, and duplicate durable effects equal zero. Enter totals in
`docs/testing/siri-ai-task-results.md`.

## 5. Native notifications and timer behavior

### Notifications

Run on all three platforms:

1. Deny notification permission. Schedule a synthetic task alert and confirm the app explains that
   alerts are disabled without repeatedly prompting.
2. Enable notifications in System Settings and relaunch. Confirm the app reflects the new state.
3. Schedule an alert two minutes ahead. Put the app in the foreground, background, and terminated
   states in separate runs.
4. Lock the device before delivery. Confirm the default preview is generic and reveals no task text.
5. If private previews are explicitly enabled, confirm content appears only in the allowed state.
6. Tap the alert. Confirm it routes to the intended authorized task.
7. Delete or revoke access to the task on the web, then tap an old alert. Confirm a safe unavailable
   screen appears with no stale content.
8. Deliver/replay the same occurrence twice. Confirm one visible alert/action effect.
9. Sign out and confirm the installation/token is unregistered or otherwise cannot route protected
   content for the old account.

### Timer and Live Activity

Run on iPhone and iPad, and run the timer window/status-item variants on Mac:

1. Start a work timer. Confirm the timer window and Live Activity/status item agree.
2. Pause, resume, switch work/rest, and reset from every available surface.
3. Repeat one action rapidly. Confirm the state changes once and all surfaces converge.
4. Force-quit and relaunch. Confirm the canonical timer state is restored.
5. Start a timer, lock the device, and confirm protected task text is absent.
6. Change the time zone and set the clock forward/back through supported system controls. Confirm
   elapsed/remaining time stays logically correct.
7. Repeat across device sleep/wake and a full reboot.
8. Take one device offline, perform an action, then reconnect. Confirm an explicit conflict or
   deterministic convergence without duplicate transitions.

Pass condition: alerts and timer actions route safely, remain exactly-once, recover across lifecycle
changes, and do not leak protected text. Record the matrix in
`docs/testing/native-alert-timer-matrix.md`.

## 6. Physical layout and implemented accessibility alternatives

Run every primary journey on representative iPhone, iPad, and Mac hardware:

1. Set text to the largest Accessibility size. Repeat portrait and landscape on iPhone/iPad.
2. Open the software keyboard in every editor. Confirm the focused field and primary action remain
   visible; dismiss and reopen the keyboard.
3. Enable Reduce Motion and Increase Contrast. Confirm meaning is not carried only by animation or
   color and that text remains readable.
4. On iPad, test full screen, one-third and half-width windows, Stage Manager, hardware keyboard,
   pointer, and an external display if available. Verify every Pencil/drag gesture has a button,
   keyboard, or accessibility alternative.
5. On Mac, resize from the minimum window size to full screen, open/close the inspector, use Cmd-N,
   Cmd-Option-I, keyboard-only navigation, and the Import File alternative.
6. For each rotation, resize, inspector, sheet, and keyboard transition, record start and stable-layout
   timestamps with a 60 fps screen recording or Instruments signpost. Compute elapsed milliseconds.
7. Inspect screenshots/frame-by-frame for clipped text, overlaps, off-screen actions, unsafe-area
   violations, and controls smaller than 44 points on touch devices.

Pass condition: all primary journeys have keyboard/alternative controls, no actionable content is
obscured, and every measured reflow is 250 ms or less. Record measurements in
`docs/testing/native-platform-experience-results.md` using geometry-only screenshots. A voluntary
VoiceOver pass may be recorded separately but is not required.

## 7. Journal, Crisis Plan, and files privacy

1. Unlock Journal, edit the synthetic entry, background the app, and return. Confirm it relocks and
   plaintext does not appear in app-switcher snapshots, notifications, logs, or search.
2. Interrupt a Journal save by terminating the app. Relaunch and confirm either the old valid entry
   or the complete new entry appears—never a partial plaintext state.
3. Open the synthetic Crisis Plan, trigger it from Journal, revoke recipient access on the web, and
   confirm cached recipient content is removed.
4. Import an allowed small PDF/image, cancel one import, try an unsupported type, and try a file over
   the documented limit. Confirm cancellation and validation leave no partial attachment.
5. Confirm preview is unavailable until the scan state is clean, then preview and export.

Pass condition: protected data is encrypted/hidden through lifecycle changes, authorization
revocation removes access, and file workflows fail closed.

## 8. TestFlight clean install, upgrade, migration, and recovery

Run only after both builds are processed and assigned to the internal `Naaseh Smoke` group:

1. Install the previous internal build and create one pending offline task plus the synthetic fixtures.
2. Install the candidate over it. Do not delete the app.
3. Launch and confirm migration finishes, the task remains, and pending work syncs exactly once.
4. During a separate run, terminate the app during migration. Relaunch and confirm safe resume or
   rollback with no partial data.
5. Fill the device until storage is low, repeat the upgrade, and confirm an explicit safe failure with
   the last valid store preserved. Restore storage and retry.
6. Exercise the missing/wrong-key recovery procedure with the smoke account. Confirm protected data
   is never opened with the wrong key.
7. In App Store Connect, stop testing an older disposable build. Confirm it cannot continue unsafe
   mutations and directs the tester to a current build.
8. Submit TestFlight feedback and inspect its contents. Confirm it contains only the closed,
   privacy-safe diagnostic fields.

Pass condition: clean install and upgrade work on all three platforms, interrupted/low-storage/key
failures preserve the last valid state, pending mutations are not duplicated, and the release stays
internal-only. Record evidence in `docs/testing/apple-testflight-smoke-results.md`.

## 9. Final evidence and decision

1. Link the source revision, build numbers, completed result files, and privacy-safe screenshots.
2. Record every failure with platform, build, corpus/test ID, expected result, actual result, and a
   bounded error code. Do not copy protected content into the issue.
3. Confirm the production smoke-account procedure caused no new AWS resource or paid-service setup.
4. Mark the release **PASS** only when every applicable pass condition above is satisfied.
5. If any gate fails, keep the TestFlight group internal, stop promotion, and follow the rollback
   runbook before retesting.
