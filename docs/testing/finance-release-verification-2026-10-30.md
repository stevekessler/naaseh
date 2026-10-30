# Finance release-path verification — 2026-10-30

Release candidate: PR [#84](https://github.com/stevekessler/naaseh/pull/84), commit
`78d3831751c64f877489a7f4e6bf16bed703128f`. Verification ran in an isolated checkout with
Node.js 24.22.1. The old task-upload checkout was excluded; its missing Finance wiring is not a
finding against this release candidate.

## Automated PR validation

GitHub job `124110919723` succeeded on that exact commit from **14:13:06 to 14:18:12 UTC**:
**5 minutes 6 seconds**, below the ten-minute target. This was verified against GitHub job metadata,
including the head SHA, conclusion and timestamps. The dependency audit, application validation and
31 required quick browser cases passed in
[workflow run 41069897750](https://github.com/stevekessler/naaseh/actions/runs/41069897750).
T101 is already complete for this commit. Another code review is not required merely to satisfy
this automated-validation gate.

The verification checkout changes only this evidence, the cost-acceptance/acceptance instructions,
and one full-browser fixture assertion. The fixture now expects the `budgetId` already sent by the
reviewed application when creating a task from a shared budget item. It retains strict request
comparison and does not change production behavior or expand the required quick suite.

## Fresh local release checks

`npm run validate:pre-aws:browsers` passed runtime, TypeScript, lint, formatting, pinned-action
validation, **411 files / 1,362 tests**, coverage thresholds, **25 Python operator tests**, all
workspace builds and production infrastructure synthesis.

The initial exhaustive browser run executed **548 cases**: **522 passed, 20 skipped, six failed**.
Four failures were the stale task-creation request assertion, one per browser/device profile.
The other two were unreadable task-cache recovery cases in WebKit and iPad. The full command ended
at its browser phase and is not recorded as an unconditional pass.

After correcting the fixture, an isolated single-worker rerun of both affected files passed
**24 of 24** cases across Chromium, WebKit, iPhone and iPad in **39.4 seconds**. This included every
initial failure and its sibling cases. The task-cache cases were not changed.

A fresh full Finance matrix passed **104 of 104 cases** across Chromium, WebKit, iPhone and iPad
in **71.27 seconds** wall time. Tests use synthetic HTTP fixtures; they do not establish real bank
connectivity or deployed IAM policy behavior.

## Live AWS service exercise

The operator identity was verified as the non-root `NaasehBootstrapAdmin` assumed role in account
`093733938983`. Production tables, application deployments and personal data were not modified.
The exercise used purpose-tagged temporary resources in `us-west-2`, invented owner/member records,
and the actual release candidate's Finance, synchronization and ordinary-task handlers.

The checks cover:

- Real DynamoDB persistence across independent handler instances using API Gateway greedy-route
  event shapes.
- A 100-row CSV request, bounded transactions and duplicate-free replay.
- Offline-budget commands reaching the production synchronization dispatcher and replaying once.
- Private account/item omission from another member's authorized snapshot and incomplete budget
  totals without private identifiers.
- Atomic Finance task creation and reads through the ordinary task API.
- Fresh membership removal rejecting further commands and removing protected projections.
- Real DynamoDB conditional-transaction rejection of a stale writer.
- Real KMS envelope encryption/decryption, committed import dispatch, an independent importer and
  terminal-job replay without another provider request. The provider response is a local mock;
  no bank was contacted and no real credentials were used.
- A DynamoDB on-demand backup restored into a second isolated table, validated by the same
  `validateDurableFinanceRestore` function called by the deployed restore-testing workflow.
  Removing a restored parent account must make that validator reject the fixture.

**Result: all 10 live service checks passed.** The restored table contained **267 records**, including
2 accounts, 2 balance snapshots, 101 transactions, the CSV batch, budget, item, account link,
and Finance task relationship. The ordinary task was also present. The restored dataset matched
the source row count. Restore and integrity validation took **225.316 seconds (3m45s)**, and the
corrupted-copy probe was correctly rejected.

Both temporary tables and the synthetic backup were deleted. The synthetic credential key is
scheduled for deletion on **2026-11-06** after the required seven-day KMS waiting period. Its
associated table data and backup no longer exist. No cleanup operation failed.
Machine-readable results are in `evidence/finance-release-2026-10-30.json`.

This exercise does **not** deploy the application, test CloudFront/API Gateway transport, execute
under the production Lambda roles, prove CloudWatch delivery, or run an AWS Backup Restore Testing
plan against production recovery points. It does not certify the production RPO/RTO. Those checks
belong to a controlled deployment and the existing isolated restore runbook. Large-account API
pagination/profiling remains listed in `finance-full-code-audit.md`.

## Two-user acceptance and price

Heather and Steve need a running test application with its backend and separate accounts. A local
instance with real handlers and invented fixtures is sufficient; a controlled test deployment is
another option. The existing frontend-only development fallback and canned browser responses do
not constitute this test environment. Human acceptance can follow the first controlled test
deployment and must finish before real Finance use/general release.

Use `specs/015-finance-budget-management/acceptance.md`: account setup under three minutes,
budgeting under five minutes, unassisted CSV import and clear statuses for both participants.
The worksheet now identifies the tested commit/environment. No human result was fabricated and
T103 remains pending.

Steve accepted the current design's price in this chat on 2026-10-30. That resolves the outstanding
price-approval request for this reviewed design; actual usage and latency measurements remain
operational evidence, not another request to approve the same price.
