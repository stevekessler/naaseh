# Quickstart Validation Guide: Journal Crisis Plan

Use this guide after implementation to validate [the data model](data-model.md), [API contract](contracts/crisis-plan.openapi.yaml), [cryptographic sharing protocol](contracts/crypto-sharing.md), [sync protocol](contracts/sync-protocol.md), and [UI contracts](contracts/ui-contracts.md). Feature 010 must be implemented and its journal validation must pass first.

## Implementation prerequisite audit

Audit date: 2026-08-30

Status: **PASS — Feature 010 is implemented and validated.**

Feature 010 now provides the Journal Master Key and recovery paths, encrypted journal repository/outbox, sync-v5 journal mutations, Lexical editor, journal API/UI, restore validation, infrastructure controls, and its generated 81-task implementation record. Its full repository validation and exhaustive Journal browser/device journeys passed before Feature 011 resumed. Repository ignore/configuration files remain appropriate for the TypeScript, Docker, ESLint, and Prettier setup.

## Prerequisites

- Node.js 24 and locked npm dependencies
- Current Playwright Chromium and WebKit browsers with iPhone/iPad projects
- Feature-010 journal fixtures/JMK unlock/recovery paths
- Three active ordinary users (owner, retained recipient, revoked/removed recipient), one unrelated user, one ordinary administrator, and one designated recovery administrator
- Two owner devices/contexts plus isolated recipient contexts
- Synthetic signed sharing-key registry and KMS decrypt test double; AWS credentials only for CDK synthesis/approved pre-AWS checks
- Fixtures for valid/empty/unsafe/oversized rich text, stale versions/generations, malformed grants, duplicate mutations, rekey failure, restore, adversarial log-shaped input, and up to 90 recipients
- Never use production plan content, journal answers, JMK/CPK material, user credentials, or live share grants in tests

Install and establish the normal baseline:

```bash
npm ci
npm run check:runtime
npm run validate
```

## Required-validation runtime budget

Planning baseline measured on the unchanged tree on 2026-08-27:

- `test:e2e:quick`: **23 tests in 13 files**
- Playwright: **23 passed in 22.4 seconds**
- `/usr/bin/time`: **real 22.76 seconds**

Feature 010 plans one required Chromium `journal.spec.ts` journey. Extend that same journey with plan creation, entry gating, and triggered display; do not add another required test for sharing. If the Journal test is not yet present, expected post-change count is 24 tests in 14 files. If it is already present, expected count is unchanged.

Before and after changing `playwright.quick.config.ts`, `.github/workflows/validate.yml`, `test:e2e:quick`, or another required command:

```bash
npx playwright test --config playwright.quick.config.ts --list
/usr/bin/time -p npm run test:e2e:quick
```

Record actual test/file counts and timing under comparable conditions. After pushing, confirm the hosted PR check remains at or below ten minutes; the 15-minute timeout is headroom. Keep multi-user crypto/revocation and exhaustive browser/device cases in full/local gates.

## Focused automated validation

Use implemented paths and update this guide if final filenames differ:

```bash
npx vitest run \
  packages/domain/test/crisis-plan.test.ts \
  apps/web/test/crypto/crisis-plan-crypto.test.ts \
  apps/web/test/db/crisis-plan-database.test.ts \
  apps/web/test/db/crisis-plan-repository.test.ts \
  apps/web/test/features/crisis-plan-editor.test.tsx \
  apps/web/test/features/crisis-plan-page.test.tsx \
  apps/web/test/features/crisis-plan-share-manager.test.tsx \
  apps/web/test/features/crisis-plan-sharing-offline.test.tsx \
  apps/web/test/features/triggered-crisis-plan.test.tsx \
  apps/api/test/journal/crisis-plan-service.test.ts \
  apps/api/test/journal/crisis-plan-key-broker.test.ts \
  apps/api/test/journal/crisis-plan-telemetry.test.ts \
  tests/contract/crisis-plan.contract.test.ts \
  tests/integration/crisis-plan-sync.test.ts \
  tests/integration/crisis-plan-sharing.test.ts \
  tests/integration/crisis-plan-recipient-lifecycle.test.ts \
  tests/security/crisis-plan.security.test.ts \
  tests/security/crisis-plan-admin-recovery.security.test.ts \
  tests/restore/crisis-plan-restore.test.ts \
  tests/performance/crisis-plan.test.ts
```

```bash
npx playwright test tests/e2e/journal.spec.ts --project=chromium
npx playwright test tests/e2e/journal.spec.ts --project=webkit
npx playwright test tests/e2e/journal.spec.ts --project=iphone
npx playwright test tests/e2e/journal.spec.ts --project=ipad
npx playwright test tests/e2e/crisis-plan-sharing.spec.ts --project=chromium
npx playwright test tests/e2e/crisis-plan-connectivity.spec.ts --project=chromium
npx playwright test tests/e2e/crisis-plan-connectivity.spec.ts --project=webkit
```

Expected: domain/browser/API/contract/security/restore/performance suites and supported browser/device journeys pass with no plan plaintext or key material in durable/operational artifacts.

## Scenario 1: First-use prerequisite

1. Sign in as an owner with no plan or entries and open `Journal`.
2. Confirm `Crisis Plans` is reachable and `/journal/new` redirects/gates with a return path.
3. Try empty, formatting-only, raw HTML/script, embedded media, unsafe link, and oversized plan documents.
4. Save a valid formatted plan online; repeat from a fresh owner offline device after its journal foundation is authorized.
5. Create a new journal entry immediately after local offline plan save, reconnect, and interrupt/retry synchronization.
6. Forge/reorder a journal-entry create before plan persistence at the API boundary.

Expected:

- Empty/unsafe input cannot establish the prerequisite and never destroys a draft/last valid plan.
- Valid plan saves atomically; local plan mutation drains before entry create.
- Server condition check rejects forged/reordered create without partial entry/date/feed state.
- Owner sees distinct local-pending and server-synced status.

## Scenario 2: Legacy users and no deletion

1. Seed a feature-010 owner with existing entries but no crisis plan.
2. Read and edit an existing entry.
3. Attempt a new entry through navigation, direct route, and direct API mutation.
4. Create a plan, then inspect owner UI/API/domain for delete/tombstone operations.
5. Replace all plan content with another valid document and attempt an empty replacement.

Expected:

- Existing reads/edits work; all new creates require plan.
- No delete/tombstone path exists, including admin/recovery/direct identifiers.
- Valid replacement succeeds; invalid replacement leaves prior plan intact.

## Scenario 3: Owner rich text, offline, and conflicts

1. Exercise all supported formatting and valid HTTPS links; paste scripts, event handlers, raw HTML, unknown Lexical nodes, and unsafe protocols.
2. Save/reload online and offline; inspect IndexedDB, service-worker cache, outbox, network capture, server fixture, backup serialization, logs, errors, exports, analytics, and notifications.
3. Edit on two owner devices from one base version; interrupt conflict resolution.
4. Trigger storage quota, future schema/generation, decryption failure, auth expiry, tab hide, journal lock, logout, and account switch.

Expected:

- Formatting round-trips through normalized AST; unsafe nodes never execute/render.
- Durable artifacts contain ciphertext only; owner plaintext appears only after unlock.
- Both conflict variants persist encrypted until deliberate resolution.
- Failures preserve last valid plan/draft and show safe actions without protected telemetry.

## Scenario 4: Triggered display

1. Open a new entry with both behavior answers unanswered/no.
2. Change each of `Suicidal behaviors` and `Self-harm behaviors` to `yes` independently and together; rapidly toggle values.
3. Verify current plan appears inline immediately, stays while either is yes, and hides when both are no/unanswered.
4. Navigate/reload/reopen a saved triggering entry after updating the crisis plan.
5. Fail plan load/decrypt while an unsaved entry draft contains other fields.
6. Observe recipient/admin/notification/reporting channels.

Expected:

- Trigger response is under 100 ms locally and uses current plan, not snapshot.
- Entry is neither auto-saved nor lost; focus is not stolen and no modal takeover occurs.
- No recipient/user/service is alerted; trigger answers never enter share metadata/telemetry.
- Failure preserves draft and offers retry plus `Crisis Plans` navigation.

## Scenario 5: Immediate direct sharing

1. Use the Select2 owner user-selection control to search active users with short/long/case-varied/adversarial queries as owner, unrelated user, and unauthenticated caller; verify keyboard, touch, assistive-technology behavior, and cleanup after unmount/remount.
2. Confirm only minimal active non-self identities appear, rate limiting/pagination work, and admin/security fields are absent.
3. Select recipient B and commit share; do not perform invitation/acceptance.
4. Open recipient B's `Crisis Plans` tab/refocus/refresh.
5. Try unselected user, owner self-share, inactive user, duplicate mutation, stale grant/version, wrong recipient-bound grant, and 91st active recipient.
6. Deactivate or delete an already-active recipient, then attempt shared-list, refresh, direct-open, cached-link, and broker access while confirming the owner's plan and other shares are unchanged.

Expected:

- Share is active immediately and appears live in recipient B's tab.
- Recipient B has read-only online access; no edit/reshare/export/offline controls.
- Unauthorized/invalid attempts disclose neither plan nor sensitive relationship/account metadata.
- Deleted or deactivated recipients are denied immediately; their relationship may remain visible to the owner for audit until explicitly revoked.
- Duplicate mutation is stable; capacity failure changes nothing.

## Scenario 6: Cryptographic broker boundary

1. Create grants with wrong registry signature/authority/region/key version/algorithm, malformed package length/magic/reserved bytes, wrong owner/plan/recipient/share/generation digests, stale/future timestamps, and oversized SPKI.
2. Exercise KMS unavailable/denied/wrong-key/corrupt-ciphertext paths.
3. Race recipient open against owner revocation and recipient removal.
4. Inspect broker/API logs, traces, CloudWatch metrics, CloudTrail, error serialization, memory-test hooks, network/browser cache, and service worker.
5. Replay a prior open response with a different ephemeral private key/nonce/session.

Expected:

- Only exact current active bindings open; all other cases fail generically.
- Broker returns plan ciphertext and CPK rewrapped to one-use browser key, never raw CPK/plaintext.
- No body/grant/SPKI/nonce/key/ciphertext leaks to telemetry/cache.
- Race observes a defined before/after revocation boundary and never serves new generation to revoked user.

## Scenario 7: Recipient online-only teardown

1. Open a shared plan online, then trigger `offline`, tab hidden, route leave, component unmount, logout, session revocation, account switch, and browser back/forward cache behavior.
2. Restart/reload offline and inspect IndexedDB, Cache Storage, local/session storage, service worker, search index, browser HTTP cache fixtures, and DOM snapshots.
3. Keep the shared route open during owner update/refetch.

Expected:

- Every teardown removes shared plaintext and key references; offline shows online-required state.
- No shared summary/body/key/grant is durably available to recipient.
- Reopen/refetch reauthorizes and renders only latest committed version.

## Scenario 8: Owner revocation and key rotation

1. Share with B and C; capture old generation/body/grants in synthetic test fixtures.
2. Revoke B online/unlocked and interrupt before transaction, during retry, and after receipt loss.
3. Verify new CPK/body/owner wrap/C grant and B revoked state commit all-or-none.
4. Try B open and decrypt new ciphertext with old CPK; verify C still opens.
5. Queue B revocation offline and inspect owner messaging/remote B access before reconnect.
6. Cause concurrent plan edit/share state change, missing/extra/duplicate remaining grants, stale generation, and mutation replay.

Expected:

- UI never claims offline/failed revocation complete.
- Successful receipt immediately denies B and old CPK cannot decrypt new body.
- C continues with current grant; no unrelated share changes.
- Conflicts preserve intent and prior generation; replay does not rotate twice.

## Scenario 9: Recipient self-removal

1. Recipient C removes plan online and retries the same mutation.
2. Verify C disappears/denies immediately and owner sees `recipient_removed` plus rekey-required state.
3. Attempt owner content update/new share before rekey.
4. Owner unlocks/rekeys, then updates and optionally re-shares to C.

Expected:

- Removal changes only C and is retry-safe.
- Owner mutations block until cryptographic rekey; current plan remains readable to owner/other active recipients.
- Re-share is explicit and uses current generation.

## Scenario 10: Backup, recovery, and administrator boundaries

1. Restore fixtures containing current plan, owner wrap, active/revoked/removed shares, grants, receipts, pending rekey marker, and owner local conflict.
2. Validate index/state/generation invariants without decryption.
3. Run feature-010 journal recovery for owner; inspect recovery/admin UI, Lambda IAM, logs, and responses.
4. Attempt ordinary admin/recovery admin direct plan/share/grant/broker reads and KMS decrypt.
5. Restore an older snapshot against newer revocation/generation evidence.

Expected:

- Restore retains ciphertext and does not resurrect revoked/removed access or roll generation backward silently.
- Recovered owner JMK can unwrap owner CPK; recovery operator sees no plan/share/grant/key/plaintext.
- Only dedicated broker role can decrypt sharing grants, and only through authorized route behavior.

## Scenario 11: Browser, accessibility, and performance

1. Run create/edit/gate/trigger/share/revoke/shared-open/remove/offline/conflict paths in current Chromium, WebKit, iPhone, and iPad projects.
2. Exercise keyboard-only, touch, VoiceOver-compatible semantics, 200% zoom, 320/375/390 px reflow, onscreen keyboard, safe areas, orientation/split view, and reduced motion.
3. Run axe on representative states.
4. Measure local trigger/editor response and ordinary/degraded online views at small, 50-recipient, 90-recipient, and maximum body fixtures.

Expected:

- All primary journeys complete without serious/critical accessibility findings or hidden/unreachable actions.
- Current supported formatting is consistent across Chrome/Safari/WebKit.
- 95th-percentile 2-second ordinary, 5-second degraded/pending, 100-ms local response, and 2-second confirmation targets pass.

## Scenario 12: Cost and observability

1. Synthesize CDK and inspect IAM/key policy, route authorizer cache identity, log retention, metrics, alarms, PITR/backup inclusion, and CloudTrail KMS evidence.
2. Confirm only one dedicated sharing KMS key and one on-demand broker Lambda are added.
3. Load-test realistic and abusive broker/shareable-user patterns and inspect bounded metric cardinality/cost.
4. Verify no always-on compute, new table, queue, stream, WebSocket, per-user KMS key, or search service.

Expected: least-privilege policies and alarms synthesize, protected fields remain absent, and incremental costs remain limited to one key plus usage-scaled KMS/Lambda/API/DynamoDB/backup/log operations. Performance tuning does not introduce materially higher recurring AWS cost or always-on capacity without explicit user approval and measured justification.

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

Then re-list/remeasure the required suite and verify hosted PR duration:

```bash
npx playwright test --config playwright.quick.config.ts --list
/usr/bin/time -p npm run test:e2e:quick
```

Before completion:

- Run `git diff --check` and re-review the final diff for authorization, CPK/JMK lifetime, grant binding, revocation atomicity, recipient teardown/cache exclusion, plan prerequisite, conflicts/replay, restore, telemetry, browser/accessibility behavior, cost, dependency safety, and documentation accuracy.
- Verify required hosted validation is at or below ten minutes and record before/after counts/timing.
- Verify KMS/IAM policies separate sharing from recovery and deny ordinary API/admin/report/export/notification roles sharing-key decrypt.
- Update the journal threat model, owner sharing/revocation help, recipient online-only disclosure, and operator broker/key-rotation/restore runbooks.
- Do not claim HIPAA compliance, monitoring, diagnosis, or emergency response.

## Feature 010 prerequisite and Feature 011 required-suite baseline (2026-08-29)

- Feature 010 prerequisite: **PASS**. `npm run validate` passed runtime validation, typecheck, lint, 803 tests in 276 files, and all builds. Journal crypto/JMK recovery, Lexical editing, encrypted Dexie/outbox, sync v5 compatibility, ciphertext-only APIs, restore, infrastructure, performance, and browser coverage are present. The focused exhaustive Journal browser set passed 12/12 across Chromium, WebKit, iPhone, and iPad.
- Before Feature 011 changed the existing required Journal journey, `npx playwright test --config playwright.quick.config.ts --list` reported **24 tests in 14 files**.
- `/usr/bin/time -p npm run test:e2e:quick` passed **24/24 in 22.6 seconds**: real **22.97**, user **21.82**, sys **4.81**.
- The first sandboxed timing attempt could not bind `127.0.0.1:4173`; the approved local preview-server run above is the valid baseline.
- Feature 011 will extend the existing single Journal test, keeping the quick suite at 24 tests in 14 files. Exhaustive sharing/connectivity/browser/device cases remain outside required validation.

## Feature 011 implementation validation (2026-08-30)

Status: **PASS locally; hosted post-push confirmation remains a PR activity.**

Implemented coverage confirms all twelve acceptance-scenario groups through unit, component, contract, integration, security, restore, infrastructure, performance, and browser tests. This includes the single-field WYSIWYG Crisis Plan, first-entry gate, current-plan trigger behavior, Select2 active-user sharing, signed registry and identity-bound grants, online-only recipient access, atomic revoke/rekey behavior, self-removal, encrypted offline intent/conflict recovery, backup/restore boundaries, responsive accessibility, observability, and cost-bounded infrastructure.

Validation evidence:

- `npm run validate`: **PASS** — 297 test files and 836 tests passed; runtime, typecheck, lint, API/Web/Infra builds all passed.
- `npm run format:check`: **PASS** — all matched files use the repository Prettier style.
- `npm run test:observability`: **PASS** — 5 files and 26 tests passed.
- `npm run test:performance`: **PASS** — 18 files and 30 tests passed, including the Crisis Plan response and scale budgets without adding always-on AWS capacity.
- `npm run cdk:synth`: **PASS** — `NaasehEdge` and `NaasehProd` synthesized; the Crisis Plan design uses one dedicated sharing key and usage-scaled services, with no always-on capacity added.
- `npm run validate:workflows`: **PASS** — 3 workflow files validated with immutable external-action SHAs.
- `npm run test:e2e`: **PASS** — 384 passed and 8 production-only tests skipped across the configured Chromium, WebKit, iPhone, and iPad projects in 6.4 minutes. The first run exposed two older exhaustive Journal journeys that did not create the newly required Crisis Plan; both were repaired and their 8 browser/device variants passed before the clean full rerun.
- `npx playwright test tests/e2e/crisis-plan-sharing.spec.ts tests/e2e/crisis-plan-connectivity.spec.ts`: **PASS** — 8/8 across Chromium, WebKit, iPhone, and iPad in 16.1 seconds.
- `npx playwright test tests/e2e/journal.spec.ts`: **PASS** — 4/4 across Chromium, WebKit, iPhone, and iPad in 9.3 seconds.
- `git diff --check`: **PASS**.

Required quick-suite comparison:

| Measurement | Before Feature 011 | After Feature 011 |
|---|---:|---:|
| Tests/files | 24 tests / 14 files | 24 tests / 14 files |
| Playwright duration | 22.6 seconds | 22.9 seconds |
| `/usr/bin/time` real | 22.97 seconds | 23.24 seconds |
| `/usr/bin/time` user | 21.82 seconds | 23.56 seconds |
| `/usr/bin/time` sys | 4.81 seconds | 5.52 seconds |

The required suite therefore adds **zero tests and zero files**: Feature 011 extends the one representative Journal journey, while multi-user sharing, connectivity, and browser/device combinations remain in exhaustive non-quick suites. The 0.27-second wall-time difference is normal run variance and does not indicate a meaningful validation-cost increase.

AWS hardening follow-up (2026-08-30): focused broker, user-projection, infrastructure, and deployment-security validation passes. The broker bundle no longer imports `userById`; it reads only the top-level `brokerActive` projection and the exact share `data` map under attribute-scoped IAM. One-use request IDs are conditional DynamoDB receipts with a 120-second TTL, and a fresh broker-instance test proves replay denial survives cold starts. The production canary now performs six read-only/denied tests, including cryptographic registry-signature verification and repeated Journal/Crisis Plan reads across separate invocations. CDK synthesis reduced `NaasehProd` from 405 to **399 resources** by removing the redundant Journal Lambda and reusing the existing API/log boundary; the dedicated broker remains isolated. See `docs/operations/production-stack-resource-review.md`.

The later user-approved quick-suite expansion was measured separately from the original single-journey Feature 011 change. Before expansion, the required suite contained **24 tests in 14 files** and passed in **23.03 seconds real**. After adding the representative full Journal, sharing, and connectivity journeys, it contains **28 tests in 17 files** and passed in **26.85 seconds real**, an increase of 4 tests, 3 files, and 3.82 seconds. Exhaustive browser/device combinations remain in the local release gate.

`npm run validate:pre-aws:browsers`: **PASS** on 2026-08-30. Coverage validation passed **299 files / 847 tests**; Python operator validation passed 21 tests; typecheck, lint, formatting, workflow validation, builds, and CDK synthesis passed; and the browser matrix finished with **384 passed / 20 production-only skipped in 6.6 minutes** across Chromium, WebKit, iPhone, and iPad. Real AWS KMS, CloudWatch, backup, and isolated restore checks remain post-deployment gates and are documented in `docs/operations/release-with-aws.md`.

Hosted evidence: the latest successful `validate.yml` run available before these unpushed local changes completed in **4 minutes 8 seconds** (2026-08-24), well below the ten-minute requirement: <https://github.com/stevekessler/naaseh/actions/runs/32678771420>. Because Feature 011 has not been pushed by this implementation workflow, its exact hosted duration cannot yet be measured. The unchanged required test/file count and comparable local timing project substantial headroom; the first Feature 011 PR run must be recorded here before merge.

Final review result: **PASS**. The final diff was reviewed for owner/recipient authorization, CPK/JMK separation and lifetime, signed registry and grant binding, rotation atomicity and replay, recipient cache/teardown exclusion, prerequisite enforcement, encrypted conflict retention, restore invariants, protected telemetry, accessibility, dependency scope, and AWS cost. No plaintext Crisis Plan body, decrypted sharing key, recipient query, or crisis answer is intentionally persisted or emitted to operational telemetry. The remaining Vite large-chunk warning is pre-existing and does not alter these controls.
