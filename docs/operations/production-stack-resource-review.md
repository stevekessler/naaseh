# Production stack resource review

Review date: 2026-08-30

`npm run cdk:synth` currently produces **399 resources** in `NaasehProd`, leaving 101 resources of
the CloudFormation 500-resource limit. The largest groups are 124 HTTP API routes, 49 IAM roles, 44
IAM policies, 40 Lambda functions, 27 Lambda permissions, 21 API integrations, 15 log groups, 10
CloudWatch alarms, 9 EventBridge rules, and 6 KMS keys.

Before this review, the Journal/Crisis Plan implementation synthesized 405 resources. The separate
Journal key-envelope Lambda duplicated the Crisis Plan API's runtime, table access, API integration,
and log destination. Routing that endpoint through the existing Crisis Plan API Lambda and reusing
the existing sync log group safely removed six resources: one Lambda, its role and policy, one API
integration, one permission, and one log group. The dedicated broker Lambda and its 90-day log
group remain isolated because their KMS decrypt and protected-data boundary must not be shared with
an ordinary API process.

No other resource is safe to remove solely to reduce the count:

- API routes are the deployed contract and cannot be deleted or coalesced without compatibility
  analysis.
- The restore validator, backup selections, alarms, KMS keys, broker, and authorizer are security or
  recovery controls and are not cleanup candidates.
- `ArchiveProjectMigrationFunction`, `TaskSecurityFeatureMigrationGateFunction`,
  `ExtraLowInventoryFunction`, and `WorkloadProjectionReconciliationFunction` are possible future
  removals only after production checkpoints prove their migrations/reconciliation are complete,
  schedules/invocations are removed, rollback no longer depends on them, and a reviewed CDK diff
  shows no retained state is lost. Their names alone are not evidence that deletion is safe.
- Argon2 calibration and provisioning/operator functions are infrequent but intentional operational
  tools. Move them to a separately deployed operations stack only as part of a reviewed stack split;
  do not silently remove recovery or bootstrap capability.
- CDK custom-resource provider Lambdas support deployment and bucket notifications and must not be
  manually deleted.

At 399 resources, an emergency split is not required for this release, but 101 resources is not a
large long-term expansion budget. Re-run this inventory for every material infrastructure feature.
Begin a planned stack split before the template approaches 450 resources, preserving explicit
dependencies, rollback order, retained resources, and production names. Do not deploy the current
staging workflow as a workaround; its stack IDs are not stage-scoped.
