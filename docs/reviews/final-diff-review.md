# Implementation review

Reviewed on 2026-07-22 against the v1 constitution, specification, plan, and task list.

The current baseline has server-side authorization, generic authentication failures, opaque revocable sessions, strict cookie/CSRF/origin protections, permanent log redaction, encrypted browser records, explicit sync conflicts, private-task audience separation, immutable task revisions, Argon2id password/PIN protection, and retained/replicated backup infrastructure. During this review, arbitrary-HTTPS origin trust, a task-route fallthrough, an IndexedDB key-creation race, and encrypted live-query refresh loss were found and corrected.

No known path intentionally logs task labels, memos, credentials, cookies, PINs, ciphertext, or key material. Verbose logging remains opt-in only for literal `true` and cannot disable redaction. Production dependency audit reports zero known vulnerabilities.

The code is a first deployable baseline, not a production approval. Open tasks accurately retain work that requires broader behavior, stronger test depth, deployed AWS evidence, real-device Safari evidence, notification scheduling, full admin/collaboration routes, and an exercised restore. Those items must not be inferred complete from local constants, mocks, or synthesized infrastructure.

## Local completion review — 2026-07-23

The remaining locally implementable work was reviewed against the specification, plan, task list, and constitution. The implementation now includes dedicated data, secrets, media, backup, recovery-key, restore-workflow, collaboration, and admin infrastructure; signed public-key registry handling; manifest integrity and inventory validation; scheduled isolated-restore orchestration; and production workflow and smoke-test gates.

The review specifically rechecked data-boundary scoping, distinct recovery key purposes, retained encrypted storage, destructive-action denial, restore failure cleanup, route authorization, media-prefix restrictions, log redaction, and disabled Step Functions execution-data logging. Local type checking, linting, unit/integration tests, browser tests, CDK synthesis, and immutable GitHub Action reference validation provide the local evidence.

This is still not production approval. T045, T162, T163, T167, T168, T170, T172, and T175 remain open because their acceptance criteria require a deployed AWS environment, production GitHub environment settings, real Apple devices, live performance/observability measurements, or an exercised isolated restore. Those gates must be completed with external evidence before final release approval.

## Restore, telemetry, and workflow review — 2026-07-23

The final pre-AWS review found and corrected two release-significant edge cases. The restore
validator now unmarshals the low-level records returned by the real DynamoDB client instead of
assuming document-shaped test objects. The post-it completion animation no longer shrinks its
interactive control below the 44px accessibility floor while the animation is running.

The restore path was then re-reviewed for content disclosure and fail-closed behavior. It verifies
the manifest hash/signature before trusting counts, binds manifests to the exact recovery point,
accepts only AWS Backup isolated resources and the two configured KMS authorities, validates every
required generation, decrypts both authority wraps, compares recovered keys in constant time, and
zeroes plaintext buffers. Logs and returned evidence remain content-free.

The durable outbox telemetry, Argon2 calibration contract, immutable GitHub Action pinning, and
static workflow gate were also reviewed. Node.js 24 local gates passed 59 files / 196 tests; the
final Playwright run passed 76 local Chromium/WebKit/mobile-WebKit journeys with only eight
deployment-only canaries skipped. No additional locally reproducible correctness or security issue
was found. The eight open tasks remain external-evidence gates, not unfinished local application
code.

## Single-Region and administrator delta review — 2026-07-23

The final delta was re-reviewed for authorization bypass, credential disclosure, idempotency
races, administrator lockout, key/data loss, unsupported Region paths, unnecessary AWS resources,
logging, and test quality. The review found stale `us-east-1` and recovery-account inputs in the
deployment workflows, environment defaults, telemetry fixture, and first-deployment runbook; all
were corrected to the validated `us-west-2` single-stack model. No deployable global table,
passive stack, cross-Region copy action, or replicated secret/media/key path remains.

Provisioning canonicalizes and conditionally claims usernames, transactionally records the
idempotency result, hashes password and PIN with the configured Argon2id/pepper boundary, and
returns only the user allowlist. A retry with the same token returns the prior result; token reuse
for a different username/role and username conflicts fail closed. The operator policy can invoke
only the provisioning Lambda; that Lambda has only DynamoDB get/transaction-write, pepper read,
KMS-via-Secrets-Manager, and basic log rights. Neither CLI nor browser persists or prints the
write-only credentials.

The shared admin guard protects user/category mutations, while category reads remain available to
authenticated users. Session epoch revocation, self-disable rejection, last-active-admin rejection,
immutable content-free audit records, and existing owner/private/hidden-memo authorization remain
in force. Recovery retains PITR, Vault Lock, versioned storage and cryptographic material, signed
regional manifests, and isolated testing while documenting total Region loss as an accepted v1
limitation. Local validation is green; external AWS restore/deletion/log evidence is not inferred
from mocks or synthesis.
