# Routine production release

Production: https://gsd.thepandas.link. Node.js 24 is required. There is no staging environment.

1. Implement on a feature branch and run `npm run validate:pre-aws:browsers`.
2. Open a PR and review changes. For infrastructure changes, synthesize and review the CDK diff.
   Keep the required hosted validation check at ten minutes or less; record its duration in the PR.
3. Merge the reviewed PR after required checks pass.
4. Preview the release: `npm run release:production -- --ticket RELEASE_ID`.
5. Dispatch it: `npm run release:production -- --ticket RELEASE_ID --execute`.
6. Follow the [production workflow](https://github.com/stevekessler/naaseh/actions/workflows/deploy-production.yml)
   through validation, deployment, and authenticated canary checks. Confirm the changed feature in production.

The script resolves the repository, current main SHA, and rollback SHA from the most recent successful
production workflow. It refuses a missing/failed/in-progress most recent production run or a changed main
SHA during preflight. Preview is read-only; `--execute` dispatches the existing protected GitHub workflow.
No AWS credentials, copied SHAs, shell substitution, or global npm upgrade is needed for dispatch.

GitHub handles OIDC authentication, web build, synthesis, CloudFormation deployment, CloudFront invalidation,
canary checks, and rollback to the previous release if the canary fails. Database changes must remain
backward compatible. A dispatched workflow is not proof of a successful deployment: check its final result.

For infrastructure review before merging:

```sh
AWS_PROFILE=naaseh-admin CDK_DEFAULT_ACCOUNT=093733938983 npm run cdk:synth -- -c breakGlassRoleArn=arn:aws:iam::093733938983:role/naaseh-recovery-break-glass
AWS_PROFILE=naaseh-admin npx cdk diff --app infra/cdk.out
```

If the most recent deployment failed, inspect deployment and rollback jobs before trying another release.
Use the workflow UI with the verified known-good full SHA when manual recovery is necessary. Never guess a
rollback SHA or delete retained encryption keys to get a deployment through.

One-time setup belongs in [First AWS deployment](first-aws-deployment.md), including protected environment
configuration. See [smoke-account setup](seed-production-smoke-account.md) for synthetic Journal/Crisis Plan
records, [production controls](production-deployment.md) for rollback policy, and
[changes without deployment](release-without-aws.md) for documentation-only work.
