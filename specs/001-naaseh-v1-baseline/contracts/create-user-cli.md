# Create User CLI Contract

## Purpose and Trust Boundary

`scripts/create_user.py` provisions the first administrator or a later user by invoking the
same backend provisioning service used by application administration. The caller must have
AWS credentials authorized for only the provisioning Lambda invocation. The command never
writes DynamoDB directly and never reads the password pepper, stored verifiers, or user data.

## Invocation

```text
python3 scripts/create_user.py \
  --username USERNAME \
  [--display-name NAME] \
  [--role {user,admin}] \
  [--profile AWS_PROFILE] \
  [--region us-west-2] \
  [--function-name NAME] \
  [--password-stdin]
```

- `--username` is required and follows the canonicalization/uniqueness rules in
  [data-model.md](../data-model.md).
- `--display-name` defaults to the supplied username.
- `--role` defaults to `user`; `admin` grants only the permissions in the data-model role matrix.
- `--region` defaults to `us-west-2`. V1 rejects any other value.
- `--function-name` defaults from deployment output/configuration and must identify the
  dedicated provisioning function.
- Without `--password-stdin`, the command prompts twice for the password and twice for the
  required user PIN using hidden terminal input.
- With `--password-stdin`, standard input contains two newline-delimited values: password,
  then PIN. This mode is intended for a protected automation pipe. The values are never
  echoed or included in diagnostics.
- There are deliberately no `--password` or `--pin` options.

## Request

The Boto3 Lambda invocation uses the selected AWS profile/credential chain and sends a UTF-8
JSON payload over the signed AWS API:

```json
{
  "schemaVersion": 1,
  "username": "steve",
  "displayName": "Steve",
  "role": "admin",
  "password": "<write-only>",
  "pin": "<write-only>"
}
```

The backend validates input, canonicalizes the username, hashes secrets with the calibrated
Argon2id service and configured pepper, conditionally reserves username uniqueness, creates
the user atomically, and emits a redacted audit event containing the operator principal,
new user ID, role, outcome, and correlation ID.

## Success and Failure Output

Success exits `0` and emits one JSON object suitable for automation:

```json
{ "id": "01...", "username": "steve", "role": "admin", "status": "active" }
```

Expected nonzero exits:

| Exit | Meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| `2`  | Local argument, Region, password/PIN confirmation, or input validation failed |
| `3`  | AWS credentials are absent or not authorized                                  |
| `4`  | Username conflict or backend request validation failed                        |
| `5`  | Provisioning service or network failure; outcome is not known                 |

Errors include a safe correlation ID when available. They never reproduce request payloads,
passwords, PINs, pepper material, hashes, raw AWS responses, or stack traces by default. A
retry after an unknown outcome is safe because the backend uses canonical username uniqueness
and an invocation idempotency token.

## Required Tests

- Argument parsing, defaults, role validation, and production Region rejection.
- Hidden interactive prompt and `--password-stdin` paths without secret output.
- User/admin payload selection and redacted success/error rendering.
- Missing credentials, denied invocation, username conflict, timeout, malformed backend
  response, and retry after unknown outcome.
- Contract test proving CLI and application administration call the same provisioning service.
- Security test proving password/PIN values are absent from argv, process listings, captured
  stdout/stderr, CloudWatch logs, and returned user records.
