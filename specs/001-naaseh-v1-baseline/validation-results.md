# Baseline validation results

Latest local validation: 2026-07-23 from the repository root.

- Node.js 24 `npm run validate`: passed on 2026-07-23. The enforced Node 24 runtime check, TypeScript, ESLint, 59 Vitest files / 196 tests, API build, production PWA build, and infrastructure type checking all completed successfully.
- Chromium and Playwright WebKit: all 38 journeys passed in one parallel run (19 per browser), including offline reconnect, encrypted conflict capture, hidden-memo PIN/recovery, group/private-task behavior, administration, reminders, search/filtering, accessibility, and task revision UI. The reconnect protocol also passed 20/20 Chromium repetitions with five parallel workers after the test was made to await the atomic offline task/outbox commit before reconnecting.
- Focused accessibility automation passed in Chromium, WebKit, iPhone 14, and iPad Pro 11 profiles. A clean GitHub Actions WebKit run and the real Safari/iPhone/iPad ordinary-tab and Home Screen matrix remain required.
- The independent Safari Technology Preview Release 248 native-WebDriver smoke test passed on macOS 26.5.2 on 2026-07-22. It created a native automation session and verified the responsive login page's logo, username field, password field type, submit control, control count, and document readiness.
- `npm run cdk:synth`: passed under Node 24 on 2026-07-23. The generated `NaasehEdge` and
  `NaasehProd` templates include the `gsd.thepandas.link` DNS-validated certificate,
  CloudFront-scope WAF, TLS 1.2 CloudFront alias, Route 53 A/AAAA records, private retained buckets,
  web asset publication/invalidation, one deletion-protected/PITR DynamoDB table, retained
  recovery/signing KMS keys, compliance-mode Vault Lock, same-Region backups, quarterly restore
  testing, isolated Step Functions validation/cleanup, and failure alarms. No global table,
  replicated secret, cross-Region/cross-account backup copy, or passive stack is synthesized.
- `npm audit --offline --omit=dev --json`: zero known production dependency vulnerabilities.
- Repository credential-pattern scan: no apparent live AWS access key or private key material. Test-only placeholder passwords/PINs were found only inside assertions.

This is local and synthesized evidence, not production evidence. Physical Safari/Home Screen
checks, deployed Lambda p95 measurements, notification delivery, HTTPS production canaries, and an
isolated AWS restore remain release gates. Earlier dated sections below preserve historical
validation snapshots and may describe architectures that were subsequently removed.

## HTTPS custom-domain delta — 2026-07-23

- Infrastructure type checking and focused foundation, recovery, and telemetry suites passed (21
  tests), and the production web bundle built successfully.
- A real two-stack synthesis for account `093733938983` passed. The edge template uses an
  `us-east-1` ACM certificate and CloudFront-scope WAF; the application template uses
  `gsd.thepandas.link`, Route 53 A/AAAA aliases, HTTPS redirect, minimum TLS 1.2, the WAF ARN,
  exact HTTPS application origins, and CDK-managed asset publication/invalidation.
- Production GitHub deployment now validates the exact domain, zone, HTTPS smoke URL, and smoke
  credentials before deployment evidence can pass. Staging requires a distinct delegated name.

No AWS stack was deployed by this local validation. Live DNS, certificate issuance, CloudFront,
WAF, authenticated canary, GitHub environment, and OIDC role evidence remain external gates.

## Local implementation rerun — 2026-07-23

- `npm run typecheck`, `npm run lint`, and `npm run build` passed after the root TypeScript
  project was updated to include the infrastructure project.
- `npm test` passed 55 files / 175 tests. This includes unit, property-style, integration,
  contract, security, recovery, CDK synthesis, and local performance coverage.
- `npm run test:e2e -- --project=chromium --project=webkit` passed 38 browser journeys. Four
  deployed-production canary cases were intentionally skipped because no production URL or
  protected smoke credentials were provided locally; the static production smoke shell passed.
- `npm run synth -w @naaseh/infra` passed. The synthesized single stack now includes distinct
  DynamoDB, Secrets Manager, primary wrapping, backup-signing, and recovery wrapping key
  boundaries; signed public-key registry support; two-Region global-table and profile-media
  replication; locked/cross-account backup copies; AWS Backup restore testing; isolated Step
  Functions validation/cleanup; quarterly scheduling; and security/failure alarms.
- Local performance evidence: Argon2id 147.98 ms p50 / 165.97 ms p95 and 50,000-task search
  122.62 ms p50 / 150.60 ms p95.

The local rerun does not close deployed AWS, GitHub environment-protection, production canary,
physical Safari/Home Screen, global-table lag, or isolated restore evidence gates.

## Restore and production hardening rerun — 2026-07-23

- `npm run validate:pre-aws` passed under Node.js 24: runtime enforcement, TypeScript, ESLint,
  58 Vitest files / 188 tests, all workspace builds, and CDK synthesis.
- The synthesized restore path now consumes completed jobs from the quarterly AWS Backup Restore
  Testing plan, validates only `awsbackup-restore-test` DynamoDB/S3 resources with read-only
  probes, enforces the four-hour RTO, and posts SUCCESSFUL/FAILED validation results to AWS Backup.
  AWS Backup—not a disconnected timer or placeholder Lambda—owns the actual restore and cleanup.
- Production workflow security tests passed for main-only deployment, full-SHA known-good rollback,
  protected-environment jobs, OIDC-only AWS credentials, smoke gating, and smoke-failure rollback.
- Local performance measured Argon2id at 191.29 ms p50 / 248.96 ms p95 and 50,000-task search at
  85.65 ms p50 / 232.91 ms p95. Live `npm audit --omit=dev --audit-level=high` found zero
  vulnerabilities.

This rerun does not close the external GitHub environment/OIDC trust inspection, deployed
CloudWatch delivery and threshold calibration, real AWS restore/cryptographic evidence, global-
table timing, or physical Safari/Home Screen gates.

## Final pre-AWS hardening rerun — 2026-07-23

- `npm run validate:pre-aws` passed under Node.js 24: 59 Vitest files / 196 tests, type checking,
  lint, all builds, and infrastructure synthesis.
- The complete Playwright matrix passed 76 local journeys across Chromium, desktop WebKit,
  iPhone WebKit, and iPad WebKit; eight production-only canaries were skipped as designed.
- Restore validation now decodes real DynamoDB attribute maps, verifies the signed manifest for
  the exact recovery point, compares restored inventory counts, requires every retained recovery
  generation, and proves both approved KMS authority wraps decrypt to the same data key.
- GitHub Actions static validation passed for all five workflow files; every external action is
  pinned to a full immutable upstream commit SHA.
- Durable sync telemetry now measures persistent browser outbox depth and oldest-item age instead
  of treating a transmitted batch as backlog.

AWS deployment is still required for Lambda Argon2 calibration, cross-account KMS/restore proof,
CloudWatch delivery and threshold evidence, GitHub environment/OIDC inspection, global-table lag,
production canaries, and quarterly restore evidence. Physical ordinary-tab/Home-Screen testing
also remains external.

## Final local-only completion gate — 2026-07-23

- The clean Node.js 24 `npm run validate` gate passed: runtime enforcement, TypeScript, ESLint,
  59 Vitest files / 196 tests, all workspace builds, and the production PWA bundle.
- `npm run cdk:synth` passed after the final retention-policy changes. Both replicated runtime
  secrets synthesize with `DeletionPolicy` and `UpdateReplacePolicy` set to `Retain`.
- `npm run validate:workflows` passed for all five workflow files; every external action is pinned
  to an immutable 40-character commit SHA.
- `npm audit --offline --omit=dev --json` reported zero known production dependency
  vulnerabilities across 452 production dependencies.
- The latest local performance samples measured Argon2id verification at 189.63 ms p50 /
  197.60 ms p95 and 50,000-task search at 114.80 ms p50 / 149.87 ms p95.

The repository-wide Prettier check now passes for maintained product and operations files; Spec
Kit's own agent/template trees are intentionally excluded. All remaining unchecked tasks require
external AWS, GitHub, or physical-device evidence and therefore remain intentionally open.

## Complete local pre-AWS gate — 2026-07-23

- `npm run validate:pre-aws:browsers` passed under Node.js 24. It enforced TypeScript, ESLint,
  Prettier, immutable GitHub Action pins, Python operator tests, all workspace builds, and CDK
  synthesis.
- Vitest passed 108 files / 284 unit, contract, integration, security, restore, and performance
  tests. Enforced core coverage was 97.05% lines, 85.88% functions, and 83.02% branches.
- Playwright passed 116 Chromium, desktop WebKit, iPhone, and iPad journeys. Eight deployed-only
  production canaries skipped as designed.
- Native Safari Technology Preview WebDriver smoke testing passed after clearing retained browser
  session state before verifying the branded responsive sign-in screen.
- All four remaining GitHub workflows passed immutable-action validation. The obsolete duplicate
  production deployment workflow was removed so the protected, rollback-capable workflow is the
  only GitHub production path.
- A high-confidence credential scan found no AWS access keys, private keys, GitHub tokens, or Slack
  tokens in repository content. Only `.env.example` is present; real `.env` files are ignored.

The code is locally ready for review, but a deployment cannot be reproduced from Git yet: only the
README and logo are currently tracked, while the application and its deployment files remain
untracked. They must be reviewed and committed before CI or deployment. AWS/GitHub configuration,
deployed canaries, CloudWatch evidence, and real restore/device evidence remain external gates.

## Single-Region and administrator delta — 2026-07-23

- `python3 -m unittest discover -s scripts/tests -p 'test_*.py'`: 5 tests passed. Coverage
  includes user/admin roles, `us-west-2` enforcement, hidden confirmation, standard-input mode,
  profile/idempotency forwarding, stable exit codes, strict response parsing, and redacted output.
- `npm run typecheck`, `npm run lint`, and `npm run build`: passed. The API, PWA production
  bundle, infrastructure, shared provisioning schemas, and admin interfaces compile cleanly.
- `npm test`: 63 files / 206 tests passed. This includes unit, integration, contract, security,
  performance, recovery, observability, and synthesized infrastructure coverage.
- `npm run cdk:synth`: passed. The template contains one retained/PITR DynamoDB table in
  `us-west-2`, local retained KMS/secrets/media, a locked same-Region vault, quarterly restore
  testing, the provisioning Lambda, its narrowly scoped data/pepper role, and an invoke-only
  operator policy. No global table or backup copy action is synthesized.
- `npm run validate:workflows`: all 5 workflow files passed immutable-action validation. Staging,
  production, and rollback now configure `us-west-2` and no longer supply recovery-account or
  recovery-Region context values.
- `npx playwright test tests/e2e/admin.spec.ts --project=chromium --project=webkit`: 4 tests
  passed. User creation, admin role selection, responsive status management, absence of the admin
  surface for regular users, private-data non-display, and online-only disclosure were exercised.

The automated same-Region restore fixtures passed with a 240-second RPO and 14,100-second full
restore RTO; the AWS Backup job validator fixture completed in 300 seconds. It verified exact
`us-west-2` plan/resource/recovery-point identities, a locked local recovery point, signed
manifest/count integrity, every retained recovery generation, 32-byte DEK validation, content-free
failure reporting, and workflow cleanup/failure routing. The CLI/admin scenarios verified that
passwords/PINs/hashes are absent from process arguments, output, returned views, and allowlisted
logs; ordinary users cannot mutate users/categories; and self/last-admin lockout is prevented.

These are local/synthesized scenarios. A real AWS Backup restore, actual temporary-resource
deletion, deployed CloudWatch sampling, and measured production RPO/RTO remain external release
evidence. Total loss of `us-west-2` is explicitly outside v1 scope.
