# Implementation Plan: Urgency Levels and Personal Stack Ranking

**Branch**: `005-urgency-stack-ranking` | **Date**: 2026-08-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-urgency-stack-ranking/spec.md`

## Summary

Add a required five-value urgency field to Tasks, Subtasks, and Lists; capture urgency on counted
Task/Subtask completion events while excluding Lists from completion-event history; expose urgency
filters and zero-filled breakdowns across current workload, archive,
completion, Project, drill-down, and export reporting. Add private per-user ordering with one overall
stack and one independent stack per Project. Personal rank is not stored on shared work. Instead,
the API persists versioned semantic reorder operations in owner-only DynamoDB partitions and
periodically compacts them into chunked snapshots. This supports exact filtered-slot permutation,
offline retry/idempotency, and 50,000-item stacks without one oversized item or shared-rank leakage.

## Technical Context

**Language/Version**: TypeScript 5.8 on Node.js 24 Lambda and React 19 browser code

**Primary Dependencies**: Existing AWS SDK v3, Zod 3, React 19, Dexie 4, Vite PWA, AWS CDK, Vitest,
and Playwright; use native Pointer Events only as progressive enhancement and add no drag library
unless implementation testing proves the accessible button/position controls insufficient

**Storage**: Existing on-demand, customer-managed-KMS DynamoDB single table with Streams, PITR,
TTL, GSI1, and GSI2; owner-only stack operation partitions with compact binary operation chunks and
chunked snapshots; existing encrypted Dexie/IndexedDB cache extended with urgency, completion urgency
snapshots, stack state, operations, and conflicts. No legacy work-data backfill is required because
production has no work items at rollout, but browser schema migration must reconcile the existing
version constants and preserve settings, keys, cursor, and pending outbox data.

**Testing**: Existing Vitest unit/integration/contract/security/performance/restore suites, CDK
assertions, Playwright Chromium/WebKit desktop plus iPhone/iPad projects, axe accessibility checks,
and repository lint/typecheck/build/format gates. Pagination coverage includes sparse filters, short
and empty intermediate pages, 1 MB source boundaries, multi-audience merge/deduplication, cursor
tampering/cross-user reuse/expiry/context invalidation, concurrent lifecycle/authorization changes,
and exact no-duplicate traversal at the 50,000/10,000-item fixtures. Performance-profile validation
fails closed on environment or fixture drift; observability tests cover every count-bucket boundary
and reject exact affected-count aliases in serialized logs and metric dimensions.

**Target Platform**: Existing AWS Lambda, API Gateway HTTP API, DynamoDB, KMS, AWS Backup,
CloudWatch, CloudFront/S3 PWA deployment, and current installable browser application

**Supported Browsers**: Current stable Chrome and Safari/WebKit, including relevant iOS/iPadOS versions

**Project Type**: TypeScript monorepo web application with a serverless API, encrypted offline PWA,
shared domain/contracts packages, and CDK infrastructure-as-code

**Performance Goals**: From a warmed, previously synchronized local cache containing 50,000 overall
items and 10,000 items in one Project, 95% of urgency filter changes, first/last stack moves, and
report changes show a result or durable pending acknowledgement within one second. API stack reads
are cursor-paginated; ordinary moves persist as one compact operation, and large filtered moves are
accepted durably before derived snapshot compaction.

**Reproducible Performance Profile**: The release gate uses a feature-owned container pinned by image
digest with Node.js 24.18.0, dependencies from `npm ci`, and Playwright Chromium 1.61.1 from the lock
file. It runs on Linux with two logical CPUs, 4 GiB memory, one test worker, UTC, the fixed clock
`2026-08-05T12:00:00.000Z`, seed `urgency-stack-ranking-v1`, disabled animations, and no concurrent
suites. The browser profile is headless Chromium at
390×844 CSS pixels, device scale factor 2, touch enabled, and 4× CPU slowdown. Networked journeys use
150 ms latency, 200,000 bytes/second download, and 93,750 bytes/second upload (1.6 Mbit/s and
750 Kbit/s); cache-local/offline journeys use the same CPU profile without synthetic network access.
The deterministic `urgency-stack-ranking-v1` fixture contains 50,000 authorized active work records
(30,000 Tasks, 10,000 Subtasks, 10,000 Lists), exactly 10,000 records at each urgency, a 10,000-item
Project subset with the same proportions, and an authorization mix of 30,000 owner-only, 10,000
group, and 10,000 public records. It also contains 40,000 counted Task/Subtask Completion Events,
8,000 per urgency, covering the UTC day `2026-08-05`, week `2026-08-03` through `2026-08-09`, and
month `2026-08-01` through `2026-08-31`. Values are round-robin interleaved by seeded index; every
100th record carries the sparse selector, producing an exact 1% match case alongside the 20%
single-urgency case.

Each measured journey starts from the same verified synchronized snapshot with an empty outbox,
overall version 120 snapshotted through version 100, and Project version 40 snapshotted through
version 30. Run five unmeasured warm-ups followed by 40 sequential measured samples for:
20% and 1% urgency filters, overall and Project first/last moves, a 10,000-item filtered permutation,
a 100-row stack refresh, and workload/completion report filter changes. Timing begins at input
dispatch and ends at the first stable rendered result or durable encrypted-outbox acknowledgement.
Use nearest-rank p95 (`ceil(0.95 × 40)`, the 38th sorted sample); every journey must have p95 at or
below 1,000 ms and at least 38 of 40 samples at or below 1,000 ms. Emit p50, p95, maximum, threshold
pass count, fixture/profile version, dependency/browser versions, container digest, and host CPU
architecture in `artifacts/performance/urgency-stack-ranking-v1/canonical.json`. The runner refuses
to overwrite that first result; diagnostic reruns use timestamped sibling files and never replace
it. A failed canonical run fails the gate. WebKit/iPhone/iPad remain mandatory correctness gates but
are not mixed into this Chromium performance distribution because they lack the same reproducible
CPU/network controls.

**Constraints**: Urgency is categorical and never converted to a score. Overall and Project rank are
private per-user values. Exact filtered reorder permutes only visible matches across their occupied
slots. DynamoDB items are limited to 400 KB, transactions to 100 items/4 MB, and Query pages to 1 MB,
so no stack is stored in one item and no reorder synchronously rewrites all rank rows. Personal rank
must never be used as authorization evidence. Google Tasks neither receives nor overwrites urgency
or personal rank.

**Offline Strategy**: The browser stores encrypted work, rank snapshots/operations, and a single
scope-level reorder mutation atomically with the existing durable outbox. Urgency filters and stack
views run from local indexed data. Same-user mutations serialize by stack scope; a simple stale move
may rebase only when its anchors remain unambiguous, while filtered/overlapping stale moves become
actionable encrypted conflicts. Other users' stacks are separate conflict domains. Reconnection uses
contract version 4 owner-only stack changes and existing pending/synchronized/failed/conflicted UI.

**Security & Data Boundaries**: Urgency is shared task/list data editable only under existing content
permissions. A user may privately rank every active item they are authorized to view, even without
content-edit permission. Stack operations, snapshots, ranks, filters, report values, and conflicts
are readable only by their owning user; administrator report access does not expose another user's
ranks. Every stack read intersects stored ordering with current authorization and lifecycle state.
CSRF, session authorization, optimistic version checks, strict Zod validation, KMS encryption,
encrypted browser storage, revocation purge, backups, and protected-data log exclusions are reused.

**AWS Architecture & Cost Impact**: Reuse the existing encrypted on-demand table, API Gateway,
sync feed, KMS key, backup, and reporting Lambda. Add one pay-per-use Ranking Lambda for viewer-owned
stack reads/reorders and one asynchronously invoked compaction entry point with narrowly scoped table
permissions; no always-on capacity or new database is introduced. Principal costs are DynamoDB
operation/snapshot reads and writes, Lambda execution, sync traffic, backup storage, and CloudWatch
ingestion, plus audience pointer maintenance and short-lived multi-source cursor items. No new GSI is
required. Chunked snapshots, bounded scan-ahead, and compaction bound replay/read cost; implicit
deterministic tail membership and audience rather than viewer pointers avoid eager per-user fan-out
for public/group work. The cheaper alternatives are inline replay without compaction and self-contained
single-source cursors, retained wherever measured operation depth and cursor size permit them.

**Final Cost and Scale Review (2026-08-05)**: The serverless design remains the lowest-operational-
cost option for the initial ten-user scope. DynamoDB on-demand avoids idle capacity, and the existing
table, KMS key, backup plan, API, and reporting function avoid fixed monthly resources. A dedicated
database, provisioned-capacity table, ElastiCache rank index, ECS worker, or continuously running
compactor would add idle cost without improving the measured interactive path. The dominant variable
costs are filtered-permutation operation chunks, snapshot reads/writes, audience-pointer maintenance,
completion-detail pointers, Lambda duration, CloudWatch ingestion, and backup storage. Public/group
audience pointers deliberately avoid per-viewer write fan-out; current urgency deliberately remains
on canonical work rather than in every private stack snapshot.

Canonical operations and immutable receipts remain recovery records and therefore follow table and
backup retention. Snapshots are derived: keep the active generation and at least one verified prior
generation until a successful backup/restore validation, then permit older generations to expire.
Encrypted multi-source cursor state expires after 15 minutes. Compaction is asynchronous and bounded
to two concurrent executions; it is justified when operation replay depth or a large filtered move
would make repeated reads more expensive than rebuilding a snapshot. The release performance fixture
is the authority for tuning that threshold—do not add a fixed always-on schedule. Gzip remains the
preferred encoding because it keeps operation and snapshot chunks below 250 KiB with native Node.js
support and no Lambda layer; a custom binary codec was rejected as complexity without measured need.
The cheaper inline-replay path remains valid for shallow stacks, and inline encrypted cursors remain
preferred for single-source traversal. Revisit provisioned capacity, a cache, or scheduled compaction
only after CloudWatch shows sustained read amplification, throttling, or compaction backlog at real
traffic levels.

**CloudWatch Observability**: Extend existing one-month structured logs and dashboards with redacted
ranking/reporting events containing correlation ID, operation class, scope type, outcome, latency,
`affectedCountBucket`, retry/conflict status, bucketed backlog depth, and compaction state. Every
telemetry path uses the shared closed bucket enum `zero`, `one`, `two_to_ten`, `eleven_to_hundred`,
`hundred_one_to_thousand`, `thousand_one_to_ten_thousand`,
`ten_thousand_one_to_fifty_thousand`, and `over_fifty_thousand`. Exact canonical counts remain
available only inside authorized domain records and calculations; logs, metric dimensions, and
observability events MUST NOT emit exact affected counts. When no affected count was computed, omit
the field rather than inventing an `unknown` bucket. Other emitted item/operation cardinalities use
the same classifier under a semantically named `*CountBucket` or `*DepthBucket` field. Exclude work IDs in
bulk payloads, urgency values tied to records, position/order tokens, user/Project identifiers,
filters, report totals, titles, memos, and rank payloads. Low-cardinality metrics/alarms cover
`StackReorderLatency`, conflicts, failures, compaction backlog/failure, `UrgencyReportLatency`, rank
sync failures, urgency report consistency failures, bucketed filtered-read amplification/short pages,
cursor expiry/context restarts, and pointer reconciliation failures.

**Scale/Scope**: Initial production target remains 10 users, with acceptance fixtures of 50,000
authorized active Tasks/Subtasks/Lists in one user's overall stack and 10,000 in one Project stack.
Stack and report APIs paginate. A filtered permutation may reference up to the scoped fixture size
and is chunked under DynamoDB item/transaction limits. There is no work or completion history to
migrate at rollout.

**Server-Side Filtered Pagination**: A `limit` is the maximum number of authorized matching rows
returned, never the number of candidates examined. Overall and Project stack reads replay the current
snapshot plus later operations, merge the deterministic implicit tail, and walk that canonical order
in bounded chunks. Each chunk batch-loads at most 100 current work records, rechecks authorization,
lifecycle, membership epoch, and Project scope, then applies content-type and urgency predicates before
counting returned rows. Current urgency is never copied into private stack snapshots because doing so
would require cross-user fan-out whenever shared urgency changes. Archive and workload drill-down reads
query transaction-maintained audience/lifecycle/scope/urgency pointer partitions, merge the actor's
owner/public/group (or server-authorized administrator) streams by stable sort key, deduplicate Work
References, and reauthorize every hydrated record. Completion detail uses an atomically maintained
per-completing-user pointer ordered by completion time and event ID; aggregate completion and workload
reads use their existing categorical projections and do not page raw detail rows.

Every request stops after filling the requested page, reaching the source end, examining
`max(500, min(4000, 20 × limit))` candidates, consuming four 1 MB source pages, or reaching the
reserved request-deadline margin. A bounded scan may therefore return fewer than `limit`
items, including zero, with a non-null `nextCursor`; clients continue until the cursor is null. The
opaque cursor binds endpoint kind, authenticated actor/access epoch, scope, normalized-filter SHA-256
fingerprint, last evaluated source position(s), emitted visible ordinal, source-epoch vector, stack
version/snapshot generation and tail watermark when applicable, and a 15-minute expiry. Single-source
stack cursor state is encrypted and signed inline. Multi-source archive/drill-down merge vectors are
stored in an owner-scoped encrypted DynamoDB cursor item with TTL, and the client receives only its
signed opaque ID so the 4096-byte contract limit cannot be exceeded. Neither form contains raw filter
or content values or appears in logs. Scope, actor, endpoint, filter, signature, or state mismatch is a
400 invalid-cursor response; expiry is 410, and a changed stack/access/source context is 409 and requires
a fresh traversal. Each audience pointer partition has a META source epoch updated with pointer changes;
the cursor binds the relevant epoch vector so urgency, lifecycle, membership, or audience changes force
a fresh traversal. Authorization is still rechecked on hydration, so access loss is enforced even before
epoch invalidation reaches a client. Under an unchanged source context, pages contain every
authorized match exactly once in source order without gaps caused by the evaluation cap. Metrics record
only bucketed scan amplification, short-page frequency, page read units/bytes, latency, and cursor
errors; raw filters, identifiers, ranks, counts, and cursor payloads remain excluded.

## Constitution Check

*GATE: Passed before Phase 0 research and passed again after Phase 1 design.*

- **Security and data boundaries — PASS**: Shared urgency permissions and private per-user rank
  ownership are separate. Every stack read revalidates current content authorization; revocation,
  private/group boundaries, admin behavior, encrypted local storage, CSRF, and log exclusions are
  explicit. Rank is never authorization evidence.
- **Data durability and observability — PASS**: Urgency edits, completion snapshots, immutable stack
  operations, idempotency receipts, scope versions, chunk integrity, retry/rebase/conflict behavior,
  PITR/AWS Backup, restore validation, user-visible errors, redacted logs, metrics, and alarms are
  designed. Derived snapshots can be rebuilt from canonical operations.
- **Browser offline operation and resynchronization — PASS**: Urgency, filters, personal ordering,
  optimistic moves, pending operations, conflicts, restart durability, owner-only pull changes, and
  authorization purges extend the existing encrypted Dexie/outbox model.
- **Supported browsers — PASS**: Keyboard and explicit move controls are the portable baseline;
  Pointer Events are optional enhancement. Text labels, live announcements, reduced motion, 44px+
  targets, responsive layouts, and Chromium/WebKit desktop/iPhone/iPad coverage are planned.
- **Automated testing — PASS**: Domain, repository, contract, integration, security, restore,
  observability, performance, component, and Playwright tests cover independence, privacy, exact
  filtered permutation, lifecycle, reporting, offline retry, same-user conflicts, the pinned
  performance profile, bucket-boundary classification, and rejection of exact affected-count telemetry.
- **Performance and AWS architecture — PASS**: The one-second warmed-cache/pending target, pinned
  environment, deterministic fixture, throttling, warm-up/sample procedure, p95 calculation and
  evidence format, DynamoDB limits, cursor pagination, operation-log/chunk design, serverless
  functions, bounded filtered scan-ahead, audience-scoped pointer queries, cost drivers, compaction
  threshold, and lower-cost no-compactor alternative are documented.
- **Simplicity, review, comments, and documentation — PASS**: The design reuses the table, feeds,
  backup, reporting, outbox, and UI patterns; avoids a CRDT, rank fan-out, new database, always-on
  workers, and mandatory drag dependency. Final-diff review, invariant comments, and user/operator
  documentation remain implementation gates.

## Project Structure

### Documentation (this feature)

```text
specs/005-urgency-stack-ranking/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── urgency-stack-ranking.openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
packages/domain/src/
├── urgency.ts
├── personal-stack.ts
├── task.ts
├── list.ts
├── completion-event.ts
├── revision.ts
├── sync.ts
└── index.ts

packages/contracts/src/
├── urgency-stack-ranking-openapi.ts
├── openapi.ts
└── index.ts

packages/observability/src/
└── telemetry-count-bucket.ts

apps/api/src/ranking/
├── handler.ts
├── stack-service.ts
├── stack-repository.ts
├── stack-compactor.ts
├── filtered-stack-reader.ts
└── telemetry.ts

apps/api/src/
├── tasks/
├── lists/
├── lifecycle/
├── projects/
├── reporting/
├── exports/
├── sync/
└── shared/
    └── pagination-cursor.ts

apps/web/src/features/stacks/
├── PersonalStackPage.tsx
├── StackScopePicker.tsx
├── StackList.tsx
├── StackRow.tsx
├── StackMoveControls.tsx
└── filtered-permutation.ts

apps/web/src/
├── db/
├── sync/
├── search/
├── features/tasks/
├── features/lists/
├── features/archive/
├── features/projects/
└── features/reports/

infra/lib/
├── api-stack.ts
├── observability-stack.ts
├── backup-stack.ts
└── restore-workflow-stack.ts

tests/
├── contract/
├── integration/
├── security/
├── performance/
│   ├── Dockerfile
│   ├── profile.ts
│   ├── fixtures/urgency-stack-ranking.ts
│   └── urgency-stack-ranking.test.ts
└── restore/

tests/e2e/
infra/test/
docs/user/
docs/operations/
```

**Structure Decision**: Extend the existing domain and contract workspaces, encrypted browser cache,
serverless API, reporting/export paths, sync protocol, CDK stacks, and layered test suites. A focused
`ranking` API module and `stacks` browser feature keep private ordering separate from shared Task/List
mutation logic. Urgency remains on the shared work entities and completion snapshot where it belongs.

## Complexity Tracking

No constitution violation or approved exception is required. The separate ranking API and compaction
entry point are bounded serverless responsibilities: the API provides authenticated low-latency
reads/acceptance, while compaction rebuilds derived snapshot chunks outside the interactive latency
path. A single always-inline handler was rejected because large compaction work would jeopardize the
one-second acknowledgement target; no always-on worker or additional datastore is introduced.
