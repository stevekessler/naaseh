# Contract: Siri, Alerts, Timer, and System Surfaces

## Siri task creation

The single on-demand action is conceptually:

```text
CreateTask(label: String, project: Optional<ProjectChoice>, dueDate: Optional<LocalDate>,
           dueTime: Optional<LocalTime>, invocationId: StableInvocationID) -> TaskCreationResult
```

- `label` uses ordinary task validation and is never donated or logged.
- Omitted `project` means Unassigned and must not trigger a project prompt.
- A provided project phrase is resolved only against authorized, active, locally cached projects.
- Zero matches returns a safe not-found clarification without naming unauthorized projects.
- Multiple matches requires selection before commit.
- Date/time resolution uses the invocation locale, calendar, and time zone, then stores the same
  domain values as ordinary task creation.
- `invocationId` maps to a stable mutation ID. Repeated execution returns the prior safe outcome.
- Offline success requires the atomic record/outbox commit.
- Locked/signed-out/missing-store states return an authentication/foreground continuation and carry
  recognized values in encrypted process/app-group state, never URL parameters.
- Spoken confirmation is generic enough not to expose a private project or task on a locked device.

App Shortcut phrases include both normal Na'aseh invocation examples and the `GSD` alternate app
name configuration. No task, project, journal, plan, usage, or history entity is donated to
Spotlight or proactive suggestions.

## Task reminder delivery

1. Server EventBridge schedules remain canonical for synchronized reminders.
2. The existing notification Lambda queries current task/reminder state and each active
   installation when the event fires.
3. It sends an APNs payload with a stable occurrence ID and opaque deep-link command. The default
   title/body are generic.
4. A device with `nonPrivateTaskName` may receive a task name only after the server rechecks current
   actor authorization and confirms the task is not private. Hidden memo, journal, Crisis Plan,
   attachment, and unrelated content is never included.
5. APNs invalid/unregistered responses disable the token; retryable failures use bounded retry and
   emit safe metrics.
6. Pending offline-created reminders use local notifications. On sync acknowledgement the client
   cancels the local request or records the occurrence so the remote delivery is suppressed.
7. Completion, deletion, reminder change, or lost authorization cancels/supersedes future local and
   server schedules during reconciliation.

Notification actions contain no protected data. Opening or mutating from an action validates local
lock and current server authorization; stale actions show a generic unavailable result.

## Timer presentation

- Canonical state is the existing account-wide versioned timer record.
- Remaining time is derived from server-adjusted anchors; no client tick is persisted.
- iPhone/iPad use an ActivityKit Live Activity with generic interval state by default.
- Mac uses a desktop window/menu/status surface with equivalent accessible commands.
- Pause/resume/reset/switch actions are App Intents that run through the same versioned command and
  outbox path as the foreground UI.
- Repeated action delivery uses a stable mutation ID and cannot transition twice.
- Local interval alerts may fire while offline. On next activation the client recomputes canonical
  state and labels stale local feedback as such rather than inventing synchronized state.
- The timer never completes the associated task automatically.

## Deep links and scene routing

Universal links, OAuth callbacks, notification commands, Siri continuations, search results, and
file handoffs carry only an opaque route token or record ID. The router selects/opens the appropriate
scene, checks session/local lock and authorization, loads the current record, then displays it.
Failure never exposes the former title or content.

## Privacy matrix

| Surface | Default | Optional | Never allowed |
|---|---|---|---|
| Task alert | Generic reminder | Authorized non-private task name per device | Private names, memos, journal/plan data |
| Timer Live Activity/status | Generic interval/time | Authorized non-private task name under same preview policy | Private task name or memo |
| Siri response | Generic success plus safe values used in current request | Authorized project clarification while actively invoked | Unrelated records, journal/plan/memo content |
| Spotlight/Shortcuts | Action metadata and user-entered current parameters | None in v1 | Entity/content/history donations |
| App switcher/window restoration | Locked/redacted shell | None | Protected content snapshot |
| Crash/feedback diagnostics | Bounded technical metadata | User separately attaches a deliberately reviewed screenshot | Automatic protected screenshots/content |
