# Backup and recovery runbook

Last reviewed: 2026-07-23

## Scope and objectives

Na'aseh v1 runs only in `us-west-2`. DynamoDB PITR, daily AWS Backup recovery points,
compliance-mode Vault Lock, S3 object versions, KMS keys, and secret versions protect against
logical corruption and resource loss inside that Region. The recovery point objective is five
minutes and the recovery time objective is four hours.

This design does **not** provide service continuity or recovery after total loss of `us-west-2`.
There is no passive Region, global-table replica, cross-Region vault copy, replicated secret, or
recovery-account key. If that risk becomes unacceptable, multi-Region disaster recovery must be
designed and tested as a later feature; changing `NAASEH_AWS_REGION` is not failover.

## Normal protection

- One on-demand DynamoDB table has streams, TTL, PITR, deletion protection, and retained removal.
- AWS Backup creates daily recovery points in the same Region. Its local vault enters compliance
  mode after the three-day changeable window and retains points for at least 35 days.
- The private profile-media bucket uses KMS encryption, versioning, retention, and AWS Backup.
- Attachment objects share the protected media bucket under `attachments/`; manifests and restore
  probes must account for Attachment, AttachmentBlob, and BlobReference rows and exact S3 versions.
- The isolated export bucket is transient staging, not a backup source. Raw snapshots and verified
  CSV results expire after one day and are deleted earlier after successful acknowledgement.
- Runtime secret versions, the RSA-3072 recovery key, and the manifest-signing key are retained.
- Each hidden-memo key generation has exactly one signed-registry recovery wrap whose KMS key is
  in `us-west-2`.
- Signed manifests record `region`, recovery-point identity, entity counts, artifact hashes, and
  all retained key/wrap generations.

Treat backup, policy-change, or restore-test alarms as actionable. Evidence must contain only
identifiers, counts, timings, and outcomes—never credentials, task content, ciphertext, or keys.

## Isolated restore procedure

1. Confirm the quarterly AWS Backup Restore Testing plan is restricted to the production table,
   media bucket, same-Region vault, and four-hour validation window.
2. Select a locked `us-west-2` recovery point and verify its signed manifest. Stop if its Region,
   signature, recovery-point ARN, entity counts, or retained version inventory is inconsistent.
3. Let AWS Backup create its `awsbackup-restore-test` temporary resources. Never restore over the
   production table or bucket and never start a duplicate application-managed restore.
4. The validation workflow verifies the exact plan/job identity, same-Region ARNs, isolation
   prefix, completed status, and achieved RTO.
5. It reads the temporary resource, verifies the matching manifest, compares entity counts, and
   decrypts a representative 32-byte DEK for every retained recovery-key generation using only
   the approved `us-west-2` key.
6. Run authorization probes proving private records remain owner-only and disabled users cannot
   establish sessions. For attachments, run reconciliation before exposure, verify every reference
   points to the expected encrypted object version, and keep non-clean objects quarantined. Probe
   global, group, locked, owner, and administrator reads without recording content. Record achieved
   RPO/RTO and content-free discrepancies.
7. Confirm AWS Backup deletes the temporary resources after its validation window. A cleanup
   failure blocks completion of the exercise.

Routine application/deployment roles must not receive KMS decrypt, restore, or cleanup rights.
Do not disable a referenced KMS key or remove a referenced Secrets Manager version until every
dependent recovery point has expired and a later restore test succeeds.

Record real quarterly evidence in `docs/operations/restore-test-report.md`. Local tests and CDK
synthesis validate logic, but do not prove that AWS can restore production recovery points.
