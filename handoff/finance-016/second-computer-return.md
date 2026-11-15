# Finance 016 second-computer return

November 15, 2026

The provisional branch is `codex/finance-016-second-computer` in an isolated local checkout. It starts from the shared Phase 7 checkpoint `c4c4978820697701dfa11ac33a9c83a78f68437b`. The original checkout remains on `codex/mobile-task-list-layout`. Its feature pointer is Finance 015. This branch's `.specify/feature.json` points to `specs/016-finance-experience-expansion`.

## What is on the branch

| Scope | Commit and status |
| --- | --- |
| Phase 8, T072–T081 | `a73dcf91198684bb1760384537a663dd987dd959`. Already committed and checked in the local Finance branch. |
| Phase 9, T082–T093 | Reported complete in the first computer's handoff. Import still pending. Verify tip `d9bc35b`, ancestry of `0855a36`, and the latest handoff note before carrying over the checkmarks. |
| Phase 10, T094–T108 | `9eafd458168c709147c9bb3923947101b97bb5e5`. Already committed and checked in the local receipts branch. |
| Receipt recovery | `e71d4eb7bc8271da81d082a9ac48c6dea1c21b4c` replays local commit `1d00d176c8a1167a6644039fa0b1fa2bea2d71e8` on the receipts base. It covers expired upload cancellation and stale or revoked receipt content and listings. |
| Phase 11, T122 | Open. The local provider reconciler registers the canonical transaction alias and invokes the existing reference-transfer hook. It needs the imported Phase 9 fulfillment graph and the Phase 11 generalized task-link and partial-retry implementation to verify the receipt/task/fulfillment graph and restore path together. |
| Phase 11, T123 | Open until T122 and the remaining browser journeys are ready. |

Local Spend Report `913e40abd5af31f68bfdef306aede0843ec77859` and Forecast `42bc68da4f08911fdf914b08bda38711a6d78eaa` remain in their existing worktrees. The provisional branch contains only Phase 8, Phase 10, and receipt recovery.

## First computer

The T109 test-authoring baseline remains `origin/codex/task-item-creation-uploads` at `c4c4978820697701dfa11ac33a9c83a78f68437b`. The first computer can draft the target union, legacy budget-item adapter, unique links, and partial-success retry contracts in `tests/contract/finance-expense-task-links.contract.test.ts`. Keep this pass test-file-only and leave T109 unchecked until the corresponding implementation passes.

T111 stays reserved for the first computer. The full Chromium/WebKit run in `tests/e2e/finance-expense-task-links.spec.ts` needs the Phase 9 base and the Phase 11 Add Task flow, selectors, reverse navigation, task/Post-it settings and embedded authorization. Avoid parallel changes to shared Finance handlers and contracts, transaction and receipt browser specs, provider reconciliation and restore tests, and the Finance task checklist. This computer retains Phase 8, Phase 10 and T122.

## Integration and release

Git writes in the original checkout failed at `.git/FETCH_HEAD`. A read-only GitHub check and a fetch in the isolated checkout both failed to resolve `github.com`. The GitHub bundle's availability could not be confirmed, and neither requested commit object was present locally. No branch was pushed. Use the verified Phase 9 tip as the integration base once the handoff can be fetched. Confirm Phase 8 ancestry there before adding receipts and receipt recovery.

Keep T018 open for real DynamoDB and hosted acceptance, preserve the combined $6.50/month AWS ceiling, and leave the migration unrun. No deployment, production change, or merge to main was performed.

## Fresh local validation

Node 24.22.2 and Playwright 1.64.1 were used against the provisional branch.

| Gate | Result | Real time |
| --- | --- | --- |
| `npm run validate` | 1,936 tests passed in 491 files. Runtime check, typecheck, lint, and builds passed. | 70.89 s |
| Affected Chromium and WebKit specs | 14 tests discovered across the transaction browsing and receipts specs. The application built, but the sandbox denied the preview bind on `127.0.0.1:4173` before any browser tests ran. | 4.10 s |
| Required quick selection | 31 tests discovered in 20 files. Selection, projects, timeouts, and retries are unchanged. | Discovery only |

This validates the provisional branch. Run these gates again after importing Phase 9 and adding T122.
