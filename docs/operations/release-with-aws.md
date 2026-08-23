# Complete routine production release with AWS

This is the standalone procedure for changing and deploying the existing Na'aseh production
application. Follow it in order for every routine production release after the one-time bootstrap.

Use this procedure for anything that must appear in the running application: web, API, Lambda,
runtime package, dependency, configuration, GitHub deployment workflow, or CDK infrastructure
changes. Production is AWS-hosted, so an application-only change still uses this procedure even
when no CloudFormation resource changes.

Documentation, specifications, tests, local tooling, and evidence-only changes that do not alter a
deployed artifact use [Changes without an AWS deployment](release-without-aws.md).

## Safety rules

- Do not use the current staging workflow. Stage-specific stack IDs and a separate staging hostname
  have not been implemented, so that workflow can target the production stack IDs.
- Never deploy with the AWS root identity or long-lived root credentials.
- Never invent a rollback SHA. It must be the full SHA of the version currently known to work in
  production.
- Do not repeat first-deployment bootstrap, user provisioning, backup-permission setup, or Argon2
  calibration during an ordinary release unless the relevant deployed control changed.
- Database and API changes must remain backward compatible until the production smoke test passes.
- Do not place passwords, PINs, TOTP values, cookies, tokens, recovery codes, or private application
  data in commands, logs, pull requests, or change tickets.

For a genuinely new environment with no known-good release or smoke user, stop and follow
[First AWS deployment](first-aws-deployment.md).

## Prerequisites

Before starting, confirm:

- Node.js 24.x, npm, Git, GitHub CLI, AWS CLI, and the `naaseh-admin` profile are available.
- `gh auth status` succeeds for the correct GitHub account and repository.
- The protected GitHub `production` environment has its deployment role, break-glass role,
  production URL, domain values, and current smoke-user credentials.
- An active application administrator and dedicated ordinary `naaseh-smoke` user already exist.
- The previous production release completed its authenticated smoke test successfully.

## 1. Record the rollback release before merging

Use GitHub CLI's built-in `--jq` support to select the most recent successful production run and
save its SHA directly in the current terminal:

```console
ROLLBACK_REF="$(gh run list \
  --workflow deploy-production.yml \
  --status success \
  --limit 1 \
  --json headSha \
  --jq '.[0].headSha')"
test "${#ROLLBACK_REF}" -eq 40
printf '%s\n' "$ROLLBACK_REF"
```

This must identify the version currently running successfully in production. It is not the new
pull-request commit, a short SHA, or an earlier documentation/evidence commit merely because that
commit is an ancestor of the deployed release. Do not omit the `--workflow deploy-production.yml`
or `--status success` filters: an unfiltered `gh run list` can select a validation run or a failed
deployment instead.

## 2. Create a branch and make the change

Start from synchronized `main`:

```console
git switch main
git pull --ff-only origin main
git status --short --branch
git switch -c codex/SHORT-DESCRIPTION
```

Make the change on the feature branch. Preserve unrelated local work and never stage files merely
because they are present.

## 3. Run local validation

Run the complete local release gate:

```console
npm run validate:pre-aws:browsers
```

This is the release gate containing the exhaustive Chromium, WebKit desktop, iPhone, and iPad
coverage. The pull-request workflow intentionally runs a smaller representative Chromium gate.

If required validation commands or browser coverage changed, also follow the test-count and timing
requirements in `AGENTS.md`.

### Additional infrastructure review

For `infra`, IAM, KMS, networking, backup, DNS, environment configuration, Lambda runtime, or other
CloudFormation-affecting changes, authenticate and review the synthesized diff:

```console
aws sso login --profile naaseh-admin
aws sts get-caller-identity --profile naaseh-admin
npm run build -w '@naaseh/web'
AWS_PROFILE=naaseh-admin CDK_DEFAULT_ACCOUNT=093733938983 npm run cdk:synth -- \
  -c breakGlassRoleArn=arn:aws:iam::093733938983:role/naaseh-recovery-break-glass
AWS_PROFILE=naaseh-admin npx cdk diff --app infra/cdk.out --all
```

The identity must be the expected assumed Identity Center role in account `093733938983`. Stop if
the ARN ends in `:root`. Review resource replacements and deletions, IAM/KMS expansion, retention,
database compatibility, DNS, CloudFront, WAF, and backup changes before continuing.

Application-only changes that produce no infrastructure/configuration difference do not require a
manual CDK diff; the production workflow will still synthesize and deploy the reviewed application.

## 4. Commit, push, and open the pull request

Review the exact scope:

```console
git status --short
git diff --check
git diff --stat
```

Stage only intended paths, then commit and push:

```console
git add -- PATH_ONE PATH_TWO
git commit -m 'DESCRIBE THE CHANGE'
git push -u origin HEAD
```

Open a draft pull request with a specific title, substantive summary, risk/rollback notes, and this
testing section. Remove inapplicable lines and leave post-merge items unchecked:

```markdown
## Testing

- [x] `npm run validate:pre-aws:browsers`
- [x] `npm run build -w '@naaseh/web'`
- [x] CDK synthesis completed (infrastructure or runtime-configuration changes)
- [x] Reviewed `npx cdk diff --app infra/cdk.out --all` (infrastructure changes)
- [x] Required GitHub `validate` check passed
- [ ] Production workflow completed
- [ ] Authenticated production smoke test passed
- [ ] Manual production verification completed
```

Never mark a command or check complete unless it actually ran successfully.

## 5. Review and merge

Wait for the required GitHub `validate` check and review feedback. Mark the pull request ready only
after its description and testing evidence are complete. Resolve the pull request number from the
current branch instead of copying the `PR_NUMBER` placeholder literally:

```console
PR_NUMBER="$(gh pr view --json number --jq '.number')"
test -n "$PR_NUMBER"
printf 'Pull request: %s\n' "$PR_NUMBER"

if [ "$(gh pr view "$PR_NUMBER" --json isDraft --jq '.isDraft')" = true ]; then
  gh pr ready "$PR_NUMBER"
fi

gh pr checks "$PR_NUMBER" --watch
gh pr checks "$PR_NUMBER" \
  --json name,state,workflow,link \
  --jq '.[] | {name, state, workflow, link}'
```

The watch command and structured JSON command are intentionally separate because GitHub CLI does
not allow `--watch` and `--json` in the same invocation.

Obtain any required approval. Merge only when GitHub reports the pull request clean and all required
checks pass:

```console
gh pr merge PR_NUMBER --merge --delete-branch
```

Update the local checkout and record the release candidate SHA:

```console
git switch main
git pull --ff-only origin main
git status --short --branch
RELEASE_SHA="$(git rev-parse origin/main)"
test "$RELEASE_SHA" = "$(git rev-parse HEAD)"
printf '%s\n' "$RELEASE_SHA"
```

The working tree must be clean, and local `main` must match `origin/main` before deployment.

## 6. Start the production workflow

Choose an approved change ticket or descriptive release identifier. Do not include secrets or
private data:

```console
CHANGE_TICKET="pr-${PR_NUMBER}-SHORT-DESCRIPTION"
```

Dispatch the production workflow from `main` with the saved pre-merge rollback SHA:

```console
gh workflow run deploy-production.yml \
  --ref main \
  -f change_ticket="$CHANGE_TICKET" \
  -f rollback_ref="$ROLLBACK_REF"
```

Find the new run, copy its numeric run ID, and watch it:

```console
gh run list \
  --workflow deploy-production.yml \
  --limit 3 \
  --json databaseId,headSha,status,conclusion,createdAt,url \
  --jq '.[] | {runId: .databaseId, headSha, status, conclusion, createdAt, url}'
gh run watch RUN_ID
```

Approve the protected `production` environment if GitHub requests authorized approval.

## 7. Understand the workflow result

A successful release has these results:

- `validate`: success
- `deploy`: success
- `smoke`: success
- `rollback`: skipped because it was unnecessary

The workflow builds the PWA, synthesizes the CDK application, deploys `NaasehEdge` in `us-east-1`
and `NaasehProd` in `us-west-2`, publishes the web bundle, invalidates CloudFront, and runs the
authenticated smoke test against `https://gsd.thepandas.link`.

If validation fails, nothing deploys. If CloudFormation deployment fails, CloudFormation rollback
is enabled. If deployment succeeds but the smoke test fails, the workflow rebuilds and redeploys
`ROLLBACK_REF`. Never mark the new SHA known-good after a failed smoke test, even if rollback
succeeds.

Inspect failures before retrying:

```console
gh run view RUN_ID --log-failed
```

## 8. Verify production manually

Confirm HTTPS and the HTTP redirect:

```console
curl --fail --silent --show-error --head https://gsd.thepandas.link
curl --silent --output /dev/null --write-out '%{http_code} %{redirect_url}\n' \
  http://gsd.thepandas.link
```

HTTPS must succeed. HTTP must return `301` or `302` with an HTTPS destination.

Confirm both stacks:

```console
aws cloudformation describe-stacks --profile naaseh-admin --region us-east-1 \
  --stack-name NaasehEdge --query 'Stacks[0].StackStatus' --output text
aws cloudformation describe-stacks --profile naaseh-admin --region us-west-2 \
  --stack-name NaasehProd --query 'Stacks[0].StackStatus' --output text
```

Both stacks must be `UPDATE_COMPLETE` after a routine release. Manually sign in, exercise the
changed behavior, and check relevant CloudWatch alarms:

```console
aws cloudwatch describe-alarms --profile naaseh-admin --region us-west-2 \
  --alarm-name-prefix NaasehProd \
  --query 'MetricAlarms[].{Name:AlarmName,State:StateValue}'
```

Investigate alarms in `ALARM`. A new alarm may temporarily show `INSUFFICIENT_DATA` until metrics
arrive.

For infrastructure changes, also verify every affected control, such as CloudFront, WAF, KMS,
GuardDuty, backup, restore testing, retention, migrations, or IAM denials. Do not repeat unrelated
bootstrap checks for an application-only release.

### Backup recovery-point verification when relevant

Use this only when backup infrastructure changed or during a scheduled backup review. Avoid the
paginated `list-stack-resources --output text` query, which can append `None` lines. Obtain the
single vault name with the non-paginated stack-resource command:

```console
BACKUP_VAULT="$(aws cloudformation describe-stack-resources \
  --profile naaseh-admin \
  --region us-west-2 \
  --stack-name NaasehProd \
  --query "StackResources[?ResourceType=='AWS::Backup::BackupVault'] | [0].PhysicalResourceId" \
  --output text)"
printf '<%s>\n' "$BACKUP_VAULT"
```

The output must contain exactly one vault name. Then list its recovery points:

```console
aws backup list-recovery-points-by-backup-vault \
  --profile naaseh-admin \
  --region us-west-2 \
  --backup-vault-name "$BACKUP_VAULT" \
  --query 'RecoveryPoints[].{Status:Status,Created:CreationDate,Resource:ResourceType,Arn:RecoveryPointArn}'
```

The Identity Center permission set needs `backup:ListRecoveryPointsByBackupVault` scoped to the
specific production backup-vault ARN. If AWS returns `AccessDeniedException`, update and reprovision
the permission set through IAM Identity Center, refresh the SSO session, and retry. Do not use the
root account. An empty list means the vault exists but has no completed recovery point yet.

## 9. Use the application and enroll administrator TFA

After the production workflow and manual checks pass, open <https://gsd.thepandas.link> and use the
application normally. Sign out and reopen the site if an older installed PWA tab was already
running.

Application administrator accounts must use TOTP two-factor authentication. If the administrator
is not already enrolled, the next sign-in forces enrollment before issuing a normal application
session:

1. Sign in with the administrator username and password.
2. Add the displayed setup key to a TOTP authenticator. The current interface displays the raw key
   rather than a QR code.
3. Enter the authenticator's current six-digit code.
4. Save all ten one-use recovery codes somewhere separate and secure before continuing.

If the administrator can complete the factor challenge and reach **Admin**, application TFA is
active; no AWS command is needed. Administrators cannot disable TFA. The ordinary smoke user does
not need TFA unless that account is intentionally opted in.

Application TFA is separate from AWS IAM Identity Center MFA. Keep both enabled and do not reuse
their recovery material. Lost administrator application factors require the separately authorized
[Administrator TFA recovery](admin-tfa-recovery.md) procedure.

## 10. Record the new known-good release

Read the completed workflow record:

```console
gh run view "$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')" \
  --json headSha,conclusion,url \
  --jq '{headSha, conclusion, url}'
```

Only after the workflow and manual verification pass, record its full `headSha` and change ticket
as the new known-good production release. That SHA becomes `ROLLBACK_REF` for the next deployment.
Update the pull request or change ticket to mark its three post-merge testing items complete.

The deeper production controls and exceptional first-deployment steps remain documented in
[Production deployment controls](production-deployment.md) and
[First AWS deployment](first-aws-deployment.md).
