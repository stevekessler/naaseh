# Na’aseh Finance 016 handoff for Steve’s Codex

Prepared November 5, 2026. Implementation stopped at the user’s request. The Finance WIP is published on the existing GitHub branch.

- Existing repository: `stevekessler/naaseh`
- Branch: `codex/task-item-creation-uploads`
- Baseline checkpoint: `4d676379b1c3bc5771a49e6b323f9443e34d8b27`
- Published WIP commit: `0c0cc689318bf00403106c7c1ffc9e6ac465ea8c`
- `.specify/feature.json` resolves to `specs/016-finance-experience-expansion`.
- Apple directories were unchanged by the WIP commit. The parent checkpoint contains Apple and other existing work that must be preserved.

## Bring the work into Steve’s checkout

Fetch the latest branch from GitHub and fast-forward your local checkout. Run these commands from the existing Na’aseh checkout on `codex/task-item-creation-uploads`.

```sh
git fetch origin codex/task-item-creation-uploads
git merge --ff-only FETCH_HEAD
```

The branch includes the full WIP and this handoff. If Git reports divergence or an untracked file collision, stop and report it so existing work is preserved.

## Instructions for the receiving Codex

Continue using `$speckit-implement` in the existing repository. Read `AGENTS.md`, `.agents/skills/speckit-implement/SKILL.md`, the constitution, the Finance 016 spec, plan, research, data model, contracts, quickstart, checklists and tasks, and the Finance 015 task list. Read `docs/testing/finance-experience-validation.md`, `docs/testing/finance-experience-validation-runtime.md`, `docs/operations/finance-experience-cost.md`, and `docs/operations/finance-experience.md` for detailed evidence. Keep the existing spec, plan and tasks. Implement web/PWA, API, shared TypeScript, infrastructure, tests and docs only. Preserve Apple clients’ compatibility; defer native Apple changes and validation. No deployment, production changes, merge, or AWS writes were authorized. The user explicitly deferred real DynamoDB and hosted acceptance while local development continues.

## Validation to resume

Use Node 24 and `npm ci`. Keep the approved exact Playwright 1.64.1 and install its matching Chromium and WebKit binaries. Run the validation commands sequentially with the machine awake: `npm run validate`, timed `npm run test`, `/usr/bin/time -p npm run test:e2e:quick`, and `/usr/bin/time -p npm run test:e2e`. Do not raise timeouts to compensate for host suspension. The quick selection remains 31 cases, full selection 556, and required test discovery 1,415 cases in 435 files. Keep the required hosted PR target at or below ten minutes with the existing 15-minute timeout; current hosted duration remains unverified.

- The initial baseline had 1,321 unit/integration passes; validation failed on lint scanning a virtual environment, fixed in the WIP. Initial full browser run: 522 pass, 20 skip, 2 fail. Detailed baselines are in the runtime report.
- All 12 PIN cases passed unchanged in 23.14 seconds on 1.64.1 after the user added the updated Playwright app in macOS Keychain Access. That authorization is local to the sending Mac. If Steve sees the same WebKit freeze, first reproduce with a synthetic non-extractable CryptoKey IndexedDB persistence probe. The prior investigation found WebKit waiting on its own master-key access; do not replace or expose the key, weaken encryption, or assume the permission issue reproduces on Steve’s machine.
- The six bounded query-status HTTP tests, type checking, and lint passed. Latest `npm run validate`: 431/435 files passed, 1,400 cases passed, 1 failed, 14 skipped. Three infrastructure setup hooks and an urgency performance case timed out during documented Mac sleep. Build was not reached.
- Two full browser runs each returned 514 passed, 20 skipped and 22 failed during repeated 10–17 minute macOS sleep cycles. The first run’s 22 failures all passed unchanged in 26.77 seconds on targeted rerun. A fresh uninterrupted full run is still required. No validation gate was accepted from the failed runs.

## Resume foundation work before dependent stories

19 of 159 tasks are checked. Foundation T012, T013, T017 and T018 remain open. Local building blocks include bounded reads and compact text postings, reversible/restartable fact publication, canonical source loaders, coverage proofs, migration tooling, and owner-only query jobs. Query status now resolves before legacy whole-scope hydration and checks the current session, tab grant and security revision. Initial bounded transaction query creation and pagination, automatic incremental publication from canonical writes, and remaining infrastructure review still need work. Keep legacy Apple-facing API and sync behavior compatible. Do not turn on a whole-scope read fallback or schedule a complete rebuild after every write.

T018 still needs actual DynamoDB and hosted measurements. The conditional ongoing combined Finance AWS estimate is $6.466201/month against Steve’s approved $6.50/month ceiling; the synthetic initial 100k-row migration extrapolates to $25.215 for writes alone. Do not run that migration under the approved ceiling. Optimize it and repeat the cost and bounded-read acceptance when an authorized isolated environment is available. Local fixtures are not live capacity or latency evidence.

The PIN story is partial. Current server and web code covers self-only PIN management, canonical session/tab grants, offline verification, encrypted metadata, and withholding locked data. T022 records the passing representative PIN tests only. Semantic Finance replay, the independent web delivery cursor, pending-data recovery/invalidation coverage and the final lifecycle audit remain open. Keep subsequent task checkboxes tied to their own passing evidence.
