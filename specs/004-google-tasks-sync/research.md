# Research: Bidirectional Google Tasks Sync

## 1. Google surface and supported fields

**Decision**: Integrate with Google Tasks v1, not Calendar events. Synchronize title, due date and
status. Keep Na'aseh memo, time-of-day, time zone, organization and collaboration fields local.

**Rationale**: Google Tasks are the task objects shown in Google Calendar. Google's current Tasks
resource explicitly records only the date portion of `due` and discards time. Na'aseh therefore
preserves existing time/time-zone when Google changes the date and applies a configured local default
time to imports.

**Alternatives considered**: Calendar events preserve times but are not Google Tasks and have
different completion semantics. Encoding time or memo into Google notes is lossy, exposes extra
content and creates surprising user-visible text.

## 2. Authorization and credential custody

**Decision**: Use server-side OAuth 2.0 authorization-code flow with offline access, the single
read/write Tasks scope, short-lived one-time state, and a full-page redirect. Store the OAuth client
secret in Secrets Manager and KMS-encrypt each refresh token in DynamoDB with owner/connection
encryption context. Do not request profile/email scopes.

**Rationale**: Scheduled synchronization requires refresh tokens when the user is absent. Official
Google guidance recommends server-side flow, offline access, CSRF state validation, encrypted token
storage, least scope and revocation handling. Avoiding identity scopes reduces consent and review
surface; the UI can identify the connection as the user's selected Google Tasks list.

**Alternatives considered**: Browser tokens cannot safely support background synchronization.
Service accounts do not own a consumer user's task list. Adding Google profile scopes is unnecessary.

## 3. Change discovery

**Decision**: Poll `tasks.list` every five minutes and on demand with `updatedMin`,
`showCompleted=true`, `showHidden=true`, `showDeleted=true`, 100-item pagination, and a five-minute
overlap from the last committed high-water time. Advance the checkpoint only after every page item
has committed, conflicted or been quarantined.

**Rationale**: Tasks v1 exposes list filtering and pagination but no task-change watch method. The
overlap tolerates timestamp boundary, delayed visibility and clock issues; idempotent mapping and
revision checks make repeats safe.

**Alternatives considered**: Full-list polling every run costs more and scales poorly. Browser-only
polling misses changes while the PWA is closed. EventBridge at 15 minutes is cheaper but violates the
10-minute detection outcome.

## 4. Local change discovery

**Decision**: Filter the existing DynamoDB stream for current task images and feed an isolated Lambda
that creates deterministic pending-operation records. The operation identity is derived from task ID
and version; provider-origin task changes record a source marker so the consumer can acknowledge,
rather than echo, the observed change.

**Rationale**: This keeps external work off the interactive task transaction while guaranteeing
eventual observation of every durable task mutation. DynamoDB Streams retries and deterministic keys
avoid lost work and duplicate operations.

**Alternatives considered**: Writing a provider operation after each task save creates a failure gap.
Scanning every local task each run adds large read cost. Expanding every task transaction would
tightly couple the core task manager to an optional provider.

## 5. Merge and conflict model

**Decision**: Store the last common supported-field snapshot. For each field, compare local and
remote to base: one-side change wins, equal changes converge, independent field changes merge, and
different same-field changes create an encrypted/protected conflict. Lifecycle transitions use the
existing completion/archive services with deterministic provider mutation IDs.

**Rationale**: Three-way, field-level merge prevents timestamp skew from deciding content and meets
the no-silent-overwrite rule. Existing lifecycle services preserve completion counting and revisions.

**Alternatives considered**: Last-write-wins silently loses edits and provider/local clocks are not
comparable. Always preferring Na'aseh breaks bidirectionality. Whole-record conflicts create needless
manual work for independent changes.

## 6. Create replay and linkage

**Decision**: Store one link per side and place a content-free `naaseh:<task-id>` marker in notes only
for Na'aseh-created Google Tasks. Before retrying an insert after an unknown outcome, scan the selected
list for that exact marker. Never use title/date heuristics.

**Rationale**: Google chooses task IDs, so a lost insert response otherwise risks a duplicate. The
marker reveals no title, memo, date or credential and is stable across retries.

**Alternatives considered**: Heuristic matching can link unrelated work. A local-only idempotency key
cannot prove whether Google accepted a timed-out insert. A random marker adds another secret mapping
without improving content privacy.

## 7. Remote deletion and disconnection

**Decision**: Remote deletion archives the linked Na'aseh task with provider attribution and retires
the link; it never hard-deletes locally. Disconnect requires a preview and choice to retain or delete
only remote tasks known to have originated in Na'aseh, then revokes the token best-effort, destroys
stored token ciphertext and retires mappings.

**Rationale**: Local data durability outranks symmetry for destructive effects. Origin and mapping
records provide a safe cleanup allowlist.

**Alternatives considered**: Mirrored hard deletion violates the constitution. Deleting the entire
Google list could remove unrelated/imported tasks. Retaining usable credentials after disconnect is
unnecessary risk.

## 8. AWS serverless and cost

**Decision**: Add a scheduled/on-demand reconciliation Lambda, a least-privilege stream-enqueue
Lambda, EventBridge schedule, one OAuth secret, KMS grants, CloudWatch metrics/alarms and reuse the
existing table, stream, API and data key.

**Rationale**: All work is bursty and bounded. Serverless components satisfy reliability and cost
requirements without always-on capacity. At 10 users, five-minute empty polling uses roughly 2,880
Google list calls/day before pagination, within the currently documented 50,000 daily courtesy quota.

**Alternatives considered**: ECS/EC2 workers add idle cost and operations. SQS could improve very
large fan-out but is unnecessary at the scoped 10-user scale; durable Dynamo operations already
provide replay and status. A later queue can be added if quota-aware batching requires it.
