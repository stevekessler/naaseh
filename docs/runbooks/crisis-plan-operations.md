# Crisis Plan operations runbook

## Broker or sharing-key failure

1. Confirm the owner plan remains readable and shared views show an online/unavailable state without cached content.
2. Inspect only bounded operation/outcome metrics, KMS CloudTrail events, throttles, and safe correlation IDs. Never request plan HTML, ciphertext, grants, wraps, public keys, search strings, or journal answers.
3. Validate the signed registry version/expiry and that only the dedicated broker role has sharing-key decrypt. Ordinary API, admin, recovery, reporting, export, and notification roles must have no decrypt permission.
4. Retry on-demand operations after the dependency recovers. Do not add always-on capacity or materially increase recurring AWS cost without measured evidence and explicit approval.

## Post-deployment KMS and revocation check

Use synthetic owner/recipient accounts and non-sensitive plan text. Share the plan, open it as the
recipient, and confirm CloudTrail records `Decrypt` by the dedicated broker role. Verify with IAM
policy simulation that ordinary API, administrator, recovery, reporting, export, and notification
roles receive `implicitDeny` or `explicitDeny` for `kms:Decrypt` on the sharing key. Then revoke the
recipient through the unlocked owner flow and confirm shared-list, direct-open, and broker requests
all fail. Confirm the remaining share generation, owner wrap, ciphertext, and grants committed
atomically. Record only role/key aliases, event IDs, outcomes, timestamps, and safe correlation
values—never plan content, ciphertext, grants, keys, identities, or request bodies.

The broker reads only the top-level `brokerActive` authorization projection on `USER#*` profiles.
Its IAM role cannot read the credential-bearing `data` map. Provisioning creates this projection,
administrator activation/deactivation updates it atomically, and the first share synchronizes it
for pre-feature users. Missing projections fail closed. Replay receipts use conditional DynamoDB
puts under `CRISIS_PLAN_BROKER_REQUEST#*` with the table TTL; a cold start must not permit reuse.

## Rotation-required state

Recipient self-removal immediately blocks broker delivery and marks the owner plan `rotation_required`. Owner edits and new shares remain blocked until the unlocked owner browser creates a new CPK, re-encrypts the plan, recreates remaining grants, and the conditional transaction succeeds. Failed attempts retain the old encrypted generation and pending intent; never claim revocation or rotation succeeded before the server receipt.

## Restore validation

Restore encrypted plans, owner wraps, shares, grants, mutation receipts, generations, and rotation flags. Run the ciphertext-only validator and compare key generations with later revocation evidence. Do not silently roll back a generation or restore a grant for a revoked/removed relationship. Feature-010 JMK recovery restores owner access but does not grant recovery staff plan, share, grant, or CPK visibility.

For the Journal/Crisis Plan feature release and the scheduled recovery exercise, restore a current
recovery point to isolated temporary resources. Confirm the restored inventory includes the owner
plan, shares, grants, rotation state, and broker replay receipts where still inside TTL; run the
Journal/Crisis Plan validators without decrypting content; verify revoked/removed relationships do
not become active; and record RPO/RTO plus cleanup evidence. Inspect CloudWatch logs/alarms during
the exercise and confirm the primary production table is still covered by PITR, the backup plan,
and Vault Lock. Delete only the isolated temporary restore resources using the approved recovery
cleanup procedure.

Expected incremental cost is one RSA-3072 KMS key plus request-scaled KMS decrypt, Lambda, API Gateway, DynamoDB, backup, CloudWatch, and CloudTrail usage; there is no always-on compute.
