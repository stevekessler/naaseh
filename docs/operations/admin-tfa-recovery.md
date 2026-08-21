# Administrator TFA recovery

Administrator recovery is an IAM-invoked operation, not a password or PIN bypass. Only the designated recovery role may invoke the `AdminTfaRecoveryFunction`. Supply the exact operator role ARN, administrator username, a non-empty incident reason, and a unique idempotency token of at least 16 characters. Reusing the token returns the immutable prior result.

The handler conditionally advances the target's session epoch, removes factor material, sets `tfaStatus` to `recovery_required`, and writes an immutable audit record in one DynamoDB transaction. It has no KMS decrypt permission. The administrator must enroll a new factor before an application session can be issued.

Use CloudTrail Lambda data events to identify the invoking principal and invocation time, then correlate with the `admin.tfa-recovery` structured event and `AUDIT#ADMIN_TFA_RECOVERY` record. Never place passwords, PINs, TOTP values, recovery codes, or encrypted seeds in the invocation reason or logs.

Roll out in this order: deploy version negotiation and repositories; migrate username lookups; deploy TFA-capable APIs and profile UI; verify ordinary-user enrollment; require administrator enrollment; then enable operator recovery alarms and the restore step.

The isolated restore workflow validates restored content, advances every restored user's session epoch, sets administrator users and factors to `recovery_required`, deletes restored login transactions, rescans to verify those invariants, and only then records successful restore evidence. A failed invariant keeps the workflow closed and reports failed validation to AWS Backup.
