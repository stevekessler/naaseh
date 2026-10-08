# Sorting rules

This is the current user-visible sorting inventory. It is intentionally explicit so the rules can be
simplified without accidentally changing a different screen.

## Tasks and Post-its

The automatic order is shared by the task list and Post-it view:

1. Tasks due today or earlier come before tasks due later or without a date. Within this group, the
   earliest due date comes first.
2. After due and overdue work, tasks in the Personal Stack follow their overall stack rank.
3. Unstacked work comes after stack-ranked work. Unstacked work with a due date is ordered by due
   date first; undated ties are ordered newest-created first. Stable ID breaks exact ties.

The task table can override that order by Due date, Category, Project, or Priority. The first click is
ascending and the second is descending. Empty values are always last. Ties retain the automatic
order above. Category uses the task's Category, or its Project's Category when the task has no direct
Category. Priority order is Low, Medium, High, Critical when ascending and the reverse when
descending.

A manual task-table sort is stored in this browser and survives navigation and browser restart.
**Reset sort** removes it and returns to the automatic order. The manual table sort does not reorder
the Personal Stack and does not change the Post-it order.

## Personal Stack and workload details

- The overall stack follows the user's explicit overall rank.
- A Project stack follows that Project's independent explicit rank.
- Filters hide nonmatching rows but do not renumber ranks.
- Project workload details default to overall rank. Project rank is available only when exactly one
  Project is selected. Stable ID breaks equal ranks.

## Reports and archive

- Completed-task detail defaults to the report/source order (normally completion time). It can be
  changed to overall rank or Project rank; missing ranks are last.
- Archive entries are newest archived first.
- Journal entries are newest calendar date first.

## Lists and selection controls

- List items follow their explicit manual `orderKey`; stable ID breaks ties.
- The Lists index is newest-updated first.
- Projects inside a Category picker are alphabetical by Project name.
- Eligible parent tasks are alphabetical by task label.
- Assignee choices are alphabetical by display name after aliases and duplicates are consolidated.

Category and Project records outside those named controls do not currently have one universal
display-order rule; each consuming view is responsible for its presentation order. That inconsistency
is a good candidate for the next sorting cleanup.
