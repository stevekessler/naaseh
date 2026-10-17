# UI Contract Changes

## Tasks and Filters

- Default heading and counts describe “My tasks and groups,” not “All tasks.”
- Assignee and Group are multi-select conditions.
- A two-choice control reads “Match all conditions” and “Match any condition.”
- A plain-language summary shows expressions such as “Assignee is Steve OR Priority is Critical.”
- Selecting a cross-user condition displays “Searching all readable content” and automatically expands evaluation. Removing the last expanding condition restores default scope.
- Clear filters restores default scope, Match all, and no explicit conditions.

## Search

Search starts in “My content and groups.” A visible “All content” toggle expands to every readable record. Scope is announced with result counts and represented in the URL.

## Personal Stack

Stack copy says it contains tasks assigned to the viewer or associated with their groups. Filters only narrow eligible tasks. Lists and unrelated public tasks never appear.

## Groups

Joined or inspectable groups show members automatically. Each roster has a loading status, member list, or inline error with Retry. There is no Show members button.

## List Sharing

Privacy and group controls edit a draft. Save sharing is enabled only for a valid dirty draft; Cancel restores persisted state. Status text accurately reports Draft changes, Saving, Saved, Pending synchronization, Conflict, or Failed.
