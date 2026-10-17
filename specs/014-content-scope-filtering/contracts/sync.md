# Synchronization Contract Changes

## Task Audiences

- Public Task: `PUBLIC`, regardless of optional `groupId`.
- Private Task: `OWNER#{ownerId}`.
- Administrator audit audience remains unchanged.
- A group change on an unlocked Task does not move its read audience, but does update default-scope and stack-eligibility projections.

## Required Assignee

All task upserts, mutations, restores, imports, and cache hydration require `assigneeId`. During the bounded migration window only, a missing value is normalized to `ownerId` and re-persisted. Afterward it is rejected.

## List Audience Transition

For old audience A and new audience B, publish a parent tombstone to A when they differ, a parent upsert to B, and corresponding tombstone/upsert changes for each active non-removed List Item. Clients apply revocations before grants and remove inaccessible cached children with the parent. The mutation ID is the idempotency key; oversized transitions are resumable and remain pending until every child change is durable.

## Personal Stack

Stack readers and membership lifecycle handlers evaluate viewer-specific assignment/group eligibility before returning or admitting a reference. Reconciliation removes ineligible references without changing survivor order or exposing hidden gaps.
