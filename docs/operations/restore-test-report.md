# Isolated restore test report

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
