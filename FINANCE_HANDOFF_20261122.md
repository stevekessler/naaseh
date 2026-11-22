# Na’aseh Finance handoff — November 22, 2026

Start here on the second computer. Steve is stopping work on both computers and transferring Finance development here.

## Import the complete handoff before continuing

GitHub branch `codex/finance-transfer-20261122` is a transport branch containing this prompt and `naaseh-finance-transfer-20261122.bundle`. **Its ordinary application files are the older Computer 2 baseline. The current integrated source and all preserved files are inside the bundle. Import it using the commands below.**

- Complete continuation commit: `9109abb87492b85b6497ef37f006741b651dd760`
- Bundle SHA-256: `d37decc86db0f962feeecab41041133a5a7508be35a05a7e0c12b2a68d52e3ed`
- Exported bundle ref: `refs/heads/codex/finance-transfer-20261122`
- Bundle prerequisite: `c4c4978820697701dfa11ac33a9c83a78f68437b` (included in the published transport branch's ancestry).
- Integrated Finance checkpoint: 132/166 checked tasks, including dashboard/trends implementation. Additional already-published spending-report/forecast work must be reconciled as described below.

Use an existing clone of `git@github.com:stevekessler/naaseh.git`, or clone it first. Inspect `git status --short` before any changes; preserve any second-computer-only work. These commands import into a new branch/worktree without resetting the existing working tree:

```sh
git status --short
git fetch origin refs/heads/codex/finance-transfer-20261122:refs/remotes/origin/codex/finance-transfer-20261122
transfer_tmp=$(mktemp -d)
git show origin/codex/finance-transfer-20261122:naaseh-finance-transfer-20261122.bundle > "$transfer_tmp/finance.bundle"
python3 -c 'import hashlib,pathlib,sys; actual=hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest(); expected="d37decc86db0f962feeecab41041133a5a7508be35a05a7e0c12b2a68d52e3ed"; print("Bundle SHA-256:", actual); sys.exit(0 if actual == expected else 1)' "$transfer_tmp/finance.bundle" &&
git bundle verify "$transfer_tmp/finance.bundle" &&
git fetch "$transfer_tmp/finance.bundle" refs/heads/codex/finance-transfer-20261122:refs/heads/codex/finance-continuation-20261122 &&
git worktree add ../naaseh-finance-continuation codex/finance-continuation-20261122
```

Stop if verification fails or a destination branch/worktree already exists with different work. Do not use force, reset or overwrite it; inspect/preserve it and choose a new name if appropriate. Then:

```sh
cd ../naaseh-finance-continuation
git rev-parse HEAD
# Expected: 9109abb87492b85b6497ef37f006741b651dd760
python3 handoff/finance-016/verify-transfer.py
cat .specify/feature.json
```

The manifest must report 1,918 verified files. Read and follow the full continuation prompt below (also committed at `handoff/finance-016/second-computer-prompt.md` inside the imported snapshot). Continue on the imported local continuation branch. To push it, use a distinct remote branch such as `codex/finance-continuation-20261122`; do not overwrite the artifact transport branch with the bundle's similarly named internal ref.

The handoff includes original integration history, the original first-computer working files, separate session/sync and Apple patches, existing generated outputs, detailed status and release/cost boundaries. No migration or production change was made. Exact transfer integrity was verified; no new application test pass is claimed.

---

# Na’aseh Finance — second-computer continuation prompt

Steve is stopping development on both computers and transferring Finance work to this computer. Use this handoff as the starting point. Continue the remaining implementation and acceptance work; do not restart completed stories or infer completion from historical notes.

## Repository and starting branch

- Repository: `git@github.com:stevekessler/naaseh.git`
- GitHub transport branch: `codex/finance-transfer-20261122`.
- **The GitHub transport branch stores the complete work as `naaseh-finance-transfer-20261122.bundle`. Import that bundle before using application files or task counts from the transport branch.**
- The human-readable root entrypoint is `FINANCE_HANDOFF_20261122.md`; it records the bundle SHA-256 and exact import commands. Follow it first.
- The bundle exports the ready-to-use `refs/heads/codex/finance-transfer-20261122` snapshot, containing the integrated Finance source, every handoff artifact and existing output. Import it under a different local branch name (for example `codex/finance-continuation-20261122`) so it cannot be confused with the GitHub transport branch.
- The ready-to-use snapshot descends from original integration commit `5211631161623afc80e1d8618609ed179890d552`. Exact original history and the full first-computer checkpoint are preserved in the nested bundles.
- Feature: `.specify/feature.json` must select `specs/016-finance-experience-expansion`.
- Use a clean checkout or new worktree. Do not overwrite/reset any existing second-computer work. Inspect its status and preserve additional local work before integration.
- Do not use the GitHub transport branch's older application source as the implementation baseline. Start only after the exported continuation snapshot is imported and its manifest passes.

## Read before changing code

1. `AGENTS.md` and any applicable instructions below the directories being changed.
2. This prompt and `handoff/finance-016/transfer-notes.md`.
3. The newest checkpoint at the top of `docs/operations/finance-016-handoff.md`.
4. `docs/testing/finance-experience-validation.md` and `docs/testing/finance-experience-validation-runtime.md`. Their older sections are historical, and the runtime document's first section is not necessarily the newest result.
5. `specs/016-finance-experience-expansion/tasks.md`, `spec.md`, `plan.md`, contracts and quickstart.
6. `docs/operations/finance-experience.md` and `docs/operations/finance-experience-cost.md`, including staging and T018 acceptance instructions.

Do not repeat the obsolete attachment/patch setup steps from old conversations. Do not assume this computer uses the first computer's absolute checkout path.

## Preserved checkpoints

| Checkpoint | Exact SHA | Purpose |
| --- | --- | --- |
| Shared published Finance base | `c4c4978820697701dfa11ac33a9c83a78f68437b` | Bundle prerequisite |
| Computer 1 upcoming expenses | `0855a36` | Phase 9 completion |
| Computer 1 dashboard preferences | `131e515f8bc0347922e96b175ba6f250fa474c44` | 98/166 checkpoint |
| Computer 2 return | `3b5a7b58f192fd6051cef8ec35160de78f80633c` | Transactions, receipts and receipt restore follow-ups |
| Combined Finance integration | `5211631161623afc80e1d8618609ed179890d552` | 132/166; dashboard and trends implementation |
| First computer full local snapshot | `5a2ed6a10193f56ecbbfa2a1bc9ea116d1797c1b` | Original uncommitted source, tests and docs, including later sync work and local Apple identifier |

Original-history recovery is optional; the transfer branch already contains the integrated source. If ancestry is needed:

```sh
git bundle verify handoff/finance-016/finance-016-integration.bundle
git fetch ./handoff/finance-016/finance-016-integration.bundle \
  refs/heads/codex/finance-016-integration:refs/heads/archive/finance-integration-nov16
git bundle verify handoff/finance-016/first-computer-full-checkpoint.bundle
git fetch ./handoff/finance-016/first-computer-full-checkpoint.bundle \
  refs/heads/archive/first-computer-20261122:refs/heads/archive/first-computer-20261122
```

The bundles require the published `c4c4978` base. If it is missing, fetch `origin/codex/task-item-creation-uploads` before importing. These refs preserve history; do not blindly merge the full local snapshot into Finance.

## Current implementation status

The combined snapshot has **132/166 checked tasks**, not a release approval.

Complete story phases: Finance PIN/security/offline boundary; navigation/accounts; payment details, classifications and refunds; active budgets using existing groups; manual transactions; account/global transaction browsing; upcoming expenses; private receipts; task/post-it links including T122 and T123.

Dashboard widgets and spending trends are implemented. The dashboard displays canonical upcoming expenses, selected balances, open budgets, recent category/merchant activity, and month/quarter/year spending trends. Trends use local-date bounds, shared refund-aware spending predicates and separate currencies. Offline values are explicitly partial or saved; open-budget/recent-activity widgets need a connection.

At this snapshot:

- T018 remains open for deployed isolated staging, live DynamoDB/S3/hosted measurements and cost acceptance.
- Dashboard T124, T125, T127, T129, T132 and T133 remain open. Finish the missing reference/security/contract cases, live widget performance and cross-device preference acceptance. T126/T128/T130/T131 are checked.
- Trends T134–T139 are checked; T140 remains open for browser evidence and normal live read measurements.
- Spend-report T141–T147 and forecast T160–T166 remain unchecked in the integration snapshot, but **there is additional implementation already published on GitHub**. Reconcile it before implementing those tasks again.
- Final acceptance/polish T148–T159 remains open.

## Additional already-published Finance work: reconcile first

Remote discovery on November 22 found these exact tips:

| Branch | SHA | Relationship / next step |
| --- | --- | --- |
| `codex/finance-016-spend-report` | `913e40abd5af31f68bfdef306aede0843ec77859` | Adds protected spending-report implementation on top of original transaction/receipt branch |
| `codex/finance-016-forecast` | `42bc68da4f08911fdf914b08bda38711a6d78eaa` | Direct child of `913e40ab`; adds forecast domain models/contracts and tests, not the complete forecast UI/API story |
| `codex/finance-016-import-error-redaction` | `0d52d94669b2d49f8120d5e81b728ab3e64a180b` | Inspect ancestry and diff for a potentially relevant security fix before final acceptance |
| `codex/finance-016-receipt-recovery` | `1d00d176c8a1167a6644039fa0b1fa2bea2d71e8` | Inspect ancestry/diff; some receipt recovery is already included in the Computer 2 return |

Fetch these refs, compare merge bases and unique commits with the transfer snapshot and the recovered original integration branch. Integrate only missing changes. In particular, do not merge a stale transaction/receipt snapshot wholesale over the newer dashboard/upcoming/task-link work. The published forecast line contains the earlier `a73dcf9` transaction-browsing and `9eafd45` receipt commits; those capabilities are already integrated here.

A likely small integration unit is the spend-report commit `913e40ab`, followed by the forecast commit `42bc68da`, with explicit resolution of shared handler/query/worker/router/contracts/docs/task-list changes. Inspect first; do not assume either commit passes the current combined gates or warrants every story checkbox. Preserve current-source authorization, exact totals, local-time boundaries and PIN lifecycle throughout.

## First-computer changes intentionally kept separate

The first computer's working tree was almost exactly dashboard checkpoint `131e515f`, plus later ordinary session/task-sync changes and a personal Apple signing identifier. All original tracked/untracked working files were preserved.

- `handoff/finance-016/first-computer-full-checkpoint.bundle` preserves the exact local source/test/doc snapshot before transfer.
- `handoff/finance-016/first-computer-sync-changes.patch` is the full binary-capable diff from `131e515f` to that snapshot excluding Apple. It contains sync/auth/task-cache changes and associated browser fixtures/tests. This patch is **not applied** to the Finance integration source.
- Keep the session/sync production work separate from Finance, per Steve's instruction. Compare this patch against the already-published sync branches and current production/main before replaying anything. Some or all may already have shipped separately. Do not revert those production fixes during eventual Finance integration.
- Relevant discovered remote sync tips: `codex/sync-session-production` at `1db047f3e6e263263c27b20e5ecbd0bc0ca06051`, `codex/sync-production-canary-fix` at `3be0a66ef783f2d748162c76ecd3ac3e402025f3`.
- `handoff/finance-016/local-apple-identifier.patch` preserves the existing Personal Team bundle-ID edit to `com.stevekessler.naaseh.personal`. It is intentionally a patch, not an applied Finance project change. Do not overwrite receiving-computer signing or apply it without checking local needs. No Apple build/test was performed for this handoff.
- `outputs/` is preserved, including the earlier PR84 audit reproduction artifacts and Apple testing workbook/inspection data. The audit report describes its old reviewed commit, not a fresh audit of this transfer. Do not treat its vulnerability-confirming reproduction tests as current passing security gates or move them into required tests without review.

## Validation evidence and next commands

Latest recorded validation for the unchanged integrated source: **2,021 tests / 507 files / 65.57 seconds**, including runtime, typecheck, lint and builds, at the November 16 checkpoint. Integrated task-link browser acceptance T123 was reported **12/12**. The newer dashboard browser selection had ten Chromium/WebKit cases; its preview listener was blocked before cases ran. The earlier eight-case dashboard pass predates full integration. Do not call the new dashboard/trends browser acceptance complete based on that older result.

The November 22 transfer did not change Finance application source from `52116311`. It verified bundle integrity, manifest hashes and source-tree parity. No fresh required/browser test pass is claimed. The sender's shell defaults to Node 20 and lacks a located Node 24 runtime; do not bypass the Node requirement.

On this computer:

```sh
node --version                    # Must be 24.x
npm ci
npm run validate
/usr/bin/time -p npm run test:e2e:quick
npm run test:e2e -- finance-dashboard.spec.ts --project=chromium --project=webkit
```

Inspect the available browser specs and run relevant trend/report/forecast/receipt/task-link journeys after integrating those changes. Install required Playwright browsers if missing. Keep exhaustive desktop/iPhone/iPad combinations in the full local gate. Do not increase required/quick selections, timeouts or retries to hide failures. Record discovered case counts and timings; hosted evidence remains separate from local evidence.

Repository runtime rules: required PR validation target ≤10 minutes; workflow timeout has hosted-runner headroom and is not the target. Before expanding required commands, measure before/after; for browser changes use `/usr/bin/time -p npm run test:e2e:quick`. Confirm total hosted PR duration after changes before merging. Keep broad device coverage outside the quick suite.

## Release, cost and authorization boundaries

- Continue implementation, testing, commits and pushes on the Finance continuation branch. Steve explicitly authorized committing/pushing the handoff; older handoff text prohibiting all pushes is historical.
- This transfer does not authorize deploying Finance, running migrations, changing production, merging into main, or raising the cost ceiling. The migration remains unrun.
- Preserve the combined **$6.50/month ceiling including 30% contingency**. The retained-receipt sensitivity crosses that ceiling by month 24. Resolve the live-backed cost forecast or request an explicit budget decision before claiming cost acceptance.
- For T018, first read the staging procedure and inspect actual AWS identity/account/domain/recovery-role inputs. Do not substitute production. Local synthesis/storage-double tests do not establish live performance, durability, scanning or recovery.
- Preserve original receipt bytes in S3 Standard, exact version/checksum identity, transaction retention, current source/group access and Finance PIN protection. Do not mix protected Finance details into ordinary task/search/export/notification data.
- Final release gates include live performance, exact totals/capacity, receipt recovery/scan evidence, responsive/offline/security checks, hosted runtime, human usability, documentation and final review. Leave unmeasured human/cloud gates unchecked.

## Execution order and expected reporting

1. Verify the transfer manifest and receiving working tree. Preserve any second-computer-only work before changes.
2. Reconcile the remote spend-report/forecast/security/recovery branches and report what is already included versus missing.
3. Complete outstanding local dashboard/trend acceptance and integrate missing reports/forecast work without redoing completed phases.
4. Run relevant checks with Node 24 and update the newest handoff/task/evidence records with actual results.
5. Continue remaining final acceptance preparation. Surface only concrete missing AWS/staging inputs, human checks or cost decisions that block progress; continue independent local work.
6. Commit and push checkpoints. End each checkpoint with branch/full SHA, checked-task count, tests actually run, unresolved gates, and the next concrete task. Do not claim production deployment or release readiness until the corresponding evidence exists.
