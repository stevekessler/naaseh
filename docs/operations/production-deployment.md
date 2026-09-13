# Production deployment controls

Use the [routine release procedure](release-with-aws.md). It is the single operational checklist.

- Production runs at https://gsd.thepandas.link, with NaasehEdge in us-east-1 and NaasehProd in us-west-2.
- GitHub's protected production environment holds configuration and smoke credentials; AWS uses short-lived OIDC roles.
- Required validation must stay at ten minutes or less. The workflow timeout is a safety limit, not a target.
- Releases deploy reviewed main, with a real previous successful release SHA for rollback.
- CloudFormation rolls back infrastructure failures. The workflow redeploys the previous release if post-deploy smoke checks fail.
- The authenticated production canary uses synthetic data and never writes personal Journal or Crisis Plan records.
- Keep database/API changes backward compatible through deployment and rollback.
- Initial environment provisioning and missing smoke records require the linked first-deployment/seed procedures.

## Why the current staging workflow is disabled

Production-only hosting fits the current pre-use phase. The staging workflow intentionally fails and has no
AWS credentials. Provisioning an isolated staging environment requires a separate infrastructure change.
