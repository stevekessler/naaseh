# Production deployment controls

Last reviewed: 2026-08-30

Production is deployed at `https://gsd.thepandas.link`. The workflow builds the PWA, deploys the
`NaasehEdge` stack in `us-east-1` and `NaasehProd` in `us-west-2`, publishes the web bundle,
invalidates CloudFront, and runs an authenticated smoke test against that exact HTTPS URL.

Before enabling the workflow, configure the protected `production` GitHub environment exactly as
listed in [First AWS deployment](first-aws-deployment.md). The workflow fails closed if the domain,
hosted-zone ID, HTTPS smoke URL, break-glass role, username, or password is missing or unexpected.
AWS access uses a short-lived, environment-restricted GitHub OIDC role; long-lived access keys are
prohibited.

Protect `main` with the reusable validation workflow's required `validate` job. That job includes
runtime checks, dependency audit, type checking, linting, unit tests, builds, and the focused
Chromium browser gate. Every manual production run requires an approved change ticket and the full
40-character SHA of the currently deployed known-good release. CloudFormation rolls back failed
infrastructure. If deployment succeeds but the production canary fails, the rollback job checks
out that immutable SHA, rebuilds it, and redeploys both stacks. Database changes must remain
backward compatible until smoke testing passes.

The first release is intentionally different because no previous rollback SHA or smoke user
exists. Follow the one-time bootstrap procedure in the first-deployment runbook; do not invent a
placeholder rollback commit.

Do not use the staging workflow. It still resolves the fixed `NaasehEdge` and `NaasehProd` stack
IDs and is not isolated by stage or hostname. Production changes must follow
[Complete routine production release with AWS](release-with-aws.md) from a feature branch, through
a reviewed pull request whose hosted required check is measured at ten minutes or less.

## Why the current staging workflow is disabled

“Do not use staging” means do not dispatch
[`deploy-staging.yml`](../../.github/workflows/deploy-staging.yml). It does not mean that a future
isolated staging environment is undesirable.

The current workflow checks that its configured hostname is not `gsd.thepandas.link`, but then runs
`cdk deploy --all` against the same CDK application and fixed CloudFormation stack IDs
`NaasehEdge` and `NaasehProd`. It does not pass a stage-qualified stack name, assert a distinct AWS
account, or run the production rollback and authenticated canary jobs. If its staging OIDC role or
environment variables point at the production account, CloudFormation can update the production
stacks despite the hostname check. A different hostname alone is not an isolation boundary.

Before staging may be enabled, it needs a separate AWS account, separate DNS name and hosted zone,
stage-qualified stack/resource names, an environment-specific OIDC role and secrets, an explicit
account/Region assertion, and its own rollback and smoke procedure. Until those controls are
implemented and reviewed, use only `deploy-production.yml` for AWS releases; do not use staging as
a stack-size workaround or deployment rehearsal.

The production smoke account is synthetic and must be pre-enrolled in Journal with a non-sensitive
encrypted key envelope and Crisis Plan. The canary is non-destructive: it reads those records in
separate Lambda invocations, validates both API routes and no-store headers, verifies the signed
sharing-key registry cryptographically, and confirms an unauthorized broker request is concealed.
It must never use a real user's journal or Crisis Plan. Follow
[Seed the production smoke account](seed-production-smoke-account.md); for the first Journal
rollout, use its two-release sequence because the records cannot exist before the Journal runtime is
deployed.

The linked seeding runbook currently records a client enrollment blocker: the supported UI does
not yet write the complete durable Journal key envelope. The Journal/Crisis Plan production rollout
must not begin until that blocker is implemented, tested, and removed through review.

After every deployment, confirm the `SiteUrl` output, HTTPS response, HTTP-to-HTTPS redirect,
authenticated canary, CloudWatch alarms, and CloudFront invalidation. Record the release SHA and
change ticket. Keep `ProvisionUserOperatorPolicyArn` off application roles and attach it only to an
approved operator following [User provisioning](user-provisioning.md).

For the Journal/Crisis Plan release, completion additionally requires real-AWS evidence for the KMS
decrypt boundary, successful cryptographic revocation, content-free CloudWatch logs and healthy
alarms, DynamoDB inclusion in PITR/AWS Backup, and an isolated ciphertext-only restore test. The
exact sequence and cost guardrails are in section 8 (including its backup subsection) of
[Complete routine production release with AWS](release-with-aws.md) and in
[Crisis Plan operations](../runbooks/crisis-plan-operations.md). A passing CDK test or production
smoke denial is necessary but does not replace the successful real-KMS/open-and-revoke check.

The current production template resource review is recorded in
[Production stack resource review](production-stack-resource-review.md). Re-review that inventory
before stack splitting or after any material infrastructure expansion.
