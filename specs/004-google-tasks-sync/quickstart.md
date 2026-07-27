# Quickstart Validation: Bidirectional Google Tasks Sync

## Prerequisites

- Node.js 24 and repository dependencies installed.
- A Google Cloud test project with Tasks API enabled, an OAuth web client, the test redirect URI,
  and test users on the consent screen.
- A dedicated disposable Google account/task list for live validation. Never use production task
  data in automated fixtures.
- AWS integration environment with the OAuth secret configured and least-privilege sync resources
  deployed for tests that exercise real callbacks or KMS.

## Local deterministic gates

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run cdk:synth
```

Run focused tests during development:

```sh
npx vitest run tests/contract/google-sync.contract.test.ts tests/integration/google-sync-merge.test.ts tests/integration/google-sync-lifecycle.test.ts tests/security/google-sync.security.test.ts infra/test/google-sync.test.ts
npx playwright test tests/e2e/google-sync.spec.ts --project=chromium --project=webkit
```

## End-to-end acceptance

1. Sign in as a normal owner, open Google synchronization settings, and start connection.
2. Verify a top-level Google consent page requests Tasks read/write access only; deny once and confirm
   Na'aseh remains disconnected with a safe explanation.
3. Connect, create or select a disposable `Na'aseh` Google task list, set default time/time zone, and
   inspect the initial preview before applying it.
4. Publish a public dated Na'aseh task. Confirm one Google Task appears with matching title/date,
   no Na'aseh memo, and no duplicate after three manual retries.
5. Edit its Google title and Na'aseh due date before the next run. Confirm both independent changes
   converge. Then edit the title differently on both sides and confirm a conflict blocks only title.
6. Resolve the conflict each way, including an edited value, and verify both stores converge once.
7. Complete, replay, reopen and delete in Google. Confirm one counted completion, correct reversal,
   local archival on remote deletion and no local permanent deletion.
8. Create a dated Google Task and verify one local import with the configured time. Create an undated
   Google Task and verify it is skipped and counted without a local task.
9. Verify private tasks are excluded, then approve one after the warning and confirm hidden memo
   plaintext and ordinary memo text never leave Na'aseh.
10. Test pause, revoked Google permission, list removal, throttling and lost-response fixtures. Confirm
    pending work/checkpoints remain, status is actionable, and replay creates no duplicates.
11. Disconnect once retaining remote tasks and once deleting only Na'aseh-origin remote tasks. Confirm
    local tasks remain and stored credentials are unusable afterward.
12. Repeat the UI journey in Chromium and WebKit at desktop, iPhone and iPad viewports with keyboard
    and touch paths; verify focus, live status, reduced motion and offline read states.

## Operational and recovery validation

- Inspect CloudWatch events/metrics using only disposable IDs. Confirm no title, date, note, OAuth
  value, provider body or conflict candidate appears.
- Interrupt a multi-page run after each boundary and verify restart matches an uninterrupted result.
- Restore an isolated backup and confirm connections are `reauthRequired`, pre-restore operations do
  not call Google, and local mappings/tasks remain available for recovery.
- Exercise 5,000 linked-task/100-change fixtures and record progress-start and convergence p95.
- Review the final diff against the constitution and update user/operator documentation before
  checking every task complete.
