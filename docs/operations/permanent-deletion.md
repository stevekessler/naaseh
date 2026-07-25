# Permanent Deletion Operations

Work deletion is online-only and uses an authoritative preview, short-lived confirmation token,
idempotency receipt, and checkpointed Step Functions job. Operators may retry the same job from its
durable checkpoint. Do not create a new job for the same receipt. Confirm that revisions, children,
CompletionEvents, projections, feeds, search/cache records, attachments, and current records are
removed before marking completion. Attachment reconciliation must release exact object versions
and retry partial S3 failures idempotently.

Categories and Projects delete synchronously only when strong reference checks report no children,
work, archive history, CompletionEvents, projections, or pending jobs. The entity and scoped name
reservation are removed atomically. Blocked previews are expected and are not partial deletions.

Locked backups remain infrastructure recovery material for 35 days, not a user recycle bin. Every
completed deletion writes a content-free DeletionLedger fact. Any restore must apply that ledger and
re-purge deleted content before traffic is enabled; a missing or failed ledger gate blocks restore.
