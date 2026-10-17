# Research: Content Scope and Collaborative Filtering

## Decision: Separate authorization, presentation scope, and filter expression

**Rationale**: These answer different questions: whether a record may be read, whether it appears by default, and whether it matches explicit user criteria. Keeping them separate prevents Match any from bypassing privacy or stack eligibility.

**Alternatives considered**: Reusing authorization as the default view exposed unrelated public work. Encoding default scope as another OR-able filter could bypass required boundaries.

## Decision: Make individual assignee required while retaining optional group

**Rationale**: The user rejected unassigned tasks. A required individual assignee preserves existing completion and notification semantics and makes creation defaults straightforward. Optional group remains a collaboration and default-discovery relationship; it can add the task to each active member's stack without replacing the accountable individual.

**Alternatives considered**: A union assignment target of either user or group would require broader schema and notification changes and would remove individual accountability from group tasks. Allowing both an unassigned and group-only state contradicts the decision.

## Decision: Migrate missing assignees to owner and fail closed thereafter

**Rationale**: Owner is the only deterministic existing user relationship and preserves access. The migration can be counted, replayed safely, validated, and restored. New writes and sync payloads reject a missing assignee.

**Alternatives considered**: Prompting users per task blocks deployment and offline restoration. Assigning to a system user creates a disguised unassigned state.

## Decision: Unlocked grouped tasks use the public task audience

**Rationale**: The approved product rule says every unlocked task is readable by every active user. Group remains in the record for default scope and stack eligibility. Lists intentionally retain current group-only sharing semantics.

**Alternatives considered**: Sending both public and group task copies adds redundant feed traffic and duplicate reconciliation. Group-only task feeds violate the approved rule.

## Decision: Explicit cross-user conditions expand evaluation automatically

**Rationale**: Selecting another assignee or cross-user group is deliberate intent and satisfies the rule that unrelated public work appears only after filtering. A visible scope indicator makes the expansion understandable. Removing those conditions restores default scope.

**Alternatives considered**: Requiring a separate All content toggle makes the example “Steve OR Critical” a two-control operation and creates confusing empty results.

## Decision: Multi-select values use OR; condition families use Match all/any

**Rationale**: “Steve or Heather” is naturally one Assignee condition. The top-level choice then combines Assignee, Group, Priority, and other families predictably without a free-form query language.

**Alternatives considered**: A nested visual query builder is unnecessarily complex. Applying Match any to mandatory lifecycle, authorization, or stack eligibility is unsafe.

## Decision: One shared evaluator defines local task scope/filter semantics

**Rationale**: Tasks, Search, and Personal Stack currently apply overlapping predicates independently. A shared pure evaluator supports truth-table testing and prevents route drift. Search additionally maps Lists and List Items into scope-aware rows.

**Alternatives considered**: Continuing per-page predicates is simpler locally but has already produced inconsistent defaults.

## Decision: List sharing uses an explicit draft and one durable save

**Rationale**: Immediate mutation offers no commit boundary and weak feedback. Draft state allows cancel/save and accurate Saving, Pending sync, Conflict, Failed, and Saved states. The accepted parent mutation drives the complete audience transition.

**Alternatives considered**: Keeping auto-save and adding a spinner does not provide a deliberate save action or distinguish local selection from persisted state.

## Decision: Transition existing list items with the parent audience

**Rationale**: Existing items are separate feed entities. Publishing only the parent leaves recipients with an incomplete list. Each active item must be upserted to the new audience and tombstoned from the prior audience. Large transitions must be idempotent and resumable.

**Alternatives considered**: Fetching children only when opening a list weakens offline behavior and adds a second authorization-dependent read path. Requiring an edit to each item is incorrect.

## Decision: Load authorized group rosters automatically and progressively

**Rationale**: Removing Show members should not block the whole page. Per-group loading/error/retry state supports slow networks. Existing group-detail authorization remains the boundary.

**Alternatives considered**: Returning all rosters in the group-list response increases disclosure and payload risk. Sequential loading is unnecessarily slow.

## Decision: Keep required browser coverage representative

**Rationale**: One high-value end-to-end journey should cover default scope, explicit expansion, Personal Stack exclusion, group roster display, and saved sharing. Exhaustive Boolean/browser/device combinations belong in unit, component, and full browser suites. Measure quick-suite count and timing before and after any required-test addition.

**Alternatives considered**: Adding the full truth table to required Playwright validation would threaten the ten-minute limit.
