# Recovery runbook

Na'aseh v1 is deployed only in `us-west-2`. Restore DynamoDB and profile media only into AWS
Backup's temporary same-Region resources, verify the locked recovery point and signed manifest,
then run record-count, authorization, retained-key, hidden-memo decrypt, RPO, and RTO checks.
Never restore over production. Confirm AWS Backup cleans up the temporary resources.

Google Tasks synchronization is retired. Old Google connection, link, sharing, or operation records
in a restored table are inert historical data and must never be replayed. Remove them only through a
separately reviewed, backup-aware cleanup migration; they are not a condition for exposing otherwise
validated Na'aseh records.

The five-minute RPO and four-hour RTO apply to recoverable incidents within `us-west-2`. Total
Region loss is outside v1 scope because there is no secondary architecture or cross-Region backup.
Logs and reports contain identifiers, counts, timings, and outcomes only—never passwords, PINs,
sessions, task/memo content, ciphertext, or key material. Retain every referenced KMS key and
Secrets Manager version until its recovery points expire and a subsequent restore test passes.
