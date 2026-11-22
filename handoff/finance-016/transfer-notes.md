# Finance transfer — November 22, 2026

This directory supersedes the older two-computer transfer README for starting new work. Read `second-computer-prompt.md` first.

## Scope and decisions

- Finance source starts at integrated checkpoint `5211631161623afc80e1d8618609ed179890d552`, with 132/166 tasks checked.
- Existing first-computer source/test/doc edits were checkpointed verbatim at `5a2ed6a10193f56ecbbfa2a1bc9ea116d1797c1b` and saved in `first-computer-full-checkpoint.bundle`.
- A comparison against `131e515f` found that the extra local edits belong to ordinary session/task sync plus the existing Apple Personal Team identifier. They are preserved in separate patches rather than introduced into the Finance source. This preserves Steve's requirement to release sync independently.
- All nine original untracked files in `handoff/` and `outputs/` are preserved, plus the new checkpoint bundle, patches and transfer documentation.
- Other local Finance worktrees (budget-management, account-access and release-verification) were clean when inspected. Other project workstreams were not merged into Finance.
- The sender cannot inspect unsaved/uncommitted files physically present only on the second computer. The continuation prompt requires preserving any such changes before integration.
- Remote branches discovered additional spend-report, forecast, import-redaction and receipt-recovery work. Their exact refs are recorded in the prompt. They are already published but are not automatically applied to this integrated snapshot.

## Publication method

The source checkout's Git metadata is read-only to this session, shell GitHub access fails DNS resolution, and the connected GitHub service rejects write requests with HTTP 403. The original checkout is left untouched. A scratch Git checkout preserves and commits the complete continuation state, including source, outputs, patches, detailed prompt and SHA-256 manifest.

The signed-in GitHub browser uploads a complete Git bundle plus root entrypoint to new branch `codex/finance-transfer-20261122`, based on existing published `3b5a7b58`. This remote branch is an **artifact transport branch**: its application files are older. Follow root `FINANCE_HANDOFF_20261122.md` to import the bundle's `codex/finance-transfer-20261122` ref into a distinct local continuation branch/worktree. That imported ref is the correct integrated source. Its exact SHA and bundle SHA-256 are recorded in the root entrypoint.

All changes are recoverable through GitHub without copying files between computers. No remote branch is overwritten, main is untouched, and no PR or production release is created. Bundle integrity, per-file SHA-256 and source parity are verified locally; the uploaded bundle is verified against the GitHub blob hash after publication.

## Validation limits

Finance application files are unchanged from `52116311`. Latest historical required validation: 2,021 passing tests in 507 files in 65.57 seconds. This transfer does not claim a new runtime/browser/hosted/AWS pass. The sender shell has Node 20 by default, not the required Node 24. Bundle verification and file/tree integrity are the transfer checks.

T018 live storage/hosted/cost acceptance, dashboard/trend acceptance gaps, remaining reports/forecasts integration and final release gates remain open. Migration and production were not touched.
