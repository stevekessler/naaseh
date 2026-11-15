# Na’aseh Finance 016 handoff

The bundle preserves three commits after the shared base `c4c4978`. Commit `0855a36` completes Phase 9 Upcoming Expenses (T082–T093). Tip `d9bc35b` adds the Phase 11 task and expense relationship checkpoint. The checkpoint has 94 of 166 tasks checked.

From your existing checkout, fetch and import the bundle into a local handoff branch. This keeps your current checkout in place.

```sh
git fetch origin codex/task-item-creation-uploads
git fetch origin codex/finance-016-handoff
mkdir -p handoff/finance-016
git show FETCH_HEAD:handoff/finance-016/naaseh-finance-016.bundle > handoff/finance-016/naaseh-finance-016.bundle
git bundle verify handoff/finance-016/naaseh-finance-016.bundle
git fetch ./handoff/finance-016/naaseh-finance-016.bundle refs/heads/codex/finance-016-upcoming-expenses:refs/heads/handoff/finance-016-nov15
git log --oneline c4c4978..handoff/finance-016-nov15
```

The log should show `d9bc35b` at the top. Read the latest checkpoint with `git show handoff/finance-016-nov15:docs/operations/finance-016-handoff.md`. Verify the receiving computer’s Phase 8, Phase 10, and T122 commits before combining work on a dedicated Finance branch.

Keep the migration unrun and the $6.50 combined AWS ceiling. Real DynamoDB and hosted acceptance remain open. Leave production and main untouched.
