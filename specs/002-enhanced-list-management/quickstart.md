# Quickstart: Enhanced List Management Validation

## Purpose

Run these scenarios after implementation to prove the feature specification, contracts,
constitution gates, and recovery boundaries. Detailed schemas are in [data-model.md](./data-model.md)
and [contracts/](./contracts/).

## Prerequisites

- Node.js 24.x and repository dependencies installed.
- Python 3.12+ with `scripts/requirements.txt` installed.
- A local or isolated `us-west-2` environment with test users: owner, ordinary non-member,
  group member, and administrator.
- Attachment media resources, GuardDuty test flow, export coordinator, and deployment outputs.
- Current Chrome and Safari/WebKit test support.

Run baseline local gates first:

```text
npm run check:runtime
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: all existing and new workspaces compile and all unit/contract/integration/security
tests pass without protected values in output.

## 1. Lists, Costs, Directory, and Offline Sync

1. As owner, create a three-item shopping list with one unvalued item, one default cost, and
   one explicit positive value.
2. Verify no list item appears as a task/subtask and the signed total includes completed items.
3. Reorder, complete, reopen, and remove items; reload and verify order/state.
4. Add an item to the global directory; add it to another list.
5. Override name and value, edit the global item as another active user, and verify only
   non-overridden linked fields follow.
6. Reset both overrides and verify the current global values and recomputed total.
7. Disconnect, perform list/item/directory changes, restart the browser, reconnect, and verify
   stable apply or an explicit conflict with no silent loss.
8. Create same-field and disjoint-field concurrent edits and verify conflict/merge rules.

Expected: exact minor-unit totals, durable revisions, idempotent replay, and no whole-list
conflict for different-item changes.

## 2. Visibility, Locking, Administrator Reads, and Revocation

1. Create global, group, and locked lists and a public/private task.
2. Verify the authorization matrix as owner, member, non-member, and administrator using
   browse, direct URL/API, search, copy, and attachment metadata paths.
3. Verify unauthorized direct access is non-disclosing.
4. Lock/unlock via icons and confirm accessible labels describe current state and action.
5. Remove a member while their group list is cached and has a pending local edit.
6. Synchronize and verify content/search/capabilities purge before cursor advancement and the
   unauthorized edit remains recoverable but is not uploaded.
7. Inspect audit output for safe administrator-read IDs/outcomes only.
8. Unlock a formerly group list and verify its preserved group scope returns.

Expected: zero unauthorized records, counts, snippets, filenames, or existence signals;
administrator reads work and are audited but mutation remains owner-only.

## 3. Copy and Search

1. Copy an accessible list containing directory links, overrides, completed items, ordering,
   and clean attachments.
2. Verify the copy is hidden until ready, owned by requester, unlocked/ungrouped, logically
   independent, and reuses bytes only through inaccessible blob references.
3. Modify/delete source and copy independently; verify attachments survive while referenced.
4. Seed mixed task/list/list-item matches and select All, Lists, and To-do Lists.
5. Verify All defaults on a new journey, list-item hits group under one list, and selector
   state persists while query text stays out of the URL.
6. Repeat authorized search offline, then process a lock/revocation tombstone.

Expected: correct type filtering in under one second p95 for the 50,000-document fixture and
no stale result after purge/reindex.

## 4. Completion Feedback and Accessibility

1. Complete a post-it with sound on; verify scrunch begins with crumple and state persists.
2. Mute sound and simulate rejected playback; verify completion still succeeds and announces.
3. Complete/reopen normal to-do and list items using pointer, Enter, and Space.
4. Verify left-to-right strike, persistent line-through, stable focus, and polite live text.
5. Repeat with reduced motion on Chrome/WebKit desktop, iPhone, and iPad viewports.
6. Complete once offline and synchronize later.
7. Manually verify audible timing, hardware mute, and installed PWA behavior on real Safari,
   iPhone, and iPad because headless output cannot establish audibility.

Expected: persistence never depends on animation/audio, reduced motion is immediate, and all
controls meet keyboard/touch/accessible-name requirements.

## 5. Encrypted Attachments

1. Upload one file of every allowed type and verify progress → scanning → available.
2. Inspect S3 configuration/object metadata: private, TLS-only, SSE-KMS, Bucket Key, opaque key,
   exact version, checksum, versioning, backup selection, and clean GuardDuty tag.
3. Verify parent authorization for global/group/locked/task/list-item attachments as owner,
   member, non-member, and administrator.
4. Test expired/replayed upload grants, checksum/size/type mismatch, empty/oversized/blocked
   types, threat finding, unsupported scan, access denied, duplicate/out-of-order scan events,
   interruption, retry, deletion, and zero-reference cleanup.
5. Confirm direct object guessing, unqualified-version reads, dirty objects, and stale parent
   access fail.
6. Go offline before selection and during transfer; verify clear defer/failure state and no
   uploaded claim. Confirm service-worker caches contain no file responses.
7. Run reconciliation fixtures for stale session, stalled scan, missing object, unexpected
   object, and copied/shared blob references.
8. Restore isolated DynamoDB and media backups; reconcile and verify sampled checksum, scan tag,
   reference counts, and every access class before exposure.

Expected: every available file round-trips byte-for-byte, every unauthorized/unclean access is
denied, and recovery reveals no silent metadata/object mismatch.

## 6. CSV Export

Set the deployed function output and run:

```text
python3 scripts/export_todos.py \
  --output /tmp/naaseh-todos.csv \
  --region us-west-2 \
  --function-name "$NAASEH_EXPORT_TODOS_FUNCTION"
```

Then validate with the standard CSV reader and contract fixture:

```text
python3 -m unittest discover -s scripts/tests -p 'test_*.py'
npm run test -- tests/contract tests/integration tests/security
```

Verify:

- one deterministic row per current task/subtask at the snapshot;
- fixed header and every field, Unicode/newline/quote fidelity;
- hidden memo plaintext absent, encrypted package retained;
- attachment metadata JSON present without bytes/blob/S3/capability data;
- destination mode 0600, matching length/hash/row count, atomic final name;
- denied principal produces no workflow/output;
- interrupted/mismatched download produces no final CSV;
- raw staging/result are private/KMS-encrypted, lifecycle-bounded, promptly deleted, and absent
  from logs.

Expected: exit 0 only after verified atomic finalization; documented nonzero exit otherwise.

## 7. Performance, Observability, Cost, and Final Review

Run:

```text
npm run test:performance
npm run test:e2e -- --project=chromium --project=webkit
npm run test:observability
npm run cdk:synth
npm run validate:pre-aws
```

In an isolated deployed environment, verify CloudWatch metrics/alarms for list conflict,
revocation purge, administrator read, attachment threat/scan stall/reconciliation, export
failure/denial, S3/KMS denial, backup, and restore failure. Confirm logs contain no protected
names, memos, filenames, queries, checksums, object keys, capabilities, CSV values, or secrets.

Record expected and measured incremental DynamoDB, S3, KMS, GuardDuty, backup, export,
Step Functions, Lambda, data-transfer, restore-test, and log costs. Re-check current
`us-west-2` pricing before release.

Finally review the complete diff for authorization, durability, error handling, comments,
documentation, browser behavior, unnecessary complexity, and all constitution gates.

