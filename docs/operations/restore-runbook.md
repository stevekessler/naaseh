# Archive and Deletion Restore Runbook

Restore into an isolated environment. Keep application traffic disabled. Validate backup age and
the existing 35-day locked-backup boundary, restore DynamoDB/S3 data, then load the current
DeletionLedger from the protected operational source. Apply every ledger entry to current records,
children, revisions, CompletionEvents, projections, feeds, search/cache material, and exact S3
versions. A failed or unavailable ledger application is a hard stop.

Run the Category/General-Project migration in resume mode, migration reconciliation, workload
projection reconciliation with drift repair, CompletionEvent counted/reversal validation,
attachment reference/object-version reconciliation, authorization boundary tests, and search
rebuild. Inject one known projection discrepancy and one missing attachment in the isolated drill;
verify detection, safe repair/failure, and alarms. Confirm deleted identifiers remain unavailable
before enabling access. Record recovery point, ledger high-water mark, checkpoint results, alarm
evidence, mismatches, repairs, and final authorization approval without protected content.
