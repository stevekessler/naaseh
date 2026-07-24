# Production deployment controls

Production is deployed at `https://gsd.thepandas.link`. The workflow builds the PWA, deploys the
`NaasehEdge` stack in `us-east-1` and `NaasehProd` in `us-west-2`, publishes the web bundle,
invalidates CloudFront, and runs an authenticated smoke test against that exact HTTPS URL.

Before enabling the workflow, configure the protected `production` GitHub environment exactly as
listed in [First AWS deployment](first-aws-deployment.md). The workflow fails closed if the domain,
hosted-zone ID, HTTPS smoke URL, break-glass role, username, or password is missing or unexpected.
AWS access uses a short-lived, environment-restricted GitHub OIDC role; long-lived access keys are
prohibited.

Protect `main` with the reusable validation workflow's `validate`, `browser`, and `security` jobs.
Every manual production run requires an approved change ticket and the full 40-character SHA of
the currently deployed known-good release. CloudFormation rolls back failed infrastructure. If
deployment succeeds but the production canary fails, the rollback job checks out that immutable
SHA, rebuilds it, and redeploys both stacks. Database changes must remain backward compatible
until smoke testing passes.

The first release is intentionally different because no previous rollback SHA or smoke user
exists. Follow the one-time bootstrap procedure in the first-deployment runbook; do not invent a
placeholder rollback commit.

After every deployment, confirm the `SiteUrl` output, HTTPS response, HTTP-to-HTTPS redirect,
authenticated canary, CloudWatch alarms, and CloudFront invalidation. Record the release SHA and
change ticket. Keep `ProvisionUserOperatorPolicyArn` off application roles and attach it only to an
approved operator following [User provisioning](user-provisioning.md).
