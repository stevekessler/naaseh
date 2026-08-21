# Task security modernization threat review

Date: 2026-08-14

Status: local design and automated controls pass; deployed recovery, CloudTrail, WAF, alarm-delivery, and restore evidence remain release-environment gates.

## Reviewed boundaries

- **Authentication:** opaque sessions are unchanged. Pre-auth transactions are five-minute, purpose-bound, rate-limited, and cannot authorize protected routes. Administrator TFA is enforced server-side. Password reset requires the account PIN and increments session epoch.
- **Factor recovery:** seeds use KMS encryption context, recovery codes are digest-only and one-use, security responses are `no-store`, and the recovery operator cannot decrypt factors. Recovery revokes sessions and forces enrollment.
- **Browser cache:** a restored session is validated before cached data unlocks. Revocation atomically purges protected stores and dependent mutations. Validation failure keeps the cache locked.
- **Task authorization:** owner/group/lock policy remains server-enforced on direct, sync, search, rank, attachment, report, and export paths. UI routing is not an authorization control.
- **Hidden data:** the rich memo allowlist is stored as a validated document, rendered without arbitrary HTML, and encrypted with its text projection when hidden. Hidden plaintext/document content is excluded from indexes, logs, telemetry, and CSV.
- **Timer privacy:** the owner ID is the aggregate identity. Non-owner commands and lost task authorization are rejected. Timer state is absent from collaborator/admin task feeds, reports, Google sync, and completed-task events. Revocation purges dependent cached timer state.
- **CSV:** rows and fields are reauthorized; the fixed contract excludes secrets/cipher packages/object paths; formula-leading cells are neutralized; result access is owner-scoped and available only after integrity checks.
- **Dependencies:** TOTP, Downshift, Lexical, and dnd-kit are bounded to their stated roles. No jQuery/Select2 runtime, sanitizer, timezone package, icon library, always-on component, or device-bound credential was added.

## Abuse and failure behavior

Wrong usernames, passwords, PINs, factors, and recovery codes return generic failures. Replay, stale TOTP counters, reused recovery codes, expired login transactions, wrong purpose, session-epoch mismatch, non-owner timer actions, stale versions, unauthorized export access, and partial export results fail closed. Offline security/admin/export actions are not queued as successes. Timer, task, rank, memo, amount, and color conflicts remain visible and durable.

## Protected-data logging review

Allowed telemetry is limited to correlation ID, bounded action/outcome/reason class, duration, version, and count buckets. Passwords, PINs, codes, factor state detail, seeds/digests/ciphertext, cookies/tokens, task/user identifiers where unnecessary, labels, memo documents, timer anchors/payloads, combobox queries, CSV rows, object paths, and signed URLs are prohibited. Redaction and observability tests cover these classifications.

## Evidence

The feature-specific boundary suite is `tests/security/task-security-modernization-boundaries.security.test.ts`; existing authentication, TFA/reset, recovery, hidden memo, offline cache, private task, group/list sharing, rank isolation, completion export, and observability security suites provide layer-specific negatives. Infrastructure assertions cover KMS context, IAM separation, WAF, CloudTrail, private S3, retention, backup, and recovery wiring.

## Release gates

Before production, record a real recovery-operator CloudTrail event, deployed alarm and log delivery without protected content, WAF/rate-limit behavior, and an isolated AWS Backup restore-test result. These require deployed resources and are not represented as locally passing evidence.
