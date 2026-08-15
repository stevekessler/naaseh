# Isolated restore test report

## Feature 009 local recovery drill — 2026-08-14

The local recovery suites exercise the full-restore validator and workflow scaffolding plus feature-specific invariants for authentication factors, timer current/revision/receipt/feed state, task memo/date/color records, Extra Low removal guard, personal ranks, completion exports, archive/reporting, attachments, permanent-deletion ledgers, signed manifests, and recovery-key selection. Malformed ownership, duplicate current timer aggregates, revision versions beyond current, missing receipts, nonzero `extra_low`, invalid factor state, bad manifest signatures, wrong Region/resource identity, and incomplete export results fail closed.

The recovery workflow infrastructure retains isolated names, read-only validation, bounded four-hour RTO enforcement, safe failure reporting, and deletion of temporary restored resources. Administrator factors restored from backup are normalized to `recovery_required`; the workflow does not reopen administrator access with a restored seed. No production data or credentials were used.

Local drill result: **PASS** — 14 files and 55 tests passed in 10.19 seconds using the focused restore, crypto-recovery, migration-registry, recovery-stack, and restore-workflow command. This validates code and synthesized workflow behavior only.

No production or sandbox restore has been executed yet. T172 remains open until this report is
completed from an actual AWS Backup Restore Testing run.

## Required evidence

- Restore testing plan ARN and restore job IDs (DynamoDB and S3)
- Selected recovery-point timestamps and achieved RPO
- Job creation/completion timestamps and achieved RTO
- AWS Backup validation and deletion status for every restored resource
- Signed manifest verification and exact entity-count comparison
- Private-task authorization negative results
- Every retained recovery key generation and representative hidden-memo decrypt result
- Retained Secrets Manager versions and every referenced `us-west-2` KMS key availability check
- CloudWatch execution/log/alarm links containing no task, memo, credential, or key material
- Operator, date, discrepancies, remediation, and final pass/fail decision

Local tests prove event filtering, restore-job identity checks, isolation-name enforcement,
read-only DynamoDB/S3 probes, four-hour RTO rejection, safe failure reporting, and infrastructure
synthesis. They are not substitutes for the evidence above.

The current template and local tests prove the selected recovery point and all temporary resource
ARNs must be in `us-west-2`, exactly one recovery authority is accepted for each retained version,
and an invalid/missing 32-byte DEK fails closed. A completed report must explicitly acknowledge
that total Region loss is outside v1 scope; there is no cross-Region copy to exercise.
