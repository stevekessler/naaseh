# First AWS deployment

Last reviewed: 2026-07-25

Production is served at **https://gsd.thepandas.link**. CDK deploys two CloudFormation stacks:

- `NaasehEdge` in `us-east-1`: the DNS-validated ACM certificate and CloudFront-scope WAF;
- `NaasehProd` in `us-west-2`: Route 53 records, CloudFront, the private web origin, API, data,
  monitoring, and same-Region recovery resources.

CloudFront redirects HTTP to HTTPS, requires TLS 1.2 or newer, and serves the API and PWA from the
same hostname. CDK uploads the web build to private S3 and invalidates CloudFront. The edge stack
does not change recovery scope: all application data and backups remain in `us-west-2`, and total
loss of that Region remains outside v1.

Use separate AWS accounts and separate DNS names for staging and production. Never point staging
at `gsd.thepandas.link`.

## Prerequisites

The setup operator needs Node.js 24, npm, AWS CLI v2, an approved non-root administrative AWS
session for one-time setup, Route 53 access, and permission to configure GitHub environments. Google
Tasks synchronization additionally requires the Google Cloud CLI, `jq`, a separate Google Cloud
project for each environment, and permission to configure Google Auth Platform. Do not create an IAM
user for GitHub or store long-lived AWS keys there.

| Setting            | Production value                                                 |
| ------------------ | ---------------------------------------------------------------- |
| AWS account        | `093733938983`                                                   |
| Application Region | `us-west-2`                                                      |
| Edge Region        | `us-east-1`                                                      |
| Hosted zone        | `thepandas.link`                                                 |
| Hosted-zone ID     | `Z03233042WRAYW9S16I7T`                                          |
| Site URL           | `https://gsd.thepandas.link`                                     |
| Google callback    | `https://gsd.thepandas.link/api/v1/integrations/google/callback` |

Confirm the operator identity before changing AWS. Stop if the ARN ends in `:root`; use an
approved assumed role instead.

```console
node --version
aws sts get-caller-identity --profile PROFILE
gcloud version
jq --version
npm ci
npm run validate:pre-aws
```

## 1. Replace root CLI access with an assumed role

If `aws sts get-caller-identity` returns
`arn:aws:iam::093733938983:root`, stop using that identity for deployment. An AWS root identity
cannot switch to an IAM role directly. Use root once in the console to establish IAM Identity
Center, then use its temporary assumed-role credentials.

### Secure root

While signed into the AWS console as root:

1. Open **Account menu > Security credentials** and confirm root MFA is enabled.
2. Do not delete the current root access key until the replacement profile has been tested.
3. Never copy the root access-key ID or secret into a runbook, GitHub, chat, or application.

Identify where the current CLI credentials originate without displaying the secret:

```console
aws configure list
```

### Enable IAM Identity Center

1. Select `us-west-2` in the AWS console.
2. Open **IAM Identity Center** and choose **Enable** if necessary.
3. Choose an **organization instance**. A standalone account may offer to create an AWS
   Organization containing this account.
4. Keep `us-west-2` as the Identity Center home Region and record the AWS access-portal URL.
5. Require MFA for Identity Center users.

Create the following Identity Center resources:

| Type           | Name                   | Configuration                                               |
| -------------- | ---------------------- | ----------------------------------------------------------- |
| User           | `stevekessler-admin`   | `stevekessleradmin@gmail.com`; separate MFA                 |
| Group          | `NaasehAdministrators` | Contains `stevekessler-admin`                               |
| Permission set | `NaasehBootstrapAdmin` | AWS-managed `AdministratorAccess`; one- or two-hour session |

Under **Multi-account permissions > AWS accounts**, assign group `NaasehAdministrators` and
permission set `NaasehBootstrapAdmin` to account `093733938983`. Wait for provisioning to finish.
The broad permission set is for initial account setup and CDK bootstrapping; routine GitHub
deployment uses the separate OIDC role below.

If a user was created with the AWS CLI, it has no initial password. As a root or Identity Center
administrator, open **IAM Identity Center > Users**, select the user, choose **Reset password**, and
generate a one-time password. Give that password to the intended user through a secure channel.
At the first access-portal sign-in, the user sets a permanent password and registers MFA. Do not use
the self-service **Forgot password?** path before MFA enrollment; an MFA-required configuration can
prevent that reset from completing.

### Configure and verify the administrative CLI profile

```console
aws configure sso --profile naaseh-admin
```

Use these values in the wizard:

```text
SSO session name: naaseh-admin-session
SSO start URL: YOUR_ACCESS_PORTAL_URL
SSO region: us-west-2
SSO registration scopes: sso:account:access
AWS account: 093733938983
Role: NaasehBootstrapAdmin
Default client Region: us-west-2
Output format: json
Profile name: naaseh-admin
```

Authenticate and verify the result:

```console
aws sso login --profile naaseh-admin
aws sts get-caller-identity --profile naaseh-admin
```

The ARN must resemble the following and must not end in `:root`:

```text
arn:aws:sts::093733938983:assumed-role/AWSReservedSSO_NaasehBootstrapAdmin_SUFFIX/stevekessler-admin
```

For the current terminal, the named profile can be selected explicitly:

```console
export AWS_PROFILE=naaseh-admin
aws sts get-caller-identity
```

### Isolate the retained legacy root CLI access key

This account currently retains its root access key because other legacy projects still depend on
it. Do not deactivate, delete, rotate, relocate, or overwrite that key as part of the Naaseh setup.
The key is a temporary legacy exception, not a Naaseh credential:

1. Always use the explicit `--profile naaseh-admin` option or set `AWS_PROFILE=naaseh-admin` when
   administering or deploying Naaseh.
2. Before a consequential command, run `aws sts get-caller-identity` and stop if the ARN ends in
   `:root`.
3. Never copy the root key into this repository, GitHub secrets, GitHub Actions, application
   configuration, chat, or documentation.
4. Keep root MFA enabled and retain secure access to the account-owner email and telephone number.
5. Inventory each legacy consumer, then replace its root key with a workload-specific role or
   least-privilege identity. Test each migration independently before eventually retiring the key.
6. Clear any credentials exported directly into a shell before starting Naaseh work:

```console
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
```

The named Naaseh profile must succeed and return the `NaasehBootstrapAdmin` assumed role:

```console
aws sts get-caller-identity --profile naaseh-admin
```

Do not change the machine's default credential behavior until the legacy dependencies have been
identified. AWS root access keys cannot be permission-scoped, so migrating those projects remains
a security follow-up even though it is not a prerequisite for the first Naaseh deployment.

## 2. Create the recovery operator and break-glass role

The recovery identity must be separate from routine administration. Prefer a second person. If
there is only one operator, create a separate Identity Center user with separate MFA recovery
material and do not use it for ordinary work.

### Create the recovery Identity Center assignment

Create these Identity Center resources:

| Type           | Name                      | Configuration                                |
| -------------- | ------------------------- | -------------------------------------------- |
| User           | `stevekessler-recovery`   | Separately controlled email and MFA          |
| Group          | `NaasehRecoveryOperators` | Contains only approved recovery users        |
| Permission set | `NaasehRecoveryOperator`  | One-hour session and the inline policy below |

Use this inline permission-set policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AssumeNaasehBreakGlass",
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::093733938983:role/naaseh-recovery-break-glass"
    }
  ]
}
```

Assign the recovery group and permission set to account `093733938983`. The target role does not
need to exist before the permission-set assignment. Locate the generated Identity Center role:

```console
aws iam list-roles \
  --profile naaseh-admin \
  --path-prefix /aws-reserved/sso.amazonaws.com/ \
  --query "Roles[?starts_with(RoleName, 'AWSReservedSSO_NaasehRecoveryOperator_')].[RoleName,Arn]" \
  --output table
```

Exactly one role should be returned.

### Create the break-glass trust policy

Create `/tmp/naaseh-break-glass-trust.json` with the following content when Identity Center is in
`us-west-2`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TrustOnlyRecoveryPermissionSet",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::093733938983:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "ArnLike": {
          "aws:PrincipalArn": "arn:aws:iam::093733938983:role/aws-reserved/sso.amazonaws.com/us-west-2/AWSReservedSSO_NaasehRecoveryOperator_*"
        }
      }
    }
  ]
}
```

In this resource policy, the account-root ARN identifies the account principal; the `ArnLike`
condition restricts access to the recovery permission-set role. It does not authorize the root
user to assume the role. The wildcard preserves access if Identity Center regenerates the role's
unique suffix. If Identity Center was enabled in another Region, make the path match the actual ARN
returned above. An Identity Center role based in `us-east-1` may omit the Region path component.

Create the break-glass role without attaching a permission policy:

```console
aws iam create-role \
  --profile naaseh-admin \
  --role-name naaseh-recovery-break-glass \
  --description "Emergency authority for retained Naaseh recovery keys" \
  --max-session-duration 3600 \
  --assume-role-policy-document file:///tmp/naaseh-break-glass-trust.json \
  --tags Key=Application,Value=Naaseh Key=AccessType,Value=BreakGlass
```

Verify that the role exists and initially has no attached or inline permissions:

```console
aws iam get-role --profile naaseh-admin \
  --role-name naaseh-recovery-break-glass \
  --query 'Role.Arn' --output text
aws iam list-attached-role-policies --profile naaseh-admin \
  --role-name naaseh-recovery-break-glass
aws iam list-role-policies --profile naaseh-admin \
  --role-name naaseh-recovery-break-glass
```

The expected role ARN is:

```text
arn:aws:iam::093733938983:role/naaseh-recovery-break-glass
```

The Naaseh key policies exempt this role from explicit key-disable and key-deletion denies, but
that exemption does not grant either operation. Add emergency KMS actions only later through a
separately reviewed, key-specific identity policy.

### Test the recovery chain

Configure a distinct SSO profile and session:

```console
aws configure sso --profile naaseh-recovery-operator
```

Enter the following values. At the registration-scopes prompt, press **Return** to accept the
displayed `sso:account:access` default. Do not enter the AWS account number there; the wizard asks
you to select account `093733938983` only after browser authentication succeeds.

```text
SSO session name: naaseh-recovery-session
SSO start URL: https://ssoins-790787ff84bd25cc.portal.us-west-2.app.aws
SSO region: us-west-2
SSO registration scopes: sso:account:access
AWS account: 093733938983
Role: NaasehRecoveryOperator
Default client Region: us-west-2
Output format: json
Profile name: naaseh-recovery-operator
```

Authenticate as the separate recovery user. If the normal browser redirect cannot complete, rerun
the configuration with `--use-device-code` and follow the displayed device-login instructions.

```console
aws sso login --profile naaseh-recovery-operator
aws sts get-caller-identity --profile naaseh-recovery-operator
```

The first verification must return an assumed-role ARN containing
`AWSReservedSSO_NaasehRecoveryOperator_` and must not return the root ARN. Then test role assumption
without printing temporary credentials:

```console
aws sts assume-role \
  --profile naaseh-recovery-operator \
  --role-arn arn:aws:iam::093733938983:role/naaseh-recovery-break-glass \
  --role-session-name manual-recovery-test \
  --query 'AssumedRoleUser.Arn' \
  --output text
```

The returned ARN must be:

```text
arn:aws:sts::093733938983:assumed-role/naaseh-recovery-break-glass/manual-recovery-test
```

Optionally create a reusable chained profile without storing credentials:

```console
aws configure set role_arn \
  arn:aws:iam::093733938983:role/naaseh-recovery-break-glass \
  --profile naaseh-break-glass
aws configure set source_profile naaseh-recovery-operator \
  --profile naaseh-break-glass
aws configure set role_session_name manual-recovery \
  --profile naaseh-break-glass
aws configure set region us-west-2 --profile naaseh-break-glass
aws sts get-caller-identity --profile naaseh-break-glass
```

GitHub receives only the role ARN as `RECOVERY_BREAK_GLASS_ROLE_ARN`. The GitHub role must never
receive permission to assume the break-glass role.

AWS references: [root-user best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html),
[CLI authentication with Identity Center](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html),
[account assignments](https://docs.aws.amazon.com/singlesignon/latest/userguide/assignusers.html),
and [stable Identity Center role references](https://docs.aws.amazon.com/singlesignon/latest/userguide/referencingpermissionsets.html).

## 3. Bootstrap both CDK Regions

Bootstrap each account in both Regions. CloudFront requires its certificate and WAF resources in
`us-east-1`; application resources remain in `us-west-2`.

```console
AWS_PROFILE=naaseh-admin npx cdk bootstrap \
  aws://093733938983/us-east-1 aws://093733938983/us-west-2 \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

The execution policy belongs to CDK's CloudFormation roles, not the GitHub role. Replace the broad
first-deployment policy with a tested restricted policy after inventorying required actions.

Enable AWS Backup for DynamoDB and S3 in `us-west-2`:

```console
aws backup describe-region-settings --profile naaseh-admin --region us-west-2
aws backup update-region-settings --profile naaseh-admin --region us-west-2 \
  --resource-type-opt-in-preference DynamoDB=true,S3=true \
  --resource-type-management-preference DynamoDB=true
```

Create account-level AWS Budget alerts for actual and forecast spend. The application stack does
not create billing alerts; use the planning range in [AWS cost review](aws-cost-review.md) and set
thresholds appropriate for other workloads already in this account.

## 4. Create the GitHub OIDC deployment role

Account `093733938983` already has the account-wide GitHub provider
`arn:aws:iam::093733938983:oidc-provider/token.actions.githubusercontent.com` with audience
`sts.amazonaws.com`. Do not create a duplicate provider. Verify it:

```console
aws iam get-open-id-connect-provider --profile naaseh-admin \
  --open-id-connect-provider-arn \
  arn:aws:iam::093733938983:oidc-provider/token.actions.githubusercontent.com \
  --query '{Url:Url,ClientIDList:ClientIDList}' --output json
```

Create `/tmp/naaseh-production-github-trust.json` with this exact production trust policy. The
environment-qualified `sub` claim means that a branch, pull request, fork, or another repository
cannot use the role merely by knowing its ARN:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::093733938983:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:stevekessler@867985/naaseh@1308539000:environment:production"
        }
      }
    }
  ]
}
```

GitHub's OIDC subject for this repository includes the immutable owner and repository IDs shown
above. Verify the current prefix before creating or repairing the trust policy:

```console
gh api repos/stevekessler/naaseh/actions/oidc/customization/sub
```

The role condition must match the subject GitHub actually issues exactly. A name-only subject such
as `repo:stevekessler/naaseh:environment:production` is rejected by AWS.

Create `/tmp/naaseh-github-cdk-policy.json` with the only permissions granted directly to the
GitHub role. CDK will exchange these credentials for its bootstrapped deployment, lookup, and asset
publishing roles:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["sts:AssumeRole", "sts:TagSession"],
      "Resource": [
        "arn:aws:iam::093733938983:role/cdk-hnb659fds-*-role-093733938983-us-east-1",
        "arn:aws:iam::093733938983:role/cdk-hnb659fds-*-role-093733938983-us-west-2"
      ]
    }
  ]
}
```

Create and verify the production role:

```console
aws iam create-role --profile naaseh-admin \
  --role-name naaseh-github-production-deploy \
  --description "GitHub Actions OIDC deployment role for Naaseh production" \
  --max-session-duration 3600 \
  --assume-role-policy-document file:///tmp/naaseh-production-github-trust.json

aws iam put-role-policy --profile naaseh-admin \
  --role-name naaseh-github-production-deploy \
  --policy-name AssumeNaasehCdkBootstrapRoles \
  --policy-document file:///tmp/naaseh-github-cdk-policy.json

aws iam get-role --profile naaseh-admin \
  --role-name naaseh-github-production-deploy \
  --query 'Role.Arn' --output text

aws iam get-role-policy --profile naaseh-admin \
  --role-name naaseh-github-production-deploy \
  --policy-name AssumeNaasehCdkBootstrapRoles
```

The role ARN must be
`arn:aws:iam::093733938983:role/naaseh-github-production-deploy`. Do not attach
`AdministratorAccess`, store AWS access keys in GitHub, or allow this role to assume
`naaseh-recovery-break-glass`.

Do not create or run the staging deployment role yet. The current CDK entry point uses the fixed
stack IDs `NaasehEdge` and `NaasehProd`; the staging workflow would target the production stacks.
First implement stage-specific stack IDs and a separate staging hostname, then create a staging
role with an exact `repo:stevekessler/naaseh:environment:staging` subject.

## 5. Configure GitHub Actions

The repository is public, its default branch is `main`, and no GitHub environments, Actions
variables, or Actions secrets existed at the time of initial setup. Create the production
environment and restrict it to the `main` branch from the command line:

```console
jq -n '{
  wait_timer: 0,
  deployment_branch_policy: {
    protected_branches: false,
    custom_branch_policies: true
  }
}' | gh api --method PUT \
  repos/stevekessler/naaseh/environments/production --input -

gh api --method POST \
  repos/stevekessler/naaseh/environments/production/deployment-branch-policies \
  -f name=main -f type=branch
```

If another trusted operator is available, add that person as a required reviewer under
**Repository Settings > Environments > production**. Do not enable “prevent self-review” when the
repository has only one authorized operator, or no production deployment can be approved. The
`prevent_self_review` API field must be omitted entirely when no `reviewers` list is configured;
GitHub rejects the request even if that field is explicitly set to `false`.

| Type     | Production name                 | Production value                    |
| -------- | ------------------------------- | ----------------------------------- |
| Secret   | `AWS_DEPLOY_ROLE_ARN`           | Production OIDC deployment-role ARN |
| Secret   | `RECOVERY_BREAK_GLASS_ROLE_ARN` | Break-glass role ARN above          |
| Secret   | `PRODUCTION_SMOKE_USERNAME`     | Dedicated active smoke-test user    |
| Secret   | `PRODUCTION_SMOKE_PASSWORD`     | Smoke user's password               |
| Variable | `NAASEH_DOMAIN_NAME`            | `gsd.thepandas.link`                |
| Variable | `NAASEH_HOSTED_ZONE_ID`         | `Z03233042WRAYW9S16I7T`             |
| Variable | `NAASEH_HOSTED_ZONE_NAME`       | `thepandas.link`                    |
| Variable | `PRODUCTION_BASE_URL`           | `https://gsd.thepandas.link`        |
| Variable | `VITE_WEB_PUSH_PUBLIC_KEY`      | Public VAPID key, when enabled      |

Set the production role and non-secret configuration:

```console
gh secret set AWS_DEPLOY_ROLE_ARN --env production \
  --body 'arn:aws:iam::093733938983:role/naaseh-github-production-deploy'
gh secret set RECOVERY_BREAK_GLASS_ROLE_ARN --env production \
  --body 'arn:aws:iam::093733938983:role/naaseh-recovery-break-glass'

gh variable set NAASEH_DOMAIN_NAME --env production --body 'gsd.thepandas.link'
gh variable set NAASEH_HOSTED_ZONE_ID --env production --body 'Z03233042WRAYW9S16I7T'
gh variable set NAASEH_HOSTED_ZONE_NAME --env production --body 'thepandas.link'
gh variable set PRODUCTION_BASE_URL --env production --body 'https://gsd.thepandas.link'
```

After the first local deployment, create a dedicated active application smoke-test user. Enter its
credentials interactively so they do not appear in shell history:

```console
gh secret set PRODUCTION_SMOKE_USERNAME --env production
gh secret set PRODUCTION_SMOKE_PASSWORD --env production
```

Set `VITE_WEB_PUSH_PUBLIC_KEY` only after Web Push is enabled; it is a public value and belongs in
an environment variable, not a secret. Verify names without revealing secret values:

```console
gh variable list --env production
gh secret list --env production
gh api repos/stevekessler/naaseh/environments/production
```

Do not create the `staging` GitHub environment until the staging stack isolation described above is
implemented.

The workflows use pinned versions of `actions/checkout`, `actions/setup-node`, and
`aws-actions/configure-aws-credentials`. Permit those repositories if organization policy blocks
third-party Actions.

## 6. Review the deployment

Build the exact web artifact before synthesis, then review both stacks:

```console
npm run build -w '@naaseh/web'
AWS_PROFILE=naaseh-admin CDK_DEFAULT_ACCOUNT=093733938983 npm run cdk:synth -- \
  -c breakGlassRoleArn=arn:aws:iam::093733938983:role/naaseh-recovery-break-glass
AWS_PROFILE=naaseh-admin npx cdk diff --app infra/cdk.out --all
```

Confirm the templates contain the `gsd.thepandas.link` certificate, CloudFront-scope WAF,
CloudFront alias with TLS 1.2 minimum, Route 53 A and AAAA aliases, private versioned S3 origin,
web deployment/invalidation, on-demand DynamoDB with PITR, retained KMS keys and secrets, locked
same-Region backup vault, restore testing, alarms, and notification resources. They must not
contain a global-table replica, cross-Region backup copy, or passive application stack.

Do not load even disposable Google credentials until the IAM/KMS implementation and its negative
infrastructure assertions are complete. This command must produce no output before importing an
OAuth client:

```console
rg -n '^- \[ \] T(011|012)\b' specs/004-google-tasks-sync/tasks.md
```

After T011 and T012 are completed, run the focused infrastructure and security assertions again:

```console
npx vitest run \
  infra/test/google-sync.test.ts \
  tests/security/google-sync.security.test.ts \
  tests/security/google-sync-controls.security.test.ts
```

The assertions must prove that the stream function has no Secrets Manager or KMS access and only
the DynamoDB actions required to consume and enqueue owner-scoped operations. The reconciler must
read only the Google OAuth secret, use only the token-encryption key, and have KMS permissions
restricted by the approved encryption-context keys and purpose. A test that merely finds a KMS
grant somewhere in the template is not sufficient.

## 7. Perform the one-time production bootstrap

The normal production workflow requires an already deployed known-good rollback commit and an
existing smoke user. For the first release only, an approved non-root administrator deploys the
reviewed commit locally:

```console
AWS_PROFILE=naaseh-admin CDK_DEFAULT_ACCOUNT=093733938983 npm run cdk:synth -- \
  -c breakGlassRoleArn=arn:aws:iam::093733938983:role/naaseh-recovery-break-glass
AWS_PROFILE=naaseh-admin npx cdk deploy --all --app infra/cdk.out \
  --require-approval never --rollback
```

Wait for certificate validation and CloudFront propagation. Then verify:

```console
curl --fail --silent --show-error --head https://gsd.thepandas.link
curl --silent --output /dev/null --write-out '%{http_code}\n' http://gsd.thepandas.link
```

HTTPS must succeed and HTTP must redirect. Record outputs from both stacks, including `SiteUrl`,
`DistributionDomain`, `Argon2CalibrationFunctionName`, `ProvisionUserFunctionName`, and
`ProvisionUserOperatorPolicyArn`.

Attach the provisioning policy only to the approved operator, create the smoke user using
[User provisioning](user-provisioning.md), and remove the attachment unless continuing access is
approved. Run [Argon2id calibration](argon2-calibration.md), configure responder subscriptions,
verify alarms and backups, and run the authenticated production smoke test. Record the deployed
commit SHA as the known-good `rollback_ref` for the next release.

### Complete the post-deployment handoff

1. Ensure the exact locally deployed commit is pushed to `origin/main`. A clean status and matching
   full SHAs are required; a local-only commit cannot be rebuilt by GitHub Actions:

   ```console
   git status --short --branch
   git push origin main
   git rev-parse HEAD
   git rev-parse origin/main
   ```

2. Confirm both stacks and the public endpoint:

   ```console
   aws cloudformation describe-stacks --profile naaseh-admin --region us-east-1 \
     --stack-name NaasehEdge --query 'Stacks[0].StackStatus' --output text
   aws cloudformation describe-stacks --profile naaseh-admin --region us-west-2 \
     --stack-name NaasehProd --query 'Stacks[0].StackStatus' --output text
   curl --fail --silent --show-error --head https://gsd.thepandas.link
   curl --silent --output /dev/null --write-out '%{http_code} %{redirect_url}\n' \
     http://gsd.thepandas.link
   ```

   Both stacks must be `CREATE_COMPLETE` or `UPDATE_COMPLETE`, HTTPS must return `200`, and HTTP
   must return `301` or `302` with an HTTPS location.

3. Confirm the AWS SNS subscription request delivered to the configured responder address. Open
   the email from AWS Notifications and choose **Confirm subscription**. Verify that
   `SubscriptionArn` is no longer `PendingConfirmation`:

   ```console
   CRITICAL_TOPIC="$(aws cloudformation describe-stacks --profile naaseh-admin \
     --region us-west-2 --stack-name NaasehProd \
     --query "Stacks[0].Outputs[?OutputKey=='CriticalAlertsTopicArn'].OutputValue | [0]" \
     --output text)"
   aws sns list-subscriptions-by-topic --profile naaseh-admin --region us-west-2 \
     --topic-arn "$CRITICAL_TOPIC" \
     --query 'Subscriptions[].{Endpoint:Endpoint,SubscriptionArn:SubscriptionArn}'
   ```

4. Calibrate deployed password hashing without supplying real credentials:

   ```console
   ARGON2_FUNCTION="$(aws cloudformation describe-stacks --profile naaseh-admin \
     --region us-west-2 --stack-name NaasehProd \
     --query "Stacks[0].Outputs[?OutputKey=='Argon2CalibrationFunctionName'].OutputValue | [0]" \
     --output text)"
   AWS_PROFILE=naaseh-admin npm run calibrate:argon2 -- \
     --function-name "$ARGON2_FUNCTION" \
     --region us-west-2 \
     --invocations 8 --verify-samples 8 \
     --output docs/operations/argon2-deployed-evidence.json
   ```

   Review the evidence according to [Argon2id calibration](argon2-calibration.md). Never use a
   production password, PIN, username, salt, hash, or pepper as calibration input.

5. Provision the first application administrator and the dedicated smoke-test user. The bootstrap
   SSO administrator already has temporary administrative access, so do not manually modify an
   `AWSReservedSSO_*` role. Discover the Lambda name and use the interactive script so passwords
   and PINs stay out of shell history:

   ```console
   PROVISION_FUNCTION="$(aws cloudformation describe-stacks --profile naaseh-admin \
     --region us-west-2 --stack-name NaasehProd \
     --query "Stacks[0].Outputs[?OutputKey=='ProvisionUserFunctionName'].OutputValue | [0]" \
     --output text)"
   python3 -m venv /tmp/naaseh-provisioning-venv
   /tmp/naaseh-provisioning-venv/bin/pip install -r scripts/requirements.txt
   /tmp/naaseh-provisioning-venv/bin/python scripts/create_user.py \
     --profile naaseh-admin --function-name "$PROVISION_FUNCTION" \
     --username steve --display-name 'Steve Kessler' --role admin
   /tmp/naaseh-provisioning-venv/bin/python scripts/create_user.py \
     --profile naaseh-admin --function-name "$PROVISION_FUNCTION" \
     --username naaseh-smoke --display-name 'Production Smoke Test' --role user
   ```

   Use distinct passwords and PINs. Sign in manually as each account over HTTPS. Confirm the
   administrator can reach administration and that the smoke user has only ordinary user access.

6. Replace the GitHub smoke secrets with the exact smoke-user credentials. Enter values only at the
   hidden prompts:

   ```console
   gh secret set PRODUCTION_SMOKE_USERNAME --env production
   gh secret set PRODUCTION_SMOKE_PASSWORD --env production
   gh secret list --env production
   ```

7. Verify malware scanning, backup ownership, and alarms without uploading private data:

   ```console
   aws cloudformation list-stack-resources --profile naaseh-admin --region us-west-2 \
     --stack-name NaasehProd \
     --query "StackResourceSummaries[?ResourceType=='AWS::GuardDuty::MalwareProtectionPlan' || ResourceType=='AWS::Backup::BackupVault' || ResourceType=='AWS::Backup::BackupPlan'].{Type:ResourceType,Status:ResourceStatus,PhysicalId:PhysicalResourceId}"
   aws cloudwatch describe-alarms --profile naaseh-admin --region us-west-2 \
     --alarm-name-prefix NaasehProd \
     --query 'MetricAlarms[].{Name:AlarmName,State:StateValue}'
   ```

   GuardDuty must be active and the critical resources must be CloudFormation-managed. After the
   first scheduled backup, verify that the production vault has recovery points. Do not remove or
   weaken Vault Lock after accepting the retention configuration.

8. Treat the deployed full SHA as known-good only after the manual login and smoke checks pass.
   Then run the first GitHub-managed production release from `main`:

   ```console
   RELEASE_SHA="$(git rev-parse origin/main)"
   test "$RELEASE_SHA" = "$(git rev-parse HEAD)"
   gh workflow run deploy-production.yml --ref main \
     -f change_ticket=initial-production-handoff \
     -f rollback_ref="$RELEASE_SHA"
   gh run list --workflow deploy-production.yml --limit 1
   ```

   Follow the run in GitHub Actions or use `gh run watch RUN_ID`. The deploy, authenticated smoke,
   and rollback jobs must all have the expected results before closing the handoff.

9. Leave Google Tasks disconnected until the production release gates in section 8 are complete.
   An empty or placeholder Secrets Manager value is not authorization to connect production users.

## 8. Configure Google Tasks OAuth and the AWS secret

Do this independently for staging and production. Never reuse a Google Cloud project or OAuth
client between environments. The examples below use production values; replace the project and
callback for staging.

### Enable the Google Tasks API from the CLI

Choose the existing production project ID, authenticate with an approved Google administrator, and
verify the active account and project before enabling anything:

```console
export NAASEH_GOOGLE_PROJECT='YOUR_PRODUCTION_GOOGLE_PROJECT_ID'
export NAASEH_GOOGLE_REDIRECT_URI='https://gsd.thepandas.link/api/v1/integrations/google/callback'

gcloud auth login
gcloud config set project "$NAASEH_GOOGLE_PROJECT"
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud projects describe "$NAASEH_GOOGLE_PROJECT" \
  --format='table(projectId,name,projectNumber)'
gcloud services enable tasks.googleapis.com --project "$NAASEH_GOOGLE_PROJECT"
gcloud services list --enabled --project "$NAASEH_GOOGLE_PROJECT" \
  --filter='config.name:tasks.googleapis.com' \
  --format='value(config.name)'
```

The final command must print exactly `tasks.googleapis.com`.

### Configure the Google OAuth application

Google does not provide a supported `gcloud` command for creating a general-purpose Web application
OAuth client, so this is the one console procedure in this section. In Google Auth Platform for the
selected project:

1. Configure Branding with the Naaseh name, support email, home page, privacy-policy URL, and
   authorized production domain.
2. Configure Audience as External. While testing, add only approved test users; publish the app and
   complete verification before general production use when Google requires it.
3. Configure Data Access with exactly `https://www.googleapis.com/auth/tasks`. Do not add Drive,
   Calendar, profile, email, or incremental authorization scopes.
4. Create a **Web application** client with exactly one authorized redirect URI: the value of
   `NAASEH_GOOGLE_REDIRECT_URI`. Scheme, host, path, case, and trailing slash must match exactly.
5. Download the client JSON once to a location outside the repository. Do not commit it, attach it to
   a ticket, paste it into chat, or store it in GitHub Actions.

### Import the OAuth client into Secrets Manager

The CDK deployment creates the secret before it has a value. Point to the downloaded Google file,
discover the CDK-managed secret from CloudFormation, and construct the application's strict JSON
schema in a mode-`0600` temporary file. Keep shell tracing disabled so secret material is not echoed.

```console
set +x
umask 077
export AWS_PROFILE=naaseh-admin
export NAASEH_AWS_REGION=us-west-2
export NAASEH_GOOGLE_CLIENT_DOWNLOAD='/absolute/path/to/client_secret.json'

NAASEH_GOOGLE_SECRET_ID="$(aws cloudformation list-stack-resources \
  --profile "$AWS_PROFILE" \
  --region "$NAASEH_AWS_REGION" \
  --stack-name NaasehProd \
  --query "StackResourceSummaries[?ResourceType=='AWS::SecretsManager::Secret' && contains(LogicalResourceId, 'GoogleOAuthCredentials')].PhysicalResourceId | [0]" \
  --output text)"

test -n "$NAASEH_GOOGLE_SECRET_ID"
test "$NAASEH_GOOGLE_SECRET_ID" != 'None'
aws secretsmanager describe-secret \
  --profile "$AWS_PROFILE" \
  --region "$NAASEH_AWS_REGION" \
  --secret-id "$NAASEH_GOOGLE_SECRET_ID" \
  --query '{ARN:ARN,KmsKeyId:KmsKeyId,RotationOwner:Tags[?Key==`NaasehRotationOwner`].Value|[0]}'

NAASEH_GOOGLE_SECRET_FILE="$(mktemp /tmp/naaseh-google-oauth.XXXXXX.json)"
jq --arg redirectUri "$NAASEH_GOOGLE_REDIRECT_URI" '
  if (.web.client_id | type) != "string" or (.web.client_id | length) == 0 then
    error("download does not contain web.client_id")
  elif (.web.client_secret | type) != "string" or (.web.client_secret | length) == 0 then
    error("download does not contain web.client_secret")
  elif ((.web.redirect_uris // []) | index($redirectUri)) == null then
    error("download does not authorize the exact Naaseh callback")
  else
    {clientId: .web.client_id, clientSecret: .web.client_secret, redirectUri: $redirectUri}
  end
' "$NAASEH_GOOGLE_CLIENT_DOWNLOAD" > "$NAASEH_GOOGLE_SECRET_FILE"
chmod 600 "$NAASEH_GOOGLE_SECRET_FILE"

aws secretsmanager put-secret-value \
  --profile "$AWS_PROFILE" \
  --region "$NAASEH_AWS_REGION" \
  --secret-id "$NAASEH_GOOGLE_SECRET_ID" \
  --secret-string "file://$NAASEH_GOOGLE_SECRET_FILE" \
  --query '{VersionId:VersionId,VersionStages:VersionStages}'
```

Do not pass `clientSecret` directly on the command line: shell history and process inspection can
expose it. Validate the stored version without printing its value, then remove both plaintext files.
Confirm the two paths before running `rm`.

```console
aws secretsmanager get-secret-value \
  --profile "$AWS_PROFILE" \
  --region "$NAASEH_AWS_REGION" \
  --secret-id "$NAASEH_GOOGLE_SECRET_ID" \
  --query SecretString \
  --output text | jq -e --arg redirectUri "$NAASEH_GOOGLE_REDIRECT_URI" '
    type == "object" and
    (.clientId | type == "string" and length > 0) and
    (.clientSecret | type == "string" and length > 0) and
    .redirectUri == $redirectUri and
    (keys | sort) == (["clientId", "clientSecret", "redirectUri"] | sort)
  ' >/dev/null

printf 'Temporary secret: %s\nDownloaded client: %s\n' \
  "$NAASEH_GOOGLE_SECRET_FILE" "$NAASEH_GOOGLE_CLIENT_DOWNLOAD"
rm -- "$NAASEH_GOOGLE_SECRET_FILE" "$NAASEH_GOOGLE_CLIENT_DOWNLOAD"
unset NAASEH_GOOGLE_CLIENT_DOWNLOAD NAASEH_GOOGLE_SECRET_FILE
```

Do not retrieve the secret again for routine checks. The safe verification surface is secret
metadata, CloudTrail, the focused security tests, and a disposable owner connection. Perform the
connection, bidirectional-sync, disconnect, failed-revocation, and restore-invalidation checks in
`specs/004-google-tasks-sync/quickstart.md`; record evidence in
`specs/004-google-tasks-sync/validation-results.md`. Keep production blocked until every security
task above is complete and the validation records pass.

Immediately before enabling production synchronization, this broader release-gate check must
produce no output. T054 uses only the isolated disposable environment and its test OAuth client;
it must never exercise production user data.

```console
rg -n '^- \[ \] T(006|011|012|037|041|051|053|054)\b' \
  specs/004-google-tasks-sync/tasks.md
```

For rotation, create a new Google client secret, import it as a new `AWSCURRENT` version using the
same file-based procedure, validate a disposable connection, and revoke the old Google credential.
Never delete a retained AWS secret or KMS key while a live record or backup still references it. See
[Google Tasks synchronization operations](google-tasks-sync.md) and [key rotation](key-rotation.md).

## 9. Use GitHub for subsequent releases

Run **Actions > Deploy production** with an approved change ticket and the full 40-character SHA
of the currently deployed known-good commit. The workflow validates, builds, deploys both stacks,
tests `https://gsd.thepandas.link`, and redeploys the known-good commit if the smoke test fails.

The first production bootstrap follows the local administrator procedure above; the guarded
**Deploy production** workflow is the only GitHub production path. Do not run **Deploy staging**
until stage-specific stack IDs and a separate staging hostname have been implemented and reviewed.

AWS references: [CloudFront certificate Region](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html),
[WAF CloudFront scope](https://docs.aws.amazon.com/waf/latest/developerguide/web-acl-associating-aws-resource.html),
and [AWS Backup service opt-in](https://docs.aws.amazon.com/aws-backup/latest/devguide/assigning-resources.html).
Google/AWS credential references: [enable services with `gcloud`](https://docs.cloud.google.com/sdk/gcloud/reference/services/enable),
[Google Web application OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[AWS CLI `put-secret-value`](https://docs.aws.amazon.com/cli/latest/reference/secretsmanager/put-secret-value.html),
and [mitigating CLI secret exposure](https://docs.aws.amazon.com/secretsmanager/latest/userguide/security_cli-exposure-risks.html).
