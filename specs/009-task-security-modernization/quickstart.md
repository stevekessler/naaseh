# Quickstart Validation Guide

This guide is for implementation validation. It references [data-model.md](data-model.md), [API delta](contracts/api.openapi.yaml), [sync v5](contracts/sync-protocol.md), [UI contracts](contracts/ui-contracts.md), and the [completed-task CSV contract](contracts/completed-task-csv.md) rather than duplicating implementation details.

## Prerequisites

- Node.js 24 and the repository's locked npm dependencies
- Current stable Chrome and Safari/WebKit-compatible Playwright browsers
- AWS credentials only for the existing pre-AWS/deployment validation stages that require them
- Two ordinary test users, one administrator without TFA, one administrator with TFA, and a separately authorized recovery-operator test identity
- Two browser contexts/devices for timer and offline conflict scenarios
- Adversarial memo/CSV fixtures, negative `extra_low` rejection fixtures, hidden memos, legacy due zones, and off-five-minute due instants

Install and establish the normal baseline:

```bash
npm ci
npm run validate
```

Use focused package/test filters while implementing, then run the repository validation gates appropriate to the changed layer. Do not use production credentials or production factor seeds in tests.

## Required-validation runtime budget

Before adding any test to `.github/workflows/validate.yml`, `test:e2e:quick`, or another required validation command:

1. Record the current test count for the affected command.
2. Measure the browser quick suite baseline exactly with:

   ```bash
   /usr/bin/time -p npm run test:e2e:quick
   ```

3. After the change, record the new test count and run the same timed command under comparable local conditions.
4. Confirm the hosted PR validation's total duration and keep it at or below ten minutes, with workflow timeout headroom.
5. Keep only representative, high-value Chromium/WebKit journeys in `test:e2e:quick`; put exhaustive browser/device/edge combinations in `npm run test:e2e` and `npm run validate:pre-aws:browsers`.

Do not expand required validation past ten minutes without explicit user approval and a documented reason.

## 1. Authentication and recovery

Validate with unit/contract/API tests and representative Chromium/WebKit sign-in journeys:

1. Ordinary user without TFA receives the unchanged application session after valid primary credentials.
2. Enabled user receives only a five-minute pre-auth transaction after primary credentials; no protected route accepts it.
3. Current TOTP and one unused recovery code each establish a normal session; reuse, stale window, wrong purpose, fifth failed attempt, epoch change, and concurrent reuse fail generically.
4. Administrator without a factor can reach only enrollment; administrator with a factor cannot reach any authenticated ordinary/admin page until challenge succeeds. Pre-rollout cookies do not bypass enforcement.
5. Enrollment shows QR/manual bootstrap transiently, verifies before activation, returns ten recovery codes once, and stores only KMS ciphertext/digests. Rotation/disablement requires step-up; admin disable is forbidden.
6. Password reset requires canonical username, valid PIN, and matching valid password entries. Unknown account/wrong PIN/rate-limit responses do not disclose existence. Success retains TFA/data and invalidates every old session/login transaction.
7. Recovery operator is the only lost-admin-factor path. A successful idempotent invocation records application audit plus attributable CloudTrail evidence, removes factor material, revokes sessions, and forces re-enrollment. The function cannot decrypt factor ciphertext.
8. Security requests/responses are `no-store`, absent from IndexedDB/outbox/service-worker cache, URLs, logs, and telemetry.

Run KMS/IAM/CDK assertions and a restore drill proving that restored administrator factors enter `recovery_required` before access reopens.

## 2. Task dialog, memo, references, due values, and color

Exercise each primary task representation online and offline:

1. Edit opens a labeled modal, keeps context, contains focus, restores focus, blocks double submit, saves all changed fields atomically, and leaves data untouched on confirmed cancel. Dirty Escape/backdrop/navigation asks before loss.
2. Parent combobox filters 1,000 cached authorized choices within 200 ms, caps rendered options, supports keyboard/touch/clear, distinguishes duplicate labels, and rejects arbitrary/self/descendant/inaccessible choices on both client and server.
3. Every group selector uses the same authorized dropdown contract, including optional empty choice.
4. Memo marks/lists round-trip through save, reload, offline sync, conflict, backup/restore, display, copy, search projection, and export. Rich paste strips scripts/unsupported nodes. Legacy plain text upgrades only after edit. Hidden memo v1 decrypts, v2 writes, and plaintext never leaks into indexes/logs/export.
5. Undated tasks render an empty date area everywhere. Date-only values remain the same calendar date across browser-zone changes. Timed values remain the same instant and re-render locally. Five-minute choices are complete; an existing off-grid value is preserved on unrelated save. DST nonexistent time is rejected.
6. Each labeled color swatch saves in the same task mutation, uses accessible non-color state, and resolves explicit override → category → yellow. Cancel/failure/conflict retains durable appearance.

Measure cached dialog readiness under 1 second and editor feedback under 100 ms on the representative mobile profile.

## 3. Timer and sync v5

Use two browser contexts and controlled clocks/network:

1. A new task timer proposes 10 minutes and accepts only whole minutes 1..1,440.
2. Start/pause/resume/stop/restart/repeat and confirmed duration change follow the state table. A finished interval does not mean the task is complete and never creates a task `CompletionEvent` or mutates task completion state.
3. Navigate, reload, background, suspend past one/many intervals, operate offline, and correct the clock. State derives within two seconds of canonical time, never resets, never loops through unbounded feedback, and surfaces clock anomalies.
4. Repeat completion feedback occurs once per active device and interval. Audio/notification denial changes no canonical state.
5. Starting a second task requires explicit switch. Two simultaneous device starts produce one canonical aggregate; the loser receives a visible conflict.
6. Offline conflicting pause/resume/duration/repeat commands remain encrypted/durable and offer explicit reapply/discard after refresh; no last-write-wins loss occurs.
7. Mutation replay returns the stable receipt. Passive ticking/repeat produces zero AWS requests. Owner feeds sync the current timer but no collaborator/admin/task/report/Google feed exposes it.
8. Revoking task access quarantines dependent commands and purges identifying cached timer data before cursor advance.

Run restore validation for timer state invariants, revisions, receipts, and feed consistency.

## 4. Ranking and priority migration

1. Pointer and touch drag in overall/project stacks produce the same owner-private move as existing keyboard controls. Test filtered occupied-slot permutation, outside/self/remote-change invalid drops, scroll, zoom, reduced motion, and pending/failure/conflict announcements.
2. Other users' personal ranks never change; current explicit move controls remain fully operable.
3. Compact priority marks remain distinct by glyph/shape with accessible names at dense/iPhone sizes.
4. Run the read-only server, browser-fixture, pending-mutation, snapshot, and restore inventory and require every `extra_low` count to be zero before deletion; verify a nonzero fixture blocks deployment without mutation.
5. Delete `extra_low` from active and historical schemas, filters, imports, exports, cached-schema branches, and fixtures, then assert zero occurrences and unchanged rank/unrelated data.

Migration failures must emit safe checkpoint/count/error telemetry and remain resumable; rollback must not require destructive browser-database deletion.

## 5. Profile, administration, directory, and lists

1. Ordinary users find reminders, sound, Google setup, password, and TFA under `/profile`; no system/global controls appear there.
2. `/admin` remains server-authorized and contains the user/system destinations. Direct non-admin API/route invocation is denied.
3. User results page by stable username/ID with maximum 100 rows, opaque cursor, table semantics, labeled row actions, responsive scroll, and bounded initial presentation under two seconds for a 10,000-row fixture.
4. `/directory` owns global reusable-item CRUD under existing permissions; an individual list contains no global administration but retains linked selection/reset.
5. Initial list-item add accepts empty, negative/cost, and positive amounts using existing money rules and creates name+amount in one offline-capable mutation. Invalid decimal/amount creates no partial item and retains valid name.

## 6. Completed-task report and CSV

1. No report time-zone control appears. Obsolete saved zone values are ignored/removed without altering other filters. Browser-zone/DST boundary fixtures produce consistent display/export scope.
2. Self exports include exactly authorized records. All-user export requires administrator privilege, explicit confirmation, and audit; losing authorization prevents result access.
3. A 10,000-row job is snapshot-consistent at `asOf`, idempotent, resumable, and exposes no download until header/row count/checksum validation succeeds.
4. Parse the result and assert the exact 56-column v1 header/order, equal row widths, hierarchy fields, every safe task/subtask business field, deterministic repeated JSON, empty optionals, and stable UTC/date/number formats.
5. Adversarial commas, quotes, CR/LF, RTL text, formulas (including leading whitespace/control characters), multiple attachments, hidden memos, and private object data produce valid safe output with no secret/ciphertext/signed-link exposure.
6. Interrupt/fail generation and verify no partial result appears successful; safe CloudWatch state provides an actionable failure class without rows or protected content.

## 7. Cross-cutting quality gates

Run the repository's established commands as applicable:

```bash
npm run validate
npm run test:e2e:quick
npm run test:e2e
npm run validate:pre-aws:browsers
npm run test:performance
npm run test:observability
npm run cdk:synth
```

If a script name differs in the current `package.json`, use the current equivalent and update this guide rather than inventing a new required gate.

Before completion:

- Run `git diff --check` and re-review the final diff for correctness, unnecessary complexity, authorization, protected-data leakage, data durability, error paths, browser support, tests, comments, and documentation.
- Verify CloudWatch dashboards/alarms and retention for new safe events; confirm no high-cardinality/sensitive dimensions.
- Synthesize infrastructure and review IAM/KMS encryption-context conditions, recovery-operator separation, WAF scope, CloudTrail data events, export bucket access/lifecycle, PITR/Backup, and migration permissions.
- Confirm no device-bound-session path/dependency/header/credential was introduced.
- Document user-visible profile/admin/directory/export behavior and operator recovery/migration/restore runbooks before declaring implementation complete.
