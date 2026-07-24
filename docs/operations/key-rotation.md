# Cryptographic key and secret rotation runbook

Last reviewed: 2026-07-23

Rotation is additive. Never disable or delete a KMS key, secret version, signing verifier, or
recovery wrap while a retained record, manifest, or recovery point references it.

For hidden-memo recovery, create a new RSA-3072 encrypt/decrypt key in `us-west-2`, add its active
version to the signed public-key registry, and verify the browser accepts only the signed
`authority=recovery`, `region=us-west-2` entry. New records use exactly one wrap for the active
generation. Rewrap retained DEKs in bounded idempotent batches without decrypting memo plaintext,
then create a signed manifest and restore/decrypt every retained generation. Mark the prior key
decrypt-only and retain it through the lifetime of all referencing backups.

Rotate the manifest signing key by publishing verifier metadata before signing new manifests.
Keep all older verifiers available through their manifests' retention periods; never rewrite old
manifests. Rotate password pepper and Web Push secrets by creating a new Secrets Manager version,
deploying readers that understand both versions, switching writers, and retaining the old version
until no live verifier or backup references it.

Routine roles are denied `kms:DisableKey` and `kms:ScheduleKeyDeletion`. Policy and deletion
attempts generate alerts. Suspected compromise requires session revocation, content-free evidence,
clean replacement material, and a successful isolated restore before retirement. This is
same-Region recovery; rotation does not mitigate total `us-west-2` loss.
