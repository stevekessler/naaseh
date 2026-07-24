# User provisioning runbook

Last reviewed: 2026-07-23

## Initial administrator

Deploy the stack in `us-west-2`, attach the `ProvisionUserOperatorPolicyArn` output to the
approved bootstrap operator, and use the `ProvisionUserFunctionName` output:

```console
python3 -m pip install -r scripts/requirements.txt
python3 scripts/create_user.py --function-name FUNCTION --username steve --display-name Steve --role admin
```

The command prompts twice for the password and PIN with input hidden. Do not pass either secret
on the command line. For protected automation, provide exactly two newline-delimited secret
values through `--password-stdin`; ensure the producer does not echo or persist them. Use
`--profile` when needed. The Region is fixed to `us-west-2`. Preserve the generated idempotency
token for a retry, or set `--idempotency-token` explicitly.

The operator policy permits only `lambda:InvokeFunction` on the provisioning Lambda. The Lambda,
not the operator, reads the password pepper and writes the transactional username/user/request
records. CloudTrail supplies the invoking IAM principal. Application/Lambda logs contain only a
correlation ID, role, opaque user ID, outcome, and safe metric—never credentials or hashes.

## Subsequent users

An active application administrator can use Admin → Users while online. Choose `User` or
`Administrator`; the same backend schema, canonicalization, Argon2id hashing, conditional write,
idempotency behavior, and allowlisted result are used by both browser and command entry points.
The form clears write-only password/PIN fields after success. Regular users receive `403` for all
user/category mutations.

Administrators can list safe user profiles; add, disable, or reactivate users; and create, update,
or archive categories. All authenticated users can read categories. Disabling increments the
session epoch and revokes existing sessions without removing historical attribution.

Self-disablement and disabling the last active administrator are rejected. If administration is
otherwise unavailable, restore access through the approved IAM provisioning policy and command;
do not grant direct DynamoDB, Secrets Manager, or KMS permissions to an operator.
