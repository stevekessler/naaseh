# Start here — November 22 transfer

Use [second-computer-prompt.md](second-computer-prompt.md) and
[transfer-notes.md](transfer-notes.md) on branch
`codex/finance-transfer-20261122`. The older transfer directions below are
historical. Verify received files with `python3 handoff/finance-016/verify-transfer.py`.

---

# Na’aseh Finance 016 handoff

The bundle preserves three exact commits after the shared GitHub base `c4c4978` on
`codex/task-item-creation-uploads`. Commit `0855a36` completes Phase 9 Upcoming
Expenses (T082–T093). Tip `d9bc35b` adds the Phase 11 task and expense relationship
checkpoint. The checkpoint has 94 of 166 tasks checked.

From the root of an existing checkout, fetch the sharing branch and extract the
bundle into the repository. This keeps the current checkout in place.

```sh
git fetch origin codex/task-item-creation-uploads
git fetch origin codex/finance-016-handoff
mkdir -p handoff/finance-016
git show FETCH_HEAD:handoff/finance-016/naaseh-finance-016.bundle \
  > handoff/finance-016/naaseh-finance-016.bundle
git bundle verify handoff/finance-016/naaseh-finance-016.bundle
git fetch ./handoff/finance-016/naaseh-finance-016.bundle \
  refs/heads/codex/finance-016-upcoming-expenses:refs/heads/handoff/finance-016-nov15
git log --oneline c4c4978..handoff/finance-016-nov15
```

The log should show `d9bc35b` at the top. Read the latest checkpoint with
`git show handoff/finance-016-nov15:docs/operations/finance-016-handoff.md`.
Confirm the receiving computer's Phase 8, Phase 10 and T122 branches before
combining work on a dedicated Finance integration branch.

Keep the migration unrun and preserve the $6.50 combined AWS cost ceiling.
Real DynamoDB and hosted acceptance remain open. Leave production and main untouched.
