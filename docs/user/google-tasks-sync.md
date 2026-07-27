# Google Tasks synchronization

Na'aseh can synchronize dated personal tasks with one Google Tasks list. Google Calendar displays
those tasks when the Google Tasks calendar is enabled. Synchronization is bidirectional: supported
edits made in either Na'aseh or Google Tasks converge on the other side.

## Connect and choose a list

Open **Google** in Na'aseh, choose **Connect Google**, and complete Google's full-page consent flow.
Na'aseh requests only Google Tasks read/write permission. Select an existing task list or create a
dedicated `Na'aseh` list, inspect the initial publish/import preview, and then start synchronization.

Only dated tasks owned by you are eligible. Shared/group tasks and assigned tasks are excluded.
Private tasks are excluded unless you explicitly approve sharing that individual task after the
privacy warning. Task titles, dates, and completion state are sent; memos, hidden memo content,
project/category metadata, and other Na'aseh-only fields are never sent.

## Field behavior

| Na'aseh                | Google Tasks     | Behavior                                                                        |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------- |
| Label                  | Title            | Changes synchronize both ways.                                                  |
| Due date               | Due date         | Changes synchronize both ways.                                                  |
| Due time and time zone | Not supported    | Kept only in Na'aseh. A Google date change preserves the local wall-clock time. |
| Completion/reopen      | Status           | Synchronizes through Na'aseh lifecycle and completion reporting.                |
| Google deletion        | Archive          | Archives locally; it never permanently deletes the Na'aseh task.                |
| Memo/hidden memo       | Not synchronized | Remains only in Na'aseh.                                                        |

New dated Google tasks are imported at the configured default local time and time zone. Undated
Google tasks remain in Google and are counted as skipped.

## Conflicts and offline use

Independent changes merge automatically. If the same title, due date, or status changes differently
on both sides, Na'aseh asks you to use its value, Google's value, or an edited value. Conflict values
and last-known status are encrypted in the browser and remain readable offline; resolution and new
provider work wait until the device reconnects.

## Pause, move, reconnect, or disconnect

Pausing stops scheduled provider work without removing access or content. When changing the selected
Google list, preview the move and choose whether old Google tasks remain or whether only tasks that
Na'aseh originally created should be removed. Google-origin tasks are never removed by that cleanup.

If Google permission is revoked, the status changes to **reauthRequired** and no provider work runs
until you reconnect. Disconnecting always preserves local tasks. You may retain all Google tasks or
remove only Na'aseh-origin Google tasks; the refresh token is revoked and destroyed afterward.

Safe status counters show pending items, conflicts, quarantined items, skipped undated tasks, and the
last attempt/success. A quarantined item can be retried individually without exposing task content in
logs or status messages.
