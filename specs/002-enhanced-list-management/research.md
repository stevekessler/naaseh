# Research: Enhanced List Management

## 1. Existing Application Architecture

**Decision**: Extend the current TypeScript 5.8/React 19.1 local-first PWA, Node.js 24 Lambda
API, shared Zod domain/contracts, one on-demand DynamoDB table, encrypted Dexie/IndexedDB
cache, and consolidated AWS CDK stack. Keep Python only for the requested operator export.

**Rationale**: The repository already implements versioned tasks, an encrypted outbox,
authorized change feeds, local MiniSearch, KMS-encrypted S3 media, backup/restore tests, and
IAM-authorized Python administration. Reuse minimizes migration and operating risk.

**Alternatives considered**: A separate lists application, database, or search service would
duplicate identity, sync, authorization, backup, and observability without a present need.

## 2. List Aggregate and Ordering

**Decision**: Model List and ListItem separately from Task/Subtask and version every record.
Use an opaque lexicographically sortable order key with item ID as a deterministic tie-breaker.
Archive records and emit tombstones instead of immediate hard deletion.

**Rationale**: Lightweight list entries must not inherit reminders, assignment, task export,
or task-tree behavior. Separate item records avoid DynamoDB's item-size limit, reduce conflict
scope, and make a one-item reorder a one-record mutation.

**Alternatives considered**: Subtasks pollute task semantics. An embedded item array creates
whole-list contention and size limits. Consecutive integer positions require broad rewrites;
binary floating positions eventually lose precision.

## 3. Global Directory Links and Overrides

**Decision**: Keep GlobalDirectoryItem independently versioned and writable by every active
user. A linked list item stores the directory ID, last synchronized snapshot/version, optional
name override, and tri-state value override. Effective fields use override, otherwise current
directory value, otherwise archived snapshot. Reset clears both overrides semantically.

**Rationale**: Tri-state values distinguish inheritance, explicit “no value,” and a signed
override. Derivation avoids fan-out writes when a global entry changes and snapshots preserve
meaning if it is archived. An offline reset adopts the current global value at server
acceptance rather than stale client text.

**Alternatives considered**: Copy-only global items cannot follow edits or reset. Updating
every linked item on a directory edit is expensive and can exceed transaction limits.

## 4. Money and Totals

**Decision**: Store values as signed integer minor units in one deployment ISO currency.
Negative means cost, positive means explicit credit, null means absent, and zero remains a
real value. Derive totals from effective values, including completed items.

**Rationale**: Integer arithmetic avoids binary floating rounding and persisted-total drift.
The UI can default an entered magnitude to negative while making positive mode explicit.

**Alternatives considered**: Floating-point amounts are unsafe for exact totals. Decimal
strings add parsing ambiguity. Persisted aggregate totals drift when directory values change.

## 5. Authorization and Administrator Oversight

**Decision**: Centralize role-aware parent policies. Owners always read their content;
locked list/private task reads allow owner/admin; group-list reads allow owner/current
member/admin; unlocked ungrouped lists allow all active users. Only owners mutate lists/tasks.
Every active user may mutate directory entries with optimistic concurrency. Administrator
ordinary-content reads are audited and do not grant edits. Hidden-memo plaintext still
requires existing unlock/decryption.

**Rationale**: One policy prevents API, sync, search, attachment, direct-ID, and cache behavior
from drifting. Parent-first item/attachment authorization prevents guessed-child-ID access.

**Alternatives considered**: Fetch-then-filter can leak existence and wastes capacity. A new
task lock bit duplicates existing private visibility state. Admin mutation rights were not
requested.

## 6. Synchronization, Feeds, and Conflict Rules

**Decision**: Generalize sync entities and encrypted pull storage. Use public, owner, group,
and sharded administrator audiences. Visibility changes atomically write necessary upserts
and tombstones. Membership revocation sends a control event that purges group data, search
documents, temporary capabilities, and unauthorized pending changes before further display
or push.

Version each entity independently. Merge disjoint fields; return conflicts for overlapping
fields, archive-versus-update, and same-item reorder. Completion and reset are semantic,
idempotent operations. Hidden copy destinations remain unpublished until complete.

**Rationale**: This extends the proven mutation-ID/version/cursor design without silent
last-write-wins. Separate items keep unrelated edits independent.

**Alternatives considered**: One feed for every user creates large fan-out. A global feed
followed by client filtering leaks metadata. Last-write-wins violates the constitution.

## 7. Local Search

**Decision**: Keep MiniSearch over the fully synchronized authorized working set. Index task,
list-header, and effective list-item documents. The Lists filter searches header/item docs,
groups item hits by parent, and returns one list with match context. All remains the default.
Directory entries are not directly searchable in the main search.

**Rationale**: The 50,000-document scope fits the measured local-search model and preserves
offline operation. Authorization tombstones remove documents before new counts/results appear.

**Alternatives considered**: OpenSearch introduces ongoing cost and a new protected index.
Server scans cannot provide responsive fuzzy full-text search or offline behavior.

## 8. Attachment Storage and Encryption

**Decision**: Reuse the existing private, versioned, AWS Backup-protected Media bucket under
opaque `attachments/{blobId}` keys. Require HTTPS, block public access, SSE-KMS with the
existing data key, S3 Bucket Keys, exact object version IDs, and checksums. Do not put file
names, users, or parents in keys.

**Rationale**: Prefix-scoped IAM/lifecycle/malware controls provide adequate isolation while
reusing the deployed bucket, KMS key, backup selection, and restore tests. Bucket Keys reduce
KMS request cost.

**Alternatives considered**: A separate bucket/key adds policy and recovery surfaces.
Browser-side encryption prevents managed malware inspection and requires a new group/admin
key-sharing scheme. AWS documents S3 Bucket Keys and KMS behavior at
https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html.

## 9. Attachment Transfer and Malware Gating

**Decision**: Use initiate, direct upload, complete, status, download, and delete operations.
Initiation authorizes the parent and returns a five-minute checksum/header-bound upload
capability. Completion verifies key, exact version, size, checksum, encryption, and metadata,
then enters scanning. GuardDuty Malware Protection scoped to the attachment prefix sets scan
status; only exact versions tagged clean become available. Downloads re-authorize the current
parent and return a 60-second version-specific capability with download disposition.

Initial policy is 25 MiB, at most 10 attachments per parent, and an allowlist of images, PDF,
plain text/CSV/JSON, and non-macro Office documents. Empty, executable, script, archive,
signature/MIME mismatch, oversized, and threat-positive files fail closed.

**Rationale**: Direct transfer avoids API/Lambda payload and data-transfer cost. Scan status
and S3 tag policy provide defense in depth. Capabilities remain bounded and cannot be used to
discover other objects.

**Alternatives considered**: Lambda byte proxying adds cost and limits. Self-managed ClamAV
requires signature and runtime operations. GuardDuty supports SSE-KMS and result tagging:
https://docs.aws.amazon.com/guardduty/latest/ug/supported-s3-features-malware-protection-s3.html
and https://docs.aws.amazon.com/guardduty/latest/ug/how-malware-protection-for-s3-gdu-works.html.
S3 presigned requests support checksums:
https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html.

## 10. Attachment Copies, Offline Behavior, and Reconciliation

**Decision**: Separate one-parent Attachment metadata from immutable AttachmentBlob and
BlobReference records. Authorized list copy creates new attachment/reference rows to already
clean exact blob versions, but blob knowledge grants no access. Delete metadata/reference
first, then delete-mark a zero-reference blob; retain noncurrent versions through the recovery
window. A scheduled idempotent reconciler expires stale uploads, handles stalled scans,
removes zero-reference/unexpected blobs, and alarms on missing-object metadata.

Keep only encrypted attachment metadata offline. Never Cache-API-store attachment responses.
Offline selection is deferred and asks for reselection after reconnection; downloads require
connectivity.

**Rationale**: Logical reuse makes copied attachments independent without duplicating bytes,
KMS requests, scans, and backups. Avoiding browser byte persistence prevents quota loss and
protected residue, especially on Safari.

**Alternatives considered**: Physical copies jeopardize the 10-second list-copy target.
Global content-addressed deduplication creates cross-user existence side channels. Persistent
offline file queues are not reliably durable across supported browsers.

## 11. Completion Feedback and Accessibility

**Decision**: Add one shared completion-feedback hook/service for post-its, task rows, and
list rows. Trigger a bundled, cached scrunch asset synchronously from the user's post-it
completion activation before awaiting persistence; playback rejection is nonblocking. Persist
a default-on authenticated-user sound preference. Animate a 250–400 ms left-to-right strike
only on open-to-completed, preserve focus, use a polite live region, and make reduced-motion
final state immediate. Reduced motion and audio preferences remain independent.

**Rationale**: Browser audio activation may expire after an asynchronous save. One service
prevents different views from drifting and keeps persistence authoritative.

**Alternatives considered**: Remote audio fails offline. Audio-only feedback is inaccessible.
Animation-end-driven persistence fails under interruption/reduced motion. Browser guidance:
https://developer.chrome.com/blog/web-audio-autoplay,
https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/, and
https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html.

## 12. CSV Export Workflow

**Decision**: Add `scripts/export_todos.py`, an IAM-authorized thin client invoking a
dedicated coordinator. The coordinator starts/polls/acknowledges a Step Functions workflow:
create an exact DynamoDB point-in-time export in an isolated KMS-encrypted workflow-only S3
prefix, transform only current Task/Subtask and attachment metadata into fixed RFC 4180 UTF-8
CSV, verify row count/length/SHA-256, publish a short-lived result, and promptly delete raw
staging. The command downloads to a mode-0600 sibling temporary file, validates it, fsyncs,
and atomically renames; it never prints CSV or URLs.

**Rationale**: Exact snapshot semantics and results larger than Lambda's response limit require
an asynchronous bounded workflow. The command never receives database or durable S3 access.
A fixed contract makes “all fields” testable.

**Alternatives considered**: A projection-limited strongly consistent scan is safer and
cheaper but not globally snapshot-consistent across pages. Whole-table export temporarily
stages unrelated protected rows, so it is accepted only with a dedicated KMS key/prefix,
workflow-only IAM, Block Public Access, no human read role, sub-24-hour lifecycle, prompt
deletion, CloudTrail, and alarms. A second task-only table would add permanent duplicated
storage and write complexity.

## 13. Backup, Restore, Observability, and Cost

**Decision**: Extend DynamoDB PITR/manifests and the existing media AWS Backup selection to
list and attachment counts, exact object versions/checksums/tags, blob-reference integrity,
and access probes. Restore into isolation and reconcile before exposure. Keep 30-day ordinary
logs and 90-day audit logs with strict allowlists.

**Rationale**: S3 versioning and AWS Backup can restore object versions and tags, while
referential validation catches mismatched recovery points. AWS requires versioning for S3
Backup: https://docs.aws.amazon.com/aws-backup/latest/devguide/s3-backups.html.

**Alternatives considered**: S3 versioning alone does not provide the existing locked,
centrally tested recovery posture. A duplicate live Region remains outside the baseline.

## 14. Verification Strategy

**Decision**: Cover domain invariants, authorization matrices, idempotency, conflict and
revocation purges, attachment threat/failure/recovery, CSV schema and atomic output, mixed
search performance, and complete Chromium/WebKit responsive/offline/accessibility journeys.
Mock playback timing in automation and manually verify audibility on real Safari/iOS.

**Rationale**: The highest risks span multiple boundaries and cannot be covered by UI tests
alone. Headless tests can prove attempted gesture-safe playback but not physical audible output.

**Alternatives considered**: Unit-only testing misses IAM/S3/feed/cache behavior. Automated
audibility assertions are unreliable on muted/headless devices.

