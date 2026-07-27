# Recovery runbook

Na'aseh v1 is deployed only in `us-west-2`. Restore DynamoDB and profile media only into AWS
Backup's temporary same-Region resources, verify the locked recovery point and signed manifest,
then run record-count, authorization, retained-key, hidden-memo decrypt, RPO, and RTO checks.
Never restore over production. Confirm AWS Backup cleans up the temporary resources.

Before any restored table can serve traffic, cancel every restored Google synchronization operation
in `pending`, `retry`, or `running` state. Remove every restored Google refresh-token ciphertext and
transition each restored connection to `reauthRequired`; users must complete OAuth again. The restore
validator reports both counts and `safeToExpose=false` until these steps are complete. Never replay a
restored provider operation or reuse a restored OAuth token, because either could overwrite Google
changes made after the recovery point.

The five-minute RPO and four-hour RTO apply to recoverable incidents within `us-west-2`. Total
Region loss is outside v1 scope because there is no secondary architecture or cross-Region backup.
Logs and reports contain identifiers, counts, timings, and outcomes only—never passwords, PINs,
sessions, task/memo content, ciphertext, or key material. Retain every referenced KMS key and
Secrets Manager version until its recovery points expire and a subsequent restore test passes.
