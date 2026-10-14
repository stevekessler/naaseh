# Quickstart: Journal Recycle Bin Validation

## Prerequisites

- Node.js 24.x and repository dependencies installed.
- A browser with IndexedDB support.
- Local API/test fixtures; production AWS access is not required for normal validation.

## Focused automated checks

Run the smallest affected suites during implementation, then the repository validation gates:

```bash
npm test -- packages/domain/test apps/web/test/sync apps/web/test/db apps/api/test/journal
npm test -- tests/contract tests/integration tests/security tests/restore tests/performance
npm run typecheck
npm run lint
npm run build
```

Before adding any test to the required quick browser suite, record its discovered test count and
baseline wall time with:

```bash
/usr/bin/time -p npm run test:e2e:quick
```

After the change, record the new count and time with the same command. Keep expected hosted PR
validation under ten minutes. Run exhaustive browser/device coverage outside the required gate:

```bash
npm run test:e2e
npm run validate:pre-aws:browsers
```

## Manual data-safety journey

1. Unlock Journal and create an entry on an unused date.
2. Go offline, move it to the recycle bin, and verify pending state appears immediately.
3. Verify active list, dashboard, streaks, and date browse exclude it while its date remains
   reserved.
4. Reconnect and wait for acknowledged sync. On a second browser profile, bootstrap/pull and
   confirm the entry appears only in the recycle bin.
5. Restore offline, reconnect, and verify the original UUID, date, body, and structured values.
6. Force a version conflict from two profiles and verify both ciphertext versions and the local
   lifecycle intent remain reviewable.
7. Recycle again. Confirm permanent deletion is disabled offline, then reconnect, preview, type
   the entry-specific confirmation, and wait for verified completion.
8. Bring a stale profile online. Confirm the tombstone purges its local row/outbox/conflicts and
   that replay receives `hard_deleted` rather than recreating the entry.

## Restore and observability checks

- Restore a recovery point from before the hard deletion into an isolated table.
- Apply the current protected deletion ledger remediation.
- Confirm the deleted UUID has no entry row, date reservation, or ciphertext feed copy before
  traffic enablement.
- Inspect structured lifecycle/deletion logs and alarms. Confirm they contain correlation,
  stage, outcome, safe code, duration bucket, and counts only—never Journal plaintext,
  ciphertext, dates/date tokens, keys, entry identifiers, credentials, or confirmation tokens.
