# Final review: Bidirectional Google Tasks Sync

## Outcome

The scoped implementation is complete and all local release gates pass. Production enablement is
deliberately gated on live disposable Google/AWS acceptance because credentials and external side
effects were not available in this workspace.

## Security and data boundary

- Owner identity is taken from the authorizer, never request input. Mutation routes require
  same-origin CSRF validation and optimistic versions.
- OAuth uses full-page authorization, exact server-controlled redirects, state replay protection,
  PKCE, offline access, Tasks-only scope, KMS context-bound refresh tokens, and revocation on
  disconnect.
- Provider transport is strict and bounded. Refresh tokens and OAuth secrets are unavailable to the
  task-stream Lambda.
- Only title, due date, and completion state cross the provider boundary. Memos, hidden content,
  assignments, group/shared work, project/category data, and private tasks without per-task consent
  are excluded.
- Conflict values and last-known status are encrypted in IndexedDB. Logs/metrics permanently redact
  all protected fields, including resolved values.

## Data loss, replay, and convergence

- Deterministic operation IDs, conditional writes, a durable link base, exact Na'aseh markers,
  reverse links, overlap polling, and per-connection leases prevent duplicate provider effects.
- A lost create response is recovered by exact marker lookup. Imported lifecycle actions use the
  existing revision/completion transactions and provider-source attribution suppresses echo loops.
- Independent supported-field changes merge; divergent same-field changes become versioned owner
  conflicts. Google due dates never erase the Na'aseh wall-clock time/time zone.
- Google deletion archives locally. Disconnect and list cleanup can delete only links whose recorded
  origin is Na'aseh; no local task is permanently deleted.
- Manual sync now persists a queued run and returns immediately. A filtered DynamoDB stream invokes
  reconciliation asynchronously, so progress is available by run ID without API Gateway timeout.

## Failure, quota, and recovery

- Retryable failures use capped exponential jitter. One malformed item is quarantined with provider
  identity while the page continues; owner retry fetches that exact item again.
- Revoked credentials transition to `reauthRequired`. Throttle, lag, checkpoint-stall, failure,
  conflict, quarantine, and revocation signals have content-free metrics and alarms.
- Restore validation identifies credentials to invalidate and provider operations to cancel. A
  restored environment cannot safely serve traffic until fresh OAuth authorization is required.

## Cost and complexity

- The schedule is five minutes, task pages are bounded to 100, active connections are queried by
  index, and Lambda reserved concurrency is 3 for reconciliation and 2 for task ingestion.
- The owner-task GSI removes recurring full scans for current records; a compatibility scan remains
  for legacy rows during initial preview/publication until migration is complete.
- The stack synthesizes at 490 resources, close to CloudFormation's 500-resource limit. This feature
  fits, but the next infrastructure addition should split Google sync or another subsystem into a
  nested/separate stack. This warning is recorded as a production release review item.

## Documentation and remaining gate

The API contract, user guide, Google Cloud/operator runbook, recovery runbook, data model, research,
quickstart, and validation evidence agree on the implemented behavior. No placeholder or unresolved
spec ambiguity remains. The only open gate is live execution with an authorized disposable Google
account and deployed AWS environment; production rollout must not proceed until that evidence is
recorded in the validation results.
