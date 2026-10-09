# Architecture overview

The installable React PWA keeps encrypted IndexedDB state and atomically queues local mutations.
Foreground sync pushes idempotent changes and pulls authorized public/owner feeds. Same-origin
delivery at `https://gsd.thepandas.link` uses Route 53 and CloudFront in front of a private S3
origin and bounded Node.js 24 Lambdas. HTTP redirects to HTTPS and CloudFront requires TLS 1.2 or
newer. The DNS-validated ACM certificate and CloudFront-scope WAF live in the required `us-east-1`
edge-control stack; the application and all data remain in `us-west-2`. One on-demand,
deletion-protected DynamoDB table in `us-west-2` stores current state, immutable revisions, feeds,
and idempotency records. Authentication uses Argon2id, a versioned Secrets Manager pepper, and
revocable opaque cookies.

Application administrators may manage users and categories but gain no access to another user's
private tasks, revisions, groups, or hidden-memo plaintext. Both the browser admin page and the
IAM-invoked provisioning Lambda use one schema and provisioning service. The Python command keeps
password/PIN values out of process arguments and invokes only that Lambda.

Hidden memos use browser AES-GCM plus one signed-registry RSA recovery wrap per retained key
generation. Recovery material, runtime secret versions, profile-media versions, DynamoDB PITR,
daily same-Region AWS Backup points, compliance-mode Vault Lock, signed manifests, and quarterly
isolated restore testing are retained. There is no global-table replica, passive stack,
cross-Region backup copy, or replicated secret/key/media architecture. Total `us-west-2` loss is
outside v1 scope.

Native SwiftUI clients add a universal iPhone/iPad OS 27 application and a native arm64 macOS 27
desktop application. They share Swift wire contracts, crypto, encrypted SwiftData/outbox, sync,
service, feature, and design-system packages. All use the existing production API and authorization
model; compatibility and privacy-safe telemetry reuse the request-driven sync Lambda and its
CloudWatch log group, and native alerts reuse the existing notification path. App Intents route
Siri task creation through the same idempotent task command service as UI and alert actions. The web
application remains the sole administration, provisioning, Project/Category lifecycle, and
recovery-operator interface. See [native security and sync](native-apple-security-sync.md).
