# Urgency and Personal Stack Ranking

Urgency and stack rank answer different questions:

- **Urgency** describes time sensitivity or consequence. Choose Extra Low, Low, Medium, High, or
  Critical. New work defaults to Medium.
- **Stack rank** is your chosen execution order. Every user has a private overall stack and a separate
  private stack for each Project. An Extra Low item can be above a Critical item, and an item can be
  first in its Project while fifth overall.

Changing urgency never moves an item. Reordering never changes urgency, due dates, assignments, or
what collaborators see. Other users cannot see or change your ranks.

## Set and filter urgency

Choose urgency while creating or editing a to-do, subtask, or List. Use the five urgency checkboxes in
active work, Archive, stacks, and reports to show one or more levels. Urgency combines with search,
date, assignee, Category, Project, lifecycle, and content-type filters.

A filtered stack keeps the full stack's positions. If you reorder visible matches, only those matches
exchange their occupied slots; hidden and nonmatching items stay put. A page may contain fewer rows
than requested, or even no rows, while **Load more** remains available. Continue until that control
disappears.

## Reorder your stacks

Use the accessible move controls on Personal Stack to move an item to the top, up, down, or bottom.
The status announcement confirms the result for keyboard and screen-reader users. Choose Overall or a
single Project to edit that independent order. Moving Project rank does not change overall rank.

Newly active or newly authorized work enters at the bottom. Completing, archiving, losing access to,
or deleting work removes it without changing the relative order of remaining items. Restored or newly
reauthorized work returns at the bottom.

## Offline and synchronization states

Previously synchronized urgency, stacks, and reports remain available offline. Local urgency edits and
reorders are encrypted on the device and show **Pending** until synchronized. Keep the application open
or reconnect later; pending changes survive a browser restart.

- **Synchronized** means the server accepted the change.
- **Pending** means it is safely queued on this device.
- **Failed** offers Retry.
- **Conflict** means the stack changed in a way that cannot be merged safely. Reload the current stack,
  review it, and submit the move again.

If a report continuation expires or its access/filter context changes, choose **Restart report**. If a
calculation fails, choose **Retry**. Cached reports identify their synchronization time and whether
pending local data is included.

## Reports and exports

Current workload, Category, Project, Unassigned, Archive, drill-down, and export reporting use each
item's current urgency. Completion dashboards use the urgency captured when a to-do or subtask was
completed, so later edits do not rewrite history. Lists appear in current/archive reporting but never
create completion events.

Every breakdown displays all five levels, including zeroes, and its sum matches the authorized total.
Detail reports may sort by your overall rank; Project-rank sorting is available only when exactly one
Project is selected. Filters do not renumber ranks. CSV exports include urgency and your applicable
overall/Project ranks; archived work has blank rank cells because stack positions apply only to active
work.

Urgency and shared work history follow the existing ownership and collaboration rules. Personal rank
operations and rank values are owner-private and never appear in another user's reports or shared
revision history.
