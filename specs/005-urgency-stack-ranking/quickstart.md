# Quickstart: Validate Urgency Levels and Personal Stack Ranking

## Purpose

Use this guide after implementation to validate the feature end to end. It proves the behaviors in
[spec.md](spec.md) against the entities in [data-model.md](data-model.md) and the HTTP/sync contract in
[contracts/urgency-stack-ranking.openapi.yaml](contracts/urgency-stack-ranking.openapi.yaml).

## Prerequisites

- Node.js 24.x and npm
- Repository dependencies installed
- Local Na'aseh environment configured using `.env.example`
- At least two provisioned test users for rank-isolation and authorization scenarios
- Current stable Chrome and Safari/WebKit coverage available through the existing Playwright projects
- A Docker-compatible container runtime for the canonical `urgency-stack-ranking-v1` performance
  profile; host-only timing is diagnostic and cannot satisfy the release gate
- AWS credentials only for synthesis/deployment validation that explicitly requires them; unit,
  contract, browser-local, and CDK assertion tests must not require a deployed production environment

## Baseline validation

From the repository root:

```bash
npm run check:runtime
npm run typecheck
npm run lint
npm test
npm run build
```

Expected outcome: domain, API, browser, contract, infrastructure, and regression suites pass with no
schema, type, lint, or build errors.

## Focused automated validation

Run the feature's focused suites once implemented:

```bash
npx vitest run \
  packages/domain/src/__tests__/urgency.test.ts \
  packages/domain/src/__tests__/personal-stack.test.ts \
  packages/domain/src/__tests__/completion-urgency.test.ts \
  tests/contract/personal-stack.contract.test.ts \
  tests/contract/urgency-filters.contract.test.ts \
  tests/contract/urgency-work.contract.test.ts \
  tests/integration/personal-stack-service.test.ts \
  tests/integration/urgency-reporting.test.ts \
  tests/security/personal-stack-isolation.test.ts \
  tests/restore/personal-stack-restore.test.ts \
  tests/performance/urgency-stack-ranking.test.ts
```

```bash
npx playwright test \
  tests/e2e/urgency.spec.ts \
  tests/e2e/personal-stack.spec.ts \
  tests/e2e/urgency-filtering.spec.ts \
  tests/e2e/urgency-reporting.spec.ts
npm run cdk:synth
```

Expected outcome:

- All five urgency values validate, Medium is the default, and no numeric urgency score exists.
- Task/List urgency changes and personal reorder operations remain independent.
- Overall, Project, and different users' stack versions/orders remain independent.
- Exact filtered permutation changes only matching items' occupied slots.
- Same-user stale conflicts are visible; other users' rank changes never conflict or leak.
- Completion reports use urgency captured at completion; current reports use current urgency.
- Restore reconstructs operation order/snapshots and preserves urgency totals.
- CDK adds only bounded serverless ranking/compaction and least-privilege permissions.

## Scenario 1: Urgency creation and editing

1. Sign in as User A and create one Task/Subtask and one List at each urgency level.
2. Create one additional Task and List without selecting urgency.
3. Confirm the omitted values display **Medium**.
4. Change one Extra Low Task to Critical.
5. Inspect its revision history.

Expected:

- Each work item shows the full accessible label.
- The revision records the shared urgency change.
- Neither personal overall nor Project order changes for User A or User B.
- List Items do not expose an independent urgency selector.

## Scenario 2: Personal overall and Project order

1. Create a Project and at least six active work items visible to Users A and B.
2. Assign five items to the Project and leave one unassigned.
3. As User A, rank one Project item first in the Project and fifth overall.
4. Put an Extra Low item above a Critical item.
5. Sign in as User B and choose a different order for the same visible items.
6. Reload both users on a second supported device/browser.

Expected:

- User A sees the item at Project #1 and Overall #5.
- User B sees only User B's chosen positions.
- Neither user can inspect the other's ranks through stack APIs, reports, exports, sync, logs, rank
  gaps, or administrator-targeted completion reporting.
- Rank changes do not change urgency or shared work revisions.

## Scenario 3: Filtered occupied-slot permutation

Create an overall order like this:

```text
1 High A        (matches High/Critical)
2 Low hidden    (does not match)
3 Critical B    (matches)
4 Medium hidden (does not match)
5 High C        (matches)
```

1. Filter to High and Critical.
2. Move C to the first visible position.
3. Clear the filter.

Expected full order:

```text
1 High C
2 Low hidden
3 High A
4 Medium hidden
5 Critical B
```

The matching identities rotate across slots 1, 3, and 5; hidden items remain in slots 2 and 4.
Repeat with search, content type, assignee, date, Category, and Project criteria and verify the same
pure permutation rule.

## Scenario 3A: Server-side filtered pagination

1. Seed an overall stack and one Project stack with matches distributed before and after the bounded
   candidate-evaluation limit; include owner, public, group, revoked, archived, Task, and List records.
2. Request small pages with single- and multi-urgency filters and follow `nextCursor` until it is null,
   including any short or empty intermediate page.
3. Repeat for archive, workload drill-down, and completion drill-down with their existing search,
   assignment, Category, Project, date, and report filters.
4. Attempt to reuse a cursor as another user, on another endpoint/scope/order, with changed filters,
   after expiry, and after stack/access/source context invalidation.
5. Revoke access, restore/archive work, and reorder the personal stack between page requests.

Expected:

- With unchanged source context, the collected pages contain every authorized match exactly once in
  stable stack/report order; a short or empty page with a non-null cursor is not treated as exhaustion.
- Stack rank values reflect positions in the full authorized stack and are not renumbered by urgency or
  content-type filters.
- Current authorization and lifecycle are rechecked before return, so revoked or ineligible work is
  never disclosed even through cursor state or rank gaps.
- Invalid, cross-user, cross-route, mismatched, stale-context, and expired cursors return actionable
  restart errors without exposing cursor internals.
- Candidate reads stop at the documented evaluation, source-page, or deadline bound; stack reads use
  ordered snapshot/operation candidates, while archive/drill-down reads use audience-scoped pointers
  rather than table scans.
- Raw filters, cursor payloads, work identifiers, ranks, urgency tied to records, and report totals do
  not appear in logs.

## Scenario 4: Offline durability and same-user conflict

1. Load the same personal Project stack on two clients for User A.
2. Disconnect both clients.
3. Reorder overlapping visible ranges on each client and change urgency on one shared Task.
4. Reload each browser while still offline.
5. Reconnect client 1, allow it to synchronize, then reconnect client 2.

Expected:

- Both offline changes survive reload with visible pending state.
- The urgency edit synchronizes independently of rank.
- The first accepted reorder advances only User A's Project stack version.
- The overlapping stale reorder produces an actionable encrypted conflict; it is not silently lost or
  allowed to overwrite the accepted order.
- Retrying or replaying the accepted mutation creates exactly one logical operation.

## Scenario 5: Authorization and lifecycle changes

1. Rank a visible public/group Task in two users' stacks.
2. Make it private, revoke group visibility, archive/complete it, restore it, move it to another
   Project, and finally permanently delete an equivalent test item.

Expected:

- Authorization loss removes the item immediately from the affected user's derived stack and local
  encrypted cache without exposing a gap or stale content.
- Archive/completion removes it from active stacks without disturbing remaining relative order.
- Restore/new authorization adds it at the personal tail with a new membership epoch.
- Project reassignment preserves overall order, removes the former Project position, and enters the
  destination Project tail.
- Permanent deletion cannot resurrect through stale operations or restored snapshot chunks.

## Scenario 6: Reporting and export

1. Complete Tasks at all five urgency levels across daily, weekly, and monthly periods.
2. Change a completed Task's urgency only after restoring it; then complete it again at the new level.
3. Exercise personal completion, Category, Project, unassigned, archive, workload, and drill-down
   reports with single- and multi-urgency filters.
4. Request an export as User A while User B has different ranks.

Expected:

- Every aggregate returns five zero-aware urgency buckets whose sum equals the authorized total.
- The first completion remains attributed to its original `urgencyAtCompletion`; the second uses the
  new urgency.
- Current workload uses current urgency.
- Detail rows expose User A's current personal ranks only; archived rank cells are blank.
- CSV includes stable textual `urgency`, `overallRank`, and `projectRank` columns and never contains
  User B's positions.

## Scenario 7: Accessibility and supported browsers

Run the primary journeys in the existing Chromium, WebKit, iPhone, and iPad Playwright projects.

Expected:

- Five urgency labels remain understandable without color.
- Keyboard/touch users can Move up, Move down, and Move to position without drag.
- Pointer drag, if implemented, is only an enhancement and exposes identical results.
- An `aria-live` region announces item, new position, stack scope, and visible set size.
- Focus remains predictable, reduced-motion preferences are honored, touch targets meet the existing
  minimum, and no supported viewport requires horizontal page scrolling.

## Scenario 8: Scale, cost, observability, and recovery

1. Run the canonical performance gate once, without other repository suites in parallel:

   ```bash
   npm run test:performance:urgency-stack-ranking
   ```

2. Verify the runner reports profile `urgency-stack-ranking-v1`, the pinned container digest,
   Node.js 24.18.0, Playwright Chromium 1.61.1, Linux/two logical CPUs/4 GiB, one worker, UTC clock
   `2026-08-05T12:00:00.000Z`, seed `urgency-stack-ranking-v1`, animations disabled,
   390×844/device-scale-2/touch viewport, 4× CPU slowdown, and
   either the documented degraded-network or cache-local mode for each journey.
3. Verify the fixture before timing: 50,000 authorized active work records (30,000 Tasks, 10,000
   Subtasks, 10,000 Lists), 10,000 at each urgency, a proportional 10,000-item Project subset, and an
   authorization mix of 30,000 owner-only, 10,000 group, and 10,000 public records. Confirm 40,000
   counted Task/Subtask Completion Events (8,000 per urgency) cover the documented UTC day, week, and
   month; every 100th seeded work record supplies the exact 1% sparse case. The report must record the
   fixture checksum and confirm an empty outbox, overall version 120/snapshot-through 100, and Project
   version 40/snapshot-through 30 before each measured journey.
4. Inspect five discarded warm-ups and 40 retained samples for each 20%/1% urgency filter, overall and
   Project first/last move, 10,000-item filtered permutation, 100-row stack refresh, and
   workload/completion report filter journey. Confirm nearest-rank p95 is the 38th sorted sample.
5. Preserve the first result as
   `artifacts/performance/urgency-stack-ranking-v1/canonical.json`. Confirm the runner refuses to
   overwrite it and writes explicitly requested diagnostic reruns as timestamped sibling files. If
   the canonical run fails, keep it; do not substitute a passing rerun.
6. Run observability/security tests and inspect synthesized CloudWatch configuration. Exercise exact
   count boundaries 0, 1, 2, 10, 11, 100, 101, 1,000, 1,001, 10,000, 10,001, 50,000, and 50,001.
   Confirm ranking, reporting, sync, reconciliation, pagination, and compaction use the same bucket
   classifier and semantic `*CountBucket`/`*DepthBucket` fields.
7. Run restore validation against canonical operations, operation chunks, snapshot chunks, Tasks,
   Lists, and Task/Subtask Completion Events.

Expected:

- Every measured journey has p95 at or below one second and at least 38 of 40 samples show a stable
  result or durable pending acknowledgement within one second. The artifact also contains p50,
  maximum, threshold pass count, profile/fixture version, fixture checksum, dependency/browser
  versions, container digest, and host CPU architecture.
- Stack items/operations remain below DynamoDB size and transaction limits; APIs paginate with opaque
  cursors, bounded candidate evaluation, and no table scans for archive or drill-down details.
- Large filtered moves are durably accepted and replayable before derived compaction finishes.
- Restore verifies contiguous versions, chunk hashes/counts, scope ownership, snapshot pointers,
  replay equivalence, relative order, and urgency report totals.
- Exact canonical affected counts remain available only inside authorized domain records. Logs,
  metric dimensions, dashboards, alarms, traces, and test diagnostics use `affectedCountBucket` with
  `zero`, `one`, `two_to_ten`, `eleven_to_hundred`, `hundred_one_to_thousand`,
  `thousand_one_to_ten_thousand`, `ten_thousand_one_to_fifty_thousand`, or
  `over_fifty_thousand`; unavailable counts are omitted. No exact-count alias appears.
- Logs otherwise include only low-cardinality safe context and exclude work content, filter values,
  urgency tied to records, personal position/order data, report totals, and bulk work IDs.
- Alarms cover sustained reorder/report/sync/compaction failures and any consistency failure.

## Full release gate

```bash
npm run validate
npm run test:e2e
npm run test:performance
npm run test:performance:urgency-stack-ranking
npm run test:observability
npm run validate:workflows
```

Before completion, record the required final-diff review, Chrome/WebKit mobile evidence, accessibility
results, performance results, AWS cost review, backup/restore evidence, and any non-obvious ordering,
authorization, or recovery invariants that require durable code comments or operator documentation.

## Verification record — 2026-08-05

- Runtime: Node.js 24.18.0 and npm 11.16.0.
- Baseline `npm run validate`: final post-hardening run passed (typecheck, lint, 203 test files/609
  tests, and all workspace builds).
- Feature performance: 10 tests passed on the host diagnostic profile. Every measured journey passed
  40/40 samples below one second; the slowest observed p95 was approximately 104 ms for a 50,000-item
  overall move.
- Browser/device coverage: 16 focused keyboard, touch, focus, live-region, accessibility, and overflow
  journeys passed across Desktop Chrome, Desktop WebKit, iPhone, and iPad. The full feature Playwright
  matrix was also attempted; API-backed scenarios could not authenticate because this workspace had no
  local API/test-user environment. The preview application itself started successfully.
- Infrastructure and recovery: CDK synthesis passed. The feature infrastructure/restore assertions
  passed, including on-demand capacity, KMS, TTL, streams/PITR, IAM boundaries, alarms, canonical
  operations, corrupt chunks, rebuildable snapshots, completion urgency, and urgency-total
  reconciliation.
- Observability: `npm run test:observability` passed (24 tests). Workflow pin validation passed for all
  three workflow files.
- Manual scenarios 1–6 require the prerequisite running API and two provisioned test users and were not
  repeated interactively in this workspace. Their domain, contract, integration, security, offline,
  restore, and browser-local equivalents are automated in the focused suites above.
- Canonical container performance evidence was not generated because the configured Colima Docker
  daemon was unavailable. The host run is diagnostic and does not replace the pinned-container release
  artifact required before production release.
