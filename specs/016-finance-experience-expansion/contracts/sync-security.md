# Finance Security, Sync and Compatibility Contract

## Capability negotiation and generic-route bypass prevention

Current Finance uses sync v7 and HTTP financeContractVersion 1. Plan the next additive capability as sync v8/Finance contract v2; confirm available version numbers against concurrent work before implementation. Preserve existing v4–v7 task/list/journal behavior. Old clients without the Finance gate capability MUST NOT receive new protected Finance payloads when Require PIN is enabled. They receive an upgrade/locked capability result without losing non-Finance sync. Do not implement a UI lock while leaving old generic routes open.

Finance-aware commands/queries carry an opaque grant when protection is enabled. The same gate wraps `/finance`, finance entities in generic `/sync` pull/push/restore, transaction-derived search projections, task link decoration, generic attachment routes with finance parents, and Finance-only exports (which stay disallowed). Background provider ingestion remains authorized as a server integration job, not an interactive unlock; it may write but cannot return financial content to a locked client.

General and Finance continuation state are separate logical cursors per audience. A general pull while locked may synchronize tasks/catalog identities and revocations; it must not acknowledge protected Finance events as delivered. Existing shared-feed cursors require a migration to independent per-lane delivery checkpoints (same storage service/feed infrastructure, new contract bookkeeping), or a dedicated Finance pull wrapper with its own persisted cursor. Choose the wrapper plus explicit Finance lane checkpoints; never filter Finance events then advance their checkpoint with the general cursor. Replayed event IDs are idempotent.

## Audiences

| Data | Eligible recipients |
| --- | --- |
| Global category/merchant identity | Existing active-user catalog audience; no usage/flags/receipts |
| Dashboard flags/settings | Owner only |
| Security requirePin/enrolled/revision | Owner-only auth response; verifier/grants never ordinary sync |
| Transaction/receipt | Existing account scope and current authorization; Finance grant required to hydrate |
| Upcoming Expense | Intersection of group membership, budget rights and account authorization |
| Finance task link projection | Intersection of task visibility and target financial rights |
| Receipt byte cache / local pending receipt | Current user/device only, device-key encrypted |

Where the canonical entity uses a group plus private account, calculate eligible user projections from referenced permissions. Publish revoke/tombstone events when membership or account assignment changes. Neither task existence nor a private account ID can leak in a broadly shared relationship event. Use the existing revocation machinery and extend its dependency graph; do not rely solely on UI hiding. Source access is rechecked on HTTP reads even before an asynchronous projection purge completes. Refund relationships and contribution slices require access to the refund and original association; publish recipient-filtered projections and revoke them when either source becomes inaccessible, without leaking original IDs or hidden counts.

## Commands and ordering

New semantic outbox operations cover upcoming create/edit/cancel/reopen; fulfillment link/unlink; refund link/correct/unlink; user flags/count; task-target link/unlink/create-with-link; receipt selection metadata and upload orchestration. Receipt bytes stay in encrypted local blob storage and S3, never in DynamoDB/feed records or normal sync request bodies. PIN/password/grants are never queued, logged, or exported. Upcoming create commands retain immutable original entryContext (enteredAt/localDate/timeZone); server acceptance time and later date-change contexts are separate. Retry and delayed synchronization never replace dueDate or original context with reconnect time; only current access/relationship/version conflicts may block an otherwise valid delayed entry. Refund proposals preserve confirmed allocation/source revisions and remain pending until capacity validation succeeds.

Order parent dependencies before children: membership and revocations → account/catalog/budget → transaction/upcoming expense → allocations/refund relationships/fulfillment/receipt metadata → task links. Ordinary task creation may precede link acknowledgement, but user-visible `linkPending` records exactly what remains. General task sync must preserve that state without exposing financial target metadata to other task viewers.

On reconnect: fetch current session/security metadata and revocations first; invalidate stale local unlock material; revalidate allowed target references; replay supported pending commands only after required online unlock. Preserve input for permission failures and show a safe resolution. Do not silently discard an offline user edit or claim success after access was revoked. Security management, provider refresh/reconciliation decisions and final budget reconciliation remain online-only. Local fulfillment linking may be queued as a proposal, but paid status is not final until transaction state and claim capacity are accepted online.

## Conflict and retry rules

All writes include stable mutation identity and expected versions. Duplicate task-target pair resolves to the existing relationship only if still authorized. Fulfillment and refund credit/original-allocation capacity conflicts are semantic conflicts requiring review, never last-writer-wins. Budget activity is independent of closure/reconciliation: active on ordinary creation, versioned deactivate/reactivate commands retain historical links/flags. Current inactive-budget rejection applies to new/reassigned associations, not review/reschedule/fulfillment of an unchanged linked expense. New dates are validated against their original captured calendar context, never later reconnect today. Check-number/payment-type user edits survive provider source updates. Category reparenting and account/group/budget changes cannot silently alter historical classifications or obligation scope. Concurrent personal flags use expected version or a documented per-field deterministic merge with visible conflicts; shared records never store a personal flag.

Grant/authentication failure is not a financial-data conflict: retain queued intent, pause protected replay and request unlock. Failed file transfer reuses upload/receipt identity; same checksum/version reuse is explicit. Receipt availability requires both clean verdicts on the exact object version; an older clean verdict cannot approve an overwritten version.

## Local lock lifecycle

Central Finance access controller gates `financeDeviceKey` consumers, `decryptFinanceRecord`, search workers, task decorators, report projections and cached receipt reads. On leaving the protected page/embedded view, explicit lock, expiry, signout, password reset/security revision event: remove token, abort network/worker requests, clear in-memory plaintext/indexes and Blob URLs, and show non-sensitive placeholders. Browser history/bfcache restoration runs the guard before displaying Finance. A per-tab nonce prevents one tab silently inheriting another tab's visit token.

Offline verifier permits only this app's local gate and follows persistent delay policy. It does not create a valid online token. A stale disconnected device cannot learn remote changes until reconnect; already authorized downloaded files cannot be recalled. These limits must be explained accurately in the user/operations documentation without claiming Journal encryption properties.

## Retention and recovery

Use existing Finance archive/tombstone/reference policy, S3 versioning and backup paths. Never purge receipts because a linked task completed. Cancelled expenses and removed links retain their history; active expense/canonical transaction references protect retained receipt versions. Orphan incomplete uploads follow bounded cleanup only after reference checks. A restore revalidates source graph/claim ledgers/file hashes and scan-policy results and revokes all restored visit grants. RPO/RTO and actual S3 byte recovery evidence are recorded before release.

## Required negative contract scenarios

1. Old client or generic sync tries to read protected Finance without the new capability/grant.
2. Admin or forged targetUserId tries to alter another user's PIN setting.
3. Password reset advances epoch while PIN hash/requirement remains unchanged.
4. A fifth failed PIN produces at least 30 seconds of delay online/offline.
5. A shared task viewer lacks the personal account used by an expense's group budget.
6. Receipt GET/metadata/retry through generic attachment routes attempts to bypass Finance.
7. Range 2 arrives after lock/revocation or after object version/ETag changes.
8. Local pending transaction/expense/receipt remains after forgotten-PIN replacement.
9. Membership tombstone and pending mutation arrive together; no temporary plaintext display.
10. Provider reconciliation changes observation identity but retains task/receipt/fulfillment/refund references.
11. A future-dated offline entry reconnects after dueDate or in another zone; original date/context survives and the unpaid record becomes overdue.
12. Budget deactivation blocks a new/reassigned association but permits the existing expense to be rescheduled/fulfilled; reactivation leaves separate closure intact.
13. Two refunds contend for the same original allocation principal, or a provider correction invalidates prior refund capacity; no duplicate/obsolete exact spending is published.
