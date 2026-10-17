# Data Model: Content Scope and Collaborative Filtering

## Task

Existing task fields remain, with these invariants:

- `ownerId`: immutable creator/owner identity.
- `assigneeId`: required existing user identity; creation defaults to `ownerId`.
- `groupId`: optional group association used for default discovery and Personal Stack eligibility.
- `visibility`: `private` or `public`; private is owner-only for ordinary users, public is readable by every active user regardless of `groupId`.
- Lifecycle and completion fields continue to gate active views and stack membership.

Validation rejects absent or empty `assigneeId`. Legacy records missing it are normalized once to `ownerId` and persisted with a new version/revision before strict reads are enabled.

## Presentation Scope

- `default`: a Task matches when `assigneeId == viewerId` OR `groupId` belongs to the viewer's active groups. A List matches when `ownerId == viewerId` OR the List is shared to one of those groups.
- `all`: every record already authorized for the viewer.
- `explicitExpanded`: derived state used when cross-user conditions deliberately evaluate over all authorized content; it is displayed but not separately persisted.

Presentation scope never grants authorization.

## Filter Expression

- `matchMode`: `all` or `any`.
- Multi-value condition families: `assigneeIds`, `groupIds`, `urgencies`, `datePresets`.
- Single/range condition families remain: text query, category, project, from/to, content type, lifecycle, and progress.
- Values within a family match as OR.
- Active families combine according to `matchMode`.
- Authorization, Personal Stack eligibility, and hard lifecycle exclusions are mandatory outer predicates.
- A record matching multiple conditions appears once.

## Personal Stack Eligibility

A Task is eligible for viewer V when it is active, open, not completed, readable, and either `assigneeId == V` or `groupId` belongs to V's active groups. Lists are ineligible. Filtering can remove eligible tasks from the displayed permutation but cannot admit ineligible records. Eligibility removal deletes the viewer's rank reference; the relative order of surviving references is unchanged.

## Group Membership Roster

The existing group and membership records remain canonical. Roster state in the browser is per group: `idle → loading → loaded`, or `loading → failed → loading` on retry. Only membership records authorized by the group-detail policy are stored. Revoked members are excluded from the active roster.

## List Sharing Draft

Ephemeral UI state includes the persisted baseline (`locked`, `groupId`, `version`), draft selection, and `clean`, `dirty`, `saving`, `pending_sync`, `conflict`, `failed`, or `saved` status. Cancel resets the baseline. Save emits one versioned mutation. Offline acceptance means pending synchronization, not remotely saved.

## List Audience Transition

An audience transition is identified by the list mutation ID and contains the list ID and expected version, prior and next ordinary audiences, parent feed changes, active non-removed child IDs and versions, resumable progress, and safe attempt/completion metadata. Each existing child is tombstoned from the prior audience and upserted to the next. Replays do not duplicate visible items.

## State and Migration Rules

1. Inventory missing task assignees and record a safe count.
2. Set each missing `assigneeId` to `ownerId`, increment version, create a revision, update projections/feeds, and preserve every other field.
3. Verify zero missing assignees in active records and backup-facing projections.
4. Enable strict schema and request/sync/restore validation.
5. Reconcile Personal Stacks by removing Lists and ineligible Tasks while preserving survivor order.
