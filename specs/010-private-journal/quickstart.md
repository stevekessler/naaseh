# Quickstart Validation Guide: Private Journal and Wellness Dashboard

Use this guide after implementation to validate [the data model](data-model.md), [ciphertext API](contracts/journal.openapi.yaml), [sync protocol](contracts/sync-protocol.md), [crypto recovery](contracts/crypto-recovery.md), and [UI contracts](contracts/ui-contracts.md) without duplicating their schemas.

## Prerequisites

- Node.js 24 and locked npm dependencies
- Current Playwright Chromium and WebKit browsers, including configured iPhone/iPad projects
- Two ordinary users, one ordinary administrator, and one designated recovery administrator with TFA
- Two isolated browser contexts/devices for owner separation, offline, and conflict scenarios
- Local fixtures containing entries across comparison periods, every optional value boundary, all DBT options, formatted/link text, eligible/ineligible tasks, large ciphertext, conflict/replay cases, and adversarial log-shaped strings
- AWS credentials only for synthesis/pre-AWS/restore checks that already require them; never use production journal keys, PINs, content, or recovery approvals in tests

Install dependencies and establish the normal baseline:

```bash
npm ci
npm run check:runtime
npm run validate
```

## Required-validation runtime budget

The unchanged-tree baseline measured during planning was:

- `test:e2e:quick`: **23 tests in 13 files**
- Playwright result: **23 passed in 21.4 seconds**
- `/usr/bin/time`: **real 21.78 seconds**

Implementation baseline measured on 2026-08-29 before required-suite changes:

- `npx playwright test --config playwright.quick.config.ts --list`: **23 tests in 13 files**
- `/usr/bin/time -p npm run test:e2e:quick`: **23 passed in 21.5 seconds; real 21.88 seconds**
- The sandboxed attempt could not bind `127.0.0.1:4173`; the approved local-server rerun above is the valid baseline.

The plan adds exactly one representative journal Chromium journey to the required quick suite; exhaustive privacy/recovery/browser/device cases stay in full/local gates.

Before changing `playwright.quick.config.ts`, `.github/workflows/validate.yml`, or another required command:

```bash
npx playwright test --config playwright.quick.config.ts --list
/usr/bin/time -p npm run test:e2e:quick
```

Record test/file counts and timing before and after under comparable conditions. Confirm the hosted PR check's total duration remains at or below ten minutes; the 15-minute workflow timeout is headroom, not a target. Do not add further quick journeys without runtime evidence and explicit review.

## Focused automated validation

Use the implemented test paths (update this guide if naming differs rather than inventing empty commands):

```bash
npx vitest run \
  packages/domain/test/journal.test.ts \
  packages/domain/test/journal-crypto.test.ts \
  apps/web/test/db/journal-repository.test.ts \
  apps/web/test/features/journal.test.tsx \
  apps/api/test/journal/journal-service.test.ts \
  apps/api/test/crypto-recovery/journal-recovery.test.ts \
  tests/contract/journal.contract.test.ts \
  tests/integration/journal-sync.test.ts \
  tests/security/journal.security.test.ts \
  tests/restore/journal-restore.test.ts \
  tests/performance/journal.test.ts
```

```bash
npx playwright test tests/e2e/journal.spec.ts --project=chromium
npx playwright test tests/e2e/journal.spec.ts --project=webkit
npx playwright test tests/e2e/journal.spec.ts --project=iphone
npx playwright test tests/e2e/journal.spec.ts --project=ipad
```

Expected: focused domain/API/web/contract/security/restore/performance suites and primary browser/device journeys pass with no plaintext journal artifacts.

## Scenario 1: Enrollment, unlock, and ordinary privacy

1. User A opens Journal for the first time, creates a journal PIN, and verifies that both configurable sections are enabled.
2. Create an entry, lock by hiding the tab and by waiting for timeout, then unlock online and offline with the PIN.
3. Sign in as User B and an ordinary administrator in separate contexts; try list, guessed ID, sync feed, key-envelope, backup fixture, dashboard, and direct API access.
4. Inspect IndexedDB, DynamoDB fixture serialization, request/response captures, service-worker caches, logs, traces, errors, and exported/notification/report paths.

Expected:

- Only User A renders plaintext after unlock.
- Other-user/admin attempts return concealed denial without confirming an entry/date.
- Durable stores contain ciphertext and opaque tokens only; PIN/JMK/plaintext/date/answers/notes/task association/dashboard values do not appear.
- Tab hide, timeout, logout, and session revocation remove decrypted DOM/cache state and in-memory keys.

## Scenario 2: Add, edit, controls, and rich text

1. Save a date-only entry with every optional value unanswered.
2. For every numeric field, enter min/max and invalid below/above/off-step values through range, keyboard, paste, touch, and decimal input as applicable.
3. Exercise all yes/no/unanswered values and every DBT enum/selection list.
4. Format both notes fields with bold, italic, underline, strikethrough, bullets, ordered lists, and valid HTTPS links; paste scripts, raw HTML, embedded media, and invalid protocols.
5. Reload, edit, go offline, reconnect, and restore the entry.

Expected:

- Paired controls never diverge and domain validation rejects invalid values before durable change.
- Optional remains distinct from zero/no; formatting round-trips structurally with unsafe content absent.
- One owner/date remains unique; saving an existing date routes to/conflicts with the existing entry.
- An oversized body preserves an encrypted local draft and clearly remains unsynced; nothing is truncated.

## Scenario 3: Preferences and sensitive-response behavior

1. Disable/re-enable each section independently across reload, offline operation, and another user.
2. Confirm historical ciphertext remains and becomes visible again only to the owner after re-enable.
3. Save minimum/maximum suicidal-thought and self-harm responses plus yes/no behaviors.

Expected:

- Defaults are enabled and preferences are owner-private.
- Disabled sections disappear from add/read/edit and applicable dashboard cards without deleting history.
- No response triggers risk interpretation, crisis resources, notification, sharing, alert, or emergency workflow.

## Scenario 4: Task reflection

1. Verify the selector contains the owner's open tasks and tasks completed in the prior seven local dates only.
2. Select a task offline, add formatted reflection, save, sync, and reopen.
3. Clear a referenced task with notes and cancel/confirm the warning.
4. Remove the task from the owner's current authorization/cache and reopen the journal entry.

Expected:

- Foreign, older closed, and inaccessible task choices are absent.
- Task ID/reflection remain encrypted and confer no task access.
- Clearing does not lose notes without confirmation; unavailable tasks show no historical title/content.

## Scenario 5: List, dashboard, trends, and modal

1. Seed current and immediately preceding equal-length periods with answered, unanswered, zero/no, and sparse values.
2. Filter the newest-first list with start only, end only, inclusive range, invalid reversed range, and no matches.
3. Compare 7-, 31-, 365-day and arbitrary periods; independently calculate averages, yes-day counts, journal days, no-data states, trends, and contributor IDs.
4. Activate every card by keyboard/touch, follow contributor links, close by Escape/button, and verify focus restoration.

Expected:

- No content search exists and no plaintext date/server query is used.
- Every aggregate/trend/contributor set matches [data-model.md](data-model.md); missing differs from zero/no.
- Color/arrows are supplementary, direction is non-clinical, and sensitive cards follow the preference.
- Dialog semantics, accessible names, focus, touch targets, no-data/error/loading/offline states, and iPhone/iPad layout satisfy [UI contracts](contracts/ui-contracts.md).

## Scenario 6: Offline durability, replay, and conflicts

1. Save while offline, reload/restart, inspect pending state, reconnect, interrupt requests, and replay the mutation ID.
2. Edit one entry on two devices from the same base version; also create/change two entries to the same date token.
3. Exercise keep-local, keep-remote, and manual resolution, then interrupt each resolution and retry.
4. Simulate near-quota storage, unsupported future schema/key version, cursor expiry, authentication expiry, and purge after user switch.

Expected:

- Local acknowledgement and server-synced state remain distinct; acknowledged/pending data is never silently lost or duplicated.
- Duplicate replay returns a stable receipt; partial server/local transactions leave no orphan pointer/body/feed/cursor.
- Both encrypted conflict variants persist until deliberate owner resolution.
- Unsupported versions preserve ciphertext and block overwrite; owner switch/session revocation prevents cross-user local disclosure.

## Scenario 7: Administrator-assisted recovery

Use [the recovery state machine](contracts/crypto-recovery.md) and verify:

1. Owner initiates after recent password verification and produces a one-use browser key.
2. Ordinary admin, stale admin session, missing/wrong/replayed TFA, wrong request/owner/session/key version, expired request, malformed key, arbitrary wrap, and repeated approval/consumption all fail generically.
3. Designated recovery administrator freshly authenticates and approves the exact live request.
4. Owner browser alone receives/decrypts the rewrapped JMK, sets a replacement PIN, and old sessions/wrap behavior change as contracted.
5. Inspect admin UI/responses, Lambda logs/errors, CloudWatch, CloudTrail, audit chain, DynamoDB, restored backup, and KMS/IAM policy.

Expected:

- Administrator sees only request status/success and never plaintext, JMK, result ciphertext, public key, PIN, wrap, or journal metadata.
- Only the isolated reserved-concurrency-one recovery Lambda can call recovery-key decrypt.
- Raw key buffers are cleared; request is five-minute/single-use/session-bound; no recovery path reads/edits/exports entries.
- Audit append/hash/signature and independent KMS events validate; alteration/reuse/failure alarms fire without protected fields.

## Scenario 8: Performance, backup, and cost

1. Measure unlock and local control response on representative iPhone/iPad Safari hardware, especially Argon2 memory/latency.
2. Test warmed and initial bootstrap/list/dashboard at 14, 365, 3,650, and 10,000 compact projections with lazy bodies.
3. Verify 95th-percentile 2-second ordinary, 5-second degraded/pending, 100-millisecond control, and 2-second online-save targets.
4. Restore PITR/backup fixtures and validate ciphertext, wraps, pointers, receipts, feeds, versions, conflicts, and signed recovery audit without opening plaintext in operator tooling.
5. Synthesize infrastructure and confirm no new always-on component, table, search service, per-user KMS key, or server aggregate.

Expected: targets pass, restore invariants hold, and observed incremental cost drivers remain limited to request/storage/backup/log metrics and rare recovery KMS operations.

## Full quality gates

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:observability
npm run test:performance
npm run cdk:synth
npm run test:e2e
npm run validate:pre-aws:browsers
npm run validate:workflows
```

Then re-list and remeasure the required quick suite:

```bash
npx playwright test --config playwright.quick.config.ts --list
/usr/bin/time -p npm run test:e2e:quick
```

Before completion:

- Confirm hosted PR validation stays at or below ten minutes and record before/after counts and duration.
- Run `git diff --check` and re-review the final diff for cryptographic invariants, authorization, plaintext leakage, retries/conflicts, recovery abuse, migration/restore, browser/accessibility behavior, dependency safety, comments, and documentation.
- Verify CDK/IAM proves ordinary API/admin/report/export/notification/sync roles lack recovery decrypt and journal plaintext paths.
- Verify telemetry with adversarial fixtures and confirm CloudWatch retention, metrics, alarms, cost/high-cardinality limits, audit hashes/signatures, and CloudTrail KMS evidence.
- Update the journal threat model plus user unlock/recovery and operator recovery/restore runbooks. Do not claim regulated compliance without the separate review required by [research.md](research.md).

## Required validation measurements

- Before Feature 010: 23 tests in 13 files; `npm run test:e2e:quick` passed in 21.5 seconds (real 21.88, user 20.30, sys 4.52) on 2026-08-29.
- After adding exactly one representative Journal Chromium journey: 24 tests in 14 files; `npm run test:e2e:quick` passed in 22.2 seconds (real 22.55, user 22.05, sys 4.65) on 2026-08-29.
- Increment: one test/file and approximately 0.67 seconds wall-clock. This remains far below the ten-minute required-validation ceiling and adds no always-on AWS capacity.

## Final implementation validation (2026-08-29)

- `npm run validate`: passed, including runtime validation, typecheck, lint, **803 tests in 276 files**, API/web/infra builds, and the production PWA bundle.
- `npm run test:observability`: passed **26 tests in 5 files**.
- `npm run test:performance`: passed **29 tests in 17 files**; Journal processed the documented projection fixtures locally without adding always-on AWS capacity.
- `npm run cdk:synth`: passed for the production infrastructure; Journal uses the existing request-driven/on-demand data plane and bounded recovery operations.
- `npm run validate:workflows`: passed for all three workflow files; `.github/workflows/validate.yml` retains its 15-minute safety timeout.
- Journal browser coverage: the representative required journey passed in the 24-test quick suite; the exhaustive Chromium, WebKit, iPhone, and iPad Journal set passed **12/12 in 21.0 seconds** outside that suite.
- `git diff --check`: passed.
- Recent successful hosted validation baselines completed in **3:59–4:19** (latest run: 4:08). The measured Feature 010 quick-suite delta is only **0.67 seconds**, leaving substantial headroom below the required ten-minute ceiling. A definitive hosted duration for these uncommitted changes will be available when the branch is pushed.
- Final review covered owner authorization, ciphertext-only persistence/contracts, unique opaque date identity, key lifetime and zeroization, recovery role/TFA/expiry/replay controls, conflict retention, no-delete/no-search boundaries, protected telemetry, restore invariants, responsive browser behavior, dependency pinning, and incremental AWS cost controls.
- Automated acceptance coverage now exercises enrollment/unlock/edit/offline behavior, chronological filtering, preferences, task reflection, local dashboard calculations, cross-user denial, recovery state transitions, restore validation, performance, and supported browser/device layouts. Hardware-specific Safari timing and a live AWS recovery ceremony remain deployment-environment checks described above rather than local release blockers.
