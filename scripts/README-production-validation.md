# Production validation script

The two production validators run read-only checks before and after a deployment. Both show
`PASS`, `FAIL`, and `WARN` results on screen, optionally save a timestamped log, and exit with
status `1` when a required check fails.

- `validate_pre_deployment.py` verifies release readiness before starting the workflow.
- `validate_post_deployment.py` verifies the workflow and deployed production environment.

The script checks:

- required local command-line tools and the expected AWS account;
- GitHub authentication, production variables, and required secret names;
- optional pull-request checks, deployment workflow results, and the local Git checkout;
- the `NaasehEdge` and `NaasehProd` CloudFormation stacks;
- discovery and metadata of the CDK-managed Web Push secret;
- the VAPID JSON schema and equality of the AWS and GitHub public keys;
- production HTTPS and HTTP-to-HTTPS redirection;
- the latest CloudFront invalidation, CloudWatch alarms, and Web Push metrics.

The secret value is read only in memory to validate its schema and public key. Secret values,
private keys, and the public key are never printed or written to the log.

## Requirements

- Python 3.10 or newer
- AWS CLI with the `naaseh-admin` profile
- GitHub CLI authenticated to the Naaseh repository
- Git and curl
- access to AWS account `093733938983`

Run the pre-deployment script from a clean, updated `main` branch:

```console
git switch main
git pull --ff-only origin main
npm run validate:production:pre
```

After the GitHub deployment finishes, run the post-deployment script with its run ID:

```console
npm run validate:production:post -- --run-id RUN_ID
```

If `--run-id` is omitted, the post-deployment script validates the newest manually dispatched
`Deploy production` run on `main`. Supplying the ID is safer because it proves exactly which release
was checked.

## What runs before deployment

The pre-deployment script validates the command-line tools, AWS account, GitHub environment,
optional PR checks, clean `main` checkout, both existing stacks, and the AWS/GitHub VAPID key
configuration. It does not deploy or change anything.

Use `--skip-git` only when inspecting configuration before a PR has merged. A real production
release should not be started from a pre-deployment result that skipped the Git check.

```console
python3 scripts/validate_pre_deployment.py --pr-number 6 --skip-git
```

## What runs after deployment

The post-deployment script validates the exact GitHub Actions deployment, both updated stacks,
VAPID configuration, HTTPS, the HTTP redirect, CloudFront invalidation history, CloudWatch alarms,
and Web Push metric presence. It does not change the deployment or send a notification.

## Save a log

Pass an exact log filename:

```console
python3 scripts/validate_pre_deployment.py \
  --save-location "$HOME/Desktop/naaseh-production-validation.log"
```

Pass an existing directory to create a timestamped filename inside it:

```console
mkdir -p "$HOME/Desktop/naaseh-validation-logs"
python3 scripts/validate_post_deployment.py \
  --save-location "$HOME/Desktop/naaseh-validation-logs" \
  --no-verbose
```

A directory path ending in `/` is also treated as a directory and is created if necessary.

## Verbose and concise output

Concise output is the default and displays only the check results and summary:

```console
python3 scripts/validate_pre_deployment.py --no-verbose
```

Verbose output also displays safe command-level diagnostic details:

```console
python3 scripts/validate_post_deployment.py --verbose --run-id RUN_ID
```

The saved log always contains verbose diagnostics even when screen output is concise. Sensitive
commands are represented as `[REDACTED SENSITIVE COMMAND]`.

## Validate a PR or deployment run

Require all reported checks on PR 6 to have passed:

```console
python3 scripts/validate_pre_deployment.py --pr-number 6
```

Require a particular production deployment workflow run to have passed:

```console
python3 scripts/validate_post_deployment.py --run-id 31551089284
```

These options can be combined with logging:

```console
python3 scripts/validate_post_deployment.py \
  --run-id RUN_ID \
  --save-location "$HOME/Desktop/naaseh-validation-logs/" \
  --verbose
```

## Pre-deployment local Git check

The pre-deployment script automatically requires a clean working tree, the `main` branch, and an
exact match between `HEAD` and the current remote `main` SHA. The comparison uses read-only
`git ls-remote`, so it does not modify the checkout:

```console
git switch main
git pull --ff-only origin main
python3 scripts/validate_pre_deployment.py
```

## Exit status and warnings

- Exit `0`: all required validations passed.
- Exit `1`: one or more required validations failed.
- `WARN` does not make the command fail. Web Push metric history is a warning because a newly
  enabled environment may not have emitted those metrics yet.

An absent Web Push metric means a real browser notification should still be tested manually. The
script cannot grant browser permission or prove delivery to a physical device.

Run either script with `--help` for configuration overrides such as AWS profile, account, Regions,
stack names, GitHub environment, production URL, and HTTP timeout.
