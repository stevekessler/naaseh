# First AWS deployment

Last reviewed: 2026-07-23

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
session for one-time setup, Route 53 access, and permission to configure GitHub environments. Do
not create an IAM user for GitHub or store long-lived AWS keys there.

| Setting            | Production value             |
| ------------------ | ---------------------------- |
| AWS account        | `093733938983`               |
| Application Region | `us-west-2`                  |
| Edge Region        | `us-east-1`                  |
| Hosted zone        | `thepandas.link`             |
| Hosted-zone ID     | `Z03233042WRAYW9S16I7T`      |
| Site URL           | `https://gsd.thepandas.link` |

Confirm the operator identity before changing AWS. Stop if the ARN ends in `:root`; use an
approved assumed role instead.

```console
node --version
aws sts get-caller-identity --profile PROFILE
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
| User           | `stevekessler-admin`   | Normal administrative email and MFA                         |
| Group          | `NaasehAdministrators` | Contains `stevekessler-admin`                               |
| Permission set | `NaasehBootstrapAdmin` | AWS-managed `AdministratorAccess`; one- or two-hour session |

Under **Multi-account permissions > AWS accounts**, assign group `NaasehAdministrators` and
permission set `NaasehBootstrapAdmin` to account `093733938983`. Wait for provisioning to finish.
The broad permission set is for initial account setup and CDK bootstrapping; routine GitHub
deployment uses the separate OIDC role below.

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

### Remove the root CLI access key

Only after the `naaseh-admin` profile works:

1. In the root console, open **Security credentials > Access keys**.
2. Deactivate the root access key.
3. Run `aws sso login --profile naaseh-admin` and verify the assumed-role identity again.
4. Delete the root access key in the console.
5. Remove its values from the `default` section of `~/.aws/credentials`.
6. Clear any credentials exported into the current shell:

```console
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
```

After cleanup, an unqualified identity request should fail unless `AWS_PROFILE` selects a safe
profile, while the named profile must succeed:

```console
aws sts get-caller-identity
aws sts get-caller-identity --profile naaseh-admin
```

Use root only for the small set of account-owner operations that require it.

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
aws sso login --profile naaseh-recovery-operator
```

Use the same access-portal URL and Region, account `093733938983`, role
`NaasehRecoveryOperator`, and SSO session name `naaseh-recovery-session`. Authenticate as the
separate recovery user. Test role assumption without printing temporary credentials:

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

Configure the account-wide GitHub provider with URL
`https://token.actions.githubusercontent.com` and audience `sts.amazonaws.com`. Create a distinct
role for each environment whose trust condition is restricted to the repository environment:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:stevekessler/naaseh:environment:ENVIRONMENT"
        }
      }
    }
  ]
}
```

The role needs permission to assume and tag the CDK bootstrap roles in both Regions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["sts:AssumeRole", "sts:TagSession"],
      "Resource": [
        "arn:aws:iam::ACCOUNT_ID:role/cdk-hnb659fds-*-role-ACCOUNT_ID-us-east-1",
        "arn:aws:iam::ACCOUNT_ID:role/cdk-hnb659fds-*-role-ACCOUNT_ID-us-west-2"
      ]
    }
  ]
}
```

Replace the qualifier if the account does not use `hnb659fds`.

## 5. Configure GitHub Actions

Create protected `staging` and `production` environments. Restrict production to `main` and add
required reviewers where supported.

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

Configure the three DNS variables in staging with a delegated staging hostname and zone. The
staging workflow deliberately rejects `gsd.thepandas.link`. Configure its two AWS role secrets and
optional public Web Push key too.

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

## 8. Use GitHub for subsequent releases

Run **Actions > Deploy production** with an approved change ticket and the full 40-character SHA
of the currently deployed known-good commit. The workflow validates, builds, deploys both stacks,
tests `https://gsd.thepandas.link`, and redeploys the known-good commit if the smoke test fails.

Use **Deploy staging** for staging. The first production bootstrap follows the local administrator
procedure above; the guarded **Deploy production** workflow is the only GitHub production path.

AWS references: [CloudFront certificate Region](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html),
[WAF CloudFront scope](https://docs.aws.amazon.com/waf/latest/developerguide/web-acl-associating-aws-resource.html),
and [AWS Backup service opt-in](https://docs.aws.amazon.com/aws-backup/latest/devguide/assigning-resources.html).
