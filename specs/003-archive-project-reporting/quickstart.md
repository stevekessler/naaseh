# Quickstart: Validate Archive, Projects, and Completion Reporting

This guide validates the completed feature against [spec.md](./spec.md),
[data-model.md](./data-model.md), and the [contracts](./contracts/). It does not provide
implementation code.

## Prerequisites

- Node.js 24.x and repository dependencies installed.
- A disposable local/test environment with DynamoDB/S3 doubles or isolated AWS resources.
- Current stable Chrome and Safari/WebKit coverage through the repository Playwright setup.
- Test actors: owner A, owner B, active group member, revoked/non-member, administrator, and an
  explicitly authorized reporting actor.
- Test fixtures with personal, public, group, locked/private, assigned, unassigned, active,
  archived, completed, and attached work.

Never run hard-delete scenarios against irreplaceable production data.

## 1. Static and Contract Gates

Run:

```bash
npm run check:runtime
npm run typecheck
npm run lint
npm run format:check
npm test -- tests/contract
npm run cdk:synth
```

Expected:

- OpenAPI schemas and runtime validators agree.
- Sync v3 accepts documented semantic operations and rejects hard delete.
- CDK synthesis contains only managed/on-demand additions, deletion workflow permissions are
  least-privilege, and no public data path is introduced.
- Logs/metrics use allowlisted safe fields.

## 2. Hierarchy and Migration

Seed two legacy Categories with assigned Tasks, one completed Task, one manually archived Task,
and existing Lists. Run the migration twice.

Verify:

1. Each legacy Category keeps its ID, name, color, and default assignee.
2. Exactly one `General` Project exists under each Category after both runs.
3. Legacy task assignments point to the correct General Project; Lists remain Unassigned.
4. The completed Task is completion-archived with one counted synthesized event.
5. The manually archived Task has no synthesized completion credit.
6. Mapping checkpoints and reconciliation counts report complete with no duplicate events.
7. A restored backup repeats the same mapping without duplicate Projects or events.

Then create:

```text
PAAO
├── API
└── Network
Another Category
└── API
```

Verify sibling duplicate `PAAO → API` is rejected, `Another Category → API` succeeds, a third
level is rejected, and assignment uses only a grouped Project picker or Unassigned.

## 3. Archive and Restore

For personal, group, and locked/private Tasks:

1. Complete an active Task while online.
2. Confirm one mutation results in completed + archived state, one counted CompletionEvent, a
   revision, correct count decrement, and authorized feed changes.
3. Confirm the Task disappears from active views and appears in the authorized global archive.
4. Verify unauthorized actors cannot infer it through direct access, search, count, report,
   cache, or export.
5. Restore it and confirm it becomes active/open, its current event is reversed, and historical
   event attribution remains visible where authorized.
6. Re-complete it and confirm one new counted event at the new time with no double counting.

For a 1,000-item List with mixed completion states and attachments:

1. Finish the List.
2. Verify only the parent lifecycle changes while every child is shown in the List archive.
3. Confirm no List Item appears in the global to-do archive or personal completion totals.
4. Restore the List and verify order, item state, directory links/overrides, permissions, and
   attachments remain intact.

## 4. Offline Lifecycle and Conflict Handling

Open a synchronized fixture, go offline, and:

1. complete/restore a Task;
2. archive/restore a List;
3. assign/unassign active work;
4. inspect the tree, archive, counts, and dashboard;
5. restart the browser before reconnecting.

Expected:

- entity and semantic outbox mutation persist atomically;
- pending state and last-synchronized time are visible;
- reconnect yields one server mutation/event despite retry;
- same-version non-conflicting changes converge;
- stale lifecycle or archived-Project assignment conflicts are actionable and preserve work;
- hard-delete preview/confirm remains disabled and no delete outbox entry exists.

Revoke group membership while offline and reconnect. Before advancing the cursor, verify the
browser removes inaccessible work, events, search documents, counts, cached report data,
in-memory attachment URLs, and unauthorized pending changes.

## 5. Counts, End Dates, and Drill-down

Create Projects with date states none, upcoming, today, and overdue. Distribute active,
archived, locked, group, public, and Unassigned Tasks/Lists across them.

Verify for each actor:

1. Project badges show separate active to-do and List counts.
2. Category counts equal the sum of visible child Project counts.
3. Archived/deleting/deleted work and List Items are excluded.
4. Each badge drill-down returns exactly the records counted at the response `asOf` time.
5. Inaccessible Projects/work do not appear as nodes or affect zero/nonzero totals.
6. Unassigned counts and drill-down match.
7. End-date labels do not shift across time zones and archived Projects are not active
   deadlines.
8. Projection reconciliation reports no drift; an injected test discrepancy is detected,
   repaired idempotently, and alarmed without protected data.

## 6. Completion Dashboard and Reporting

Create completion/reopen/re-complete events around:

- local midnight;
- Sunday/Monday week boundaries;
- month/year boundaries;
- daylight-saving gaps and overlaps;
- Project move/reassignment and Category/Project archive.

For at least two IANA time zones, validate day, week, and month reports for:

- all work;
- Unassigned;
- one Category roll-up;
- one Project;
- archived Category/Project filters;
- current user and explicitly authorized other-user reporting.

Expected:

- ordered buckets sum to total;
- reversed events are excluded and re-completion is counted once;
- historical attribution remains at completion-time Category/Project;
- current-location differences are identified;
- List Item completion and List finish never contribute;
- inaccessible activity does not affect responses or timing-visible node existence;
- offline calculation matches the server for the same synchronized event set.

## 7. Category and Project Lifecycle

1. Archive a populated Project and confirm it remains editable/reportable but cannot receive
   assignments.
2. Archive its Category and confirm every child is effectively unavailable without rewriting
   child lifecycle values.
3. Restore a child while the parent remains archived and confirm it is still not assignable.
4. Restore the parent and verify only children with own lifecycle active become assignable.
5. Move an empty Project between Categories and verify scoped name reservation changes
   atomically; collision at the destination changes nothing.
6. Confirm existing/archived work retains permissions and historical reporting.

## 8. Permanent Deletion

For a Task and a List:

1. Request preview and verify the target label, current version, all dependency classes/counts,
   reporting impact, expiry, and irreversible warning.
2. Cancel and verify no state changed.
3. Change a dependency after preview; stale confirmation must fail without deletion.
4. Request a fresh preview and confirm while online.
5. Verify UI shows pending job rather than final success.
6. Interrupt/retry each job checkpoint; exact idempotency replay must not duplicate work.
7. After completion, verify current/child/revision/event/projection/search/cache/feed and
   attachment records are removed, authorized clients receive tombstones, and no restore UI
   exists.
8. Verify only content-free receipt, audit, and DeletionLedger facts remain.

For Categories/Projects:

1. Preview populated targets and verify blockers plus `409 delete_blocked` on confirm.
2. Reassign/unassign or delete every reference.
3. Confirm empty deletion removes the entity and scoped name reservation atomically.

Verify an offline attempt, invalid/expired token, wrong actor, wrong resource, missing/stale
`If-Match`, idempotency key reuse with different input, and unauthorized actor all delete
nothing and return safe errors.

## 9. Backup and Restore Gate

1. Hard-delete fixtures and record their content-free ledger entries.
2. Restore a recovery point created before deletion into the isolated test environment.
3. Apply the DeletionLedger before enabling application access.
4. Verify every deleted target/dependent and attachment version is re-purged.
5. Run authorization, referential integrity, event/projection reconciliation, and search tests.
6. Deliberately prevent ledger application and confirm restore validation blocks exposure and
   raises an alarm.

Document that locked recovery points expire under the existing 35-day policy and are never a
user-accessible recycle bin.

## 10. Browser, Accessibility, and Performance

Run the feature Playwright suites through the existing projects:

```bash
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=webkit
npm run test:performance
```

Cover desktop, iPhone, and iPad sizes. Verify keyboard and touch tree navigation, focus-safe
confirmation dialogs, screen-reader labels, date/count meaning without color alone, no
horizontal overflow, offline/pending/error states, Archive search scope, and Dashboard filters.

At 50,000 authorized work records and 1,000 nodes, 95% of tree, count, archive search,
drill-down, and report period/filter interactions must show a result or pending acknowledgement
within one second. Multi-record deletion must show progress after two seconds.

## 11. Final Release Gate

Run:

```bash
npm run validate
npm run test:e2e
npm run test:performance
npm run validate:pre-aws
```

Before release, complete a final diff review for authorization, aggregate leakage, lifecycle
atomicity, replay, migration idempotency, attachment purge, deletion-ledger recovery,
CloudWatch redaction, responsive browser behavior, test quality, documentation, AWS cost, and
unnecessary complexity. Any failed gate blocks completion.
