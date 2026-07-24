# Research: Na'aseh v1 Baseline

## 1. Application and Runtime Stack

**Decision**: Use TypeScript across the React 19/Vite browser application, Node.js 24 Lambda
functions, shared domain/contracts packages, and AWS CDK v2 infrastructure. Use Python 3.12+
only for the requested operator command in `scripts/create_user.py`.

**Rationale**: One language and lockfile reduce maintenance for a sole developer. React 19
is stable, Node.js 24 is a supported Lambda runtime on Amazon Linux 2023, and TypeScript is
a stable CDK language. Pin dependency versions and the CDK toolkit in the repository.

**Alternatives considered**: Next.js adds server-rendering and hosting complexity without a
v1 requirement. Reimplementing domain services in Python would split the toolchain, so the
Python command remains a thin Boto3 client of the backend provisioning Lambda. A native app
would solve stronger offline notification scheduling but violate the web-first baseline.

**Sources**: [React 19](https://react.dev/blog/2024/12/05/react-19),
[Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html),
[CDK with TypeScript](https://docs.aws.amazon.com/cdk/v2/guide/work-with-cdk-typescript.html).

## 2. Static Delivery and API

**Decision**: Serve versioned PWA assets from a private S3 bucket through CloudFront Origin
Access Control. Route same-origin `/api/v1/*` traffic through CloudFront to an API Gateway HTTP
API with separate auth, core/sync, admin, notification, and recovery Lambdas.

**Rationale**: This is fully managed and usage-priced. Same-origin delivery simplifies
Secure cookie and CSRF policy. Function boundaries keep expensive Argon2 settings and
high-impact recovery permissions away from ordinary task handlers.

**Alternatives considered**: Amplify Hosting adds another control plane. API Gateway REST
API adds features and cost not needed behind CloudFront/WAF. A monolithic Lambda broadens
permissions and forces all routes to use auth-sized memory.

**Sources**: [CloudFront OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html),
[HTTP vs REST APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html).

## 3. DynamoDB and Search

**Decision**: Use one on-demand DynamoDB table in `us-west-2` with current entity items, immutable
revision/change items, idempotency records, and explicit GSIs for public, private-owner,
assignee, category, and due-date access. Synchronize the complete authorized v1 working set
to IndexedDB and run label/memo prefix/fuzzy search locally with MiniSearch.

**Rationale**: DynamoDB supports known key access patterns but not arbitrary full text.
Request-path scans consume capacity before filtering and are rejected. The small v1 corpus
can be searched responsively in the browser and remains searchable offline. Hidden memo
tokens exist only in memory after unlock.

**Alternatives considered**: OpenSearch adds an always-on/serverless collection cost floor
and risks plaintext indexing. Persisted trigram items increase write/storage cost and can be
added only if measured local search limits are exceeded.

**Sources**: [DynamoDB Scan behavior](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html),
[secondary indexes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/SecondaryIndexes.html),
[MiniSearch](https://lucaong.github.io/minisearch/).

## 4. Offline Storage and Synchronization

**Decision**: Use Dexie over IndexedDB. In one transaction, every local mutation updates the
local entity and enqueues an immutable outbox operation. Drain on startup, visibility,
online events, and successful foreground requests. Treat Background Sync only as optional.
Use mutation IDs, base versions, optimistic concurrency, server cursors, and explicit 409
conflicts; auto-merge only provably non-overlapping fields.

**Rationale**: WebKit storage is best-effort unless persistence is granted, and Safari does
not provide dependable Background Sync. The outbox must survive reloads, show pending state,
and never depend on a background callback. Same-field edits and delete/update conflicts
must not silently last-write-win.

**Alternatives considered**: Cache API storage for authenticated JSON lacks domain
transactions. Service-worker-only mutation queues are harder to inspect and cannot be
relied on in Safari.

**Sources**: [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/),
[Storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria),
[Background Sync](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API).

## 5. Service Worker and Updates

**Decision**: Precache the application shell and immutable fingerprinted assets with
Workbox. Never Cache-API-store authenticated JSON, tokens, or cryptographic packages. Prompt
for an update rather than unconditionally activating a new worker while unsynced edits exist.

**Rationale**: Domain data belongs in the encrypted, schema-versioned IndexedDB layer.
Separating asset caching from data synchronization avoids stale authorization leaks and
unsafe mutation replay.

**Alternatives considered**: Broad runtime caching is simpler initially but duplicates
state and makes revocation and schema upgrades unreliable.

**Sources**: [Workbox precaching](https://developer.chrome.com/docs/workbox/modules/workbox-precaching),
[runtime caching](https://developer.chrome.com/docs/workbox/caching-resources-during-runtime).

## 6. Authentication and Sessions

**Decision**: Canonicalize usernames and store PHC-format Argon2id verifiers with unique
salts and a versioned application pepper from Secrets Manager. Begin calibration at
`m=131072 KiB, t=2, p=1`, never below 100 MiB, and select the highest iteration count whose
deployed Lambda verification remains at or below one second p95. Use a dummy verifier for
unknown usernames. Issue 256-bit opaque sessions in Secure, HttpOnly, SameSite=Strict,
`__Host-` cookies and store only token digests with expiry/revocation in DynamoDB.

**Rationale**: Calibration maximizes attacker cost within the explicit latency budget.
Opaque sessions provide immediate revocation without JWT denylist/key complexity. Origin
checks plus CSRF tokens protect state-changing cookie requests.

**Alternatives considered**: Cognito conflicts with required password hashing. JWTs add no
benefit for one backend. Password encryption is prohibited.

**Sources**: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html),
[RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.html),
[OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[Lambda memory/CPU](https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html).

## 7. Hidden Memo Encryption

**Decision**: Generate a random AES-256-GCM data-encryption key (DEK) for each hidden memo
and bind memo/scope/schema/key-version metadata as authenticated additional data. Wrap the
DEK with a PIN-derived key from pinned Argon2id WebAssembly for offline access. Also wrap it
to the active versioned single-Region recovery KMS public key in `us-west-2`. Persist only
ciphertext, IVs, salts, parameters, wrapped keys, and versions.

**Rationale**: The browser can encrypt and create all wraps while offline using cached KMS
public keys. KMS private key material never leaves KMS. Recovery roles can unwrap a DEK but
normal API roles cannot. Plaintext and hidden-memo search tokens exist only in memory during
an unlocked session.

**Alternatives considered**: PIN-only wrap makes forgotten PINs permanent data loss.
Server-side memo encryption exposes plaintext to ordinary handlers. A short PIN still
permits offline guessing; six digits plus Argon2id raises cost but does not eliminate risk.

**Sources**: [Web Crypto](https://www.w3.org/TR/webcrypto-2/),
[OWASP cryptographic storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html),
[KMS asymmetric keys](https://docs.aws.amazon.com/kms/latest/developerguide/symmetric-asymmetric.html).

## 8. Cryptographic Recovery and Secrets

**Decision**: Use customer-managed asymmetric single-Region KMS keys in `us-west-2` for
recovery wrapping and backup-manifest signing. Use Secrets Manager in the same Region for the
password pepper, Web Push private key, and other runtime secrets. Recovery decrypt permission
belongs only to a dedicated recovery role. Retain all key versions referenced by a retained
backup, deny routine deletion, and alarm on key/recovery policy changes.

**Rationale**: This preserves separation between routine application access and recovery
decrypt access without creating a secondary-Region key or secret topology. Secrets Manager
remains the approved boundary for application secrets, while KMS is the safer root for
non-exportable encryption keys. The retained key and secret inventory is part of every
backup manifest and restore test.

**Alternatives considered**: Multi-Region KMS keys and Secrets replication are deferred by
the one-Region requirement. Exporting raw master keys complicates control and auditing. One
Secrets Manager version chain is not an archival key registry, so backup manifests must
track every retained version and block premature deletion.

**Sources**: [KMS key concepts](https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html),
[Secrets best practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html).

## 9. Backup and Disaster Recovery

**Decision**: Deploy the complete live architecture only in `us-west-2`. Use a regional
DynamoDB table with PITR and deletion protection, S3 versioning, and daily AWS Backup recovery
points in a locked same-Region vault. Keep the backup vault, recovery keys, secrets, and
signed backup manifests in `us-west-2`; do not create global-table replicas, cross-Region
copies, replicated secrets/keys, or a warm/passive stack. Quarterly Step Functions restore
tests create isolated temporary resources in `us-west-2` and verify entity counts, integrity,
authorization, key generations, and hidden-memo recovery within four hours.

**Rationale**: DynamoDB PITR supplies continuous recovery points with per-second granularity,
and AWS Backup adds scheduled recovery points, Vault Lock immutability, and managed restore
testing without paying for duplicate live infrastructure. A backup is invalid if required
key wraps or secret/key versions are missing. This covers data-store, deployment, and common
operator failures at low cost.

**Alternatives considered**: A two-Region global table and regional failover stack provide
stronger Region-loss recovery but contradict the approved v1 scope and add replicated writes,
keys, secrets, deployment, and operating complexity. PITR without AWS Backup is cheaper but
lacks the requested independent scheduled backup, vault-lock, and restore-testing controls.
Total loss or prolonged unavailability of `us-west-2` remains an explicit v1 limitation.

**Sources**: [DynamoDB PITR](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Point-in-time-recovery.html),
[advanced DynamoDB backup](https://docs.aws.amazon.com/aws-backup/latest/devguide/advanced-ddb-backup.html),
[AWS Backup restore testing](https://docs.aws.amazon.com/aws-backup/latest/devguide/restore-testing.html).

## 10. Browser Reminders

**Decision**: Show local due reminders from IndexedDB while the page/PWA is executing.
Schedule generic Web Push through EventBridge Scheduler for closed applications when the
device is connected. If neither can fire, show overdue reminders immediately on next open.
Never include private labels or memo text in push payloads.

**Rationale**: No portable web API schedules a future OS notification after an offline web
app is closed or suspended. iOS/iPadOS Web Push requires a Home Screen app and user-gesture
permission. Product copy and tests must state these limits rather than promise impossible
closed-and-offline delivery.

**Alternatives considered**: A native wrapper could provide platform alarms but is outside
the web baseline. Timers and Background Sync are not reliable closed-app schedulers.

**Sources**: [showNotification](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification),
[Web Push on iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## 11. Observability and Verbosity

**Decision**: Use the workspace `@naaseh/observability` package as the single structured JSON
logging and CloudWatch embedded-metrics implementation. Parse verbose logging as
enabled only when `VERBOSE_LOGGING === "true"`; every other value is false. Route normal and
verbose events through the same redaction allowlist. Use CloudTrail for IAM/KMS/Secrets
control-plane audit and CloudWatch for application/operational alarms.

**Rationale**: Detailed safe context speeds diagnosis without turning verbose mode into a
data-exposure path. Explicit retention prevents indefinite low-value log cost.

**Alternatives considered**: X-Ray is deferred because HTTP APIs do not provide the same
REST API tracing capability and correlation IDs are adequate for the v1 service count.

**Sources**: [Lambda logging](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-logs.html),
[CloudWatch embedded metric format](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format.html).

## 12. CI/CD and Browser Validation

**Decision**: GitHub Actions uses OIDC/STS temporary credentials and separate validation,
staging, and production roles. Required checks cover lint/typecheck, unit/property,
integration/contract, security, CDK synth/diff, Playwright Chromium/WebKit, and smoke tests.
Production uses a protected GitHub environment. Real Safari/iPhone/iPad validation is a
release checklist because Playwright WebKit is not branded Safari.

**Rationale**: OIDC removes static AWS access keys. Protected environments and narrowly
scoped trust policies constrain production deployment.

**Alternatives considered**: Static IAM keys are rejected. CodeBuild-hosted runners are
unnecessary until private networking or heavier compute is required.

**Sources**: [AWS OIDC federation](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_oidc.html),
[Playwright browsers](https://playwright.dev/docs/browsers),
[Playwright emulation](https://playwright.dev/docs/emulation/).

## 13. User-Provisioning CLI and Administration Rights

**Decision**: Add `scripts/create_user.py` as a thin Python 3.12+ operator client. Use
`argparse` for `--username`, optional `--display-name`, `--role {user,admin}`, `--profile`,
and `--region` (default `us-west-2`). Read the password and required user PIN twice with
`getpass`, or from explicitly selected standard input for noninteractive automation; never
support password/PIN argv flags. Use Boto3 and the operator's AWS credentials to invoke the
dedicated provisioning Lambda, which performs canonicalization, validation, Argon2id hashing,
conditional persistence, and audit logging. Return only user ID, canonical username, role,
and status. Application `admin` sessions may add/list/disable/reactivate users and
create/update/archive categories; regular users may only read categories. Admin status does
not broaden task, group, private-task, revision, or hidden-memo access.

**Rationale**: A signed Lambda invocation supports bootstrapping the first administrator and
keeps DynamoDB, pepper, and hash implementation details out of the operator workstation.
Secure prompts avoid shell history and process-list disclosure. Reusing the backend service
prevents the CLI and web administration path from drifting. The role matrix gives the
smallest useful administrative scope without turning `admin` into a data-superuser.

**Alternatives considered**: Positional password/PIN arguments are rejected because they can
leak through shell history and process inspection. Direct DynamoDB writes are rejected
because they bypass validation, hashing, conditional uniqueness, and auditing. Giving admins
blanket access to user data is rejected because it violates private-data boundaries.

**Sources**: [Python argparse](https://docs.python.org/3/library/argparse.html),
[Python getpass](https://docs.python.org/3/library/getpass.html),
[AWS Region configuration](https://docs.aws.amazon.com/sdkref/latest/guide/feature-region.html).
