# Security release review

Reviewed authentication hashing and enumeration behavior, opaque cookie flags, CSRF/origin primitives, owner-only authorization, sync conflicts, offline-cache purge, CSP, dependency pins, recovery authorization, hidden-memo AAD/wrapping, and recursive log redaction. Production dependency audit reports no known vulnerabilities from the current cached advisory set. No credential, session, PIN, plaintext hidden memo, or key material is intentionally logged. Live penetration, IAM Access Analyzer, WAF tuning, and deployed log sampling remain production gates.

## Single-Region and administrator delta — 2026-07-23

The new review confirms production is fixed to `us-west-2`; global-table, passive stack,
cross-Region copy, replicated secret/media, and recovery-account authority paths were removed.
PITR, compliance-mode Vault Lock, retained keys/secret versions, signed manifests, and isolated
restore testing remain. Total Region loss is an accepted and documented v1 limitation.

User creation uses a schema-versioned shared service with canonical usernames, Argon2id password
and PIN hashes, conditional transactional writes, idempotency tokens, and allowlisted results.
The Python command accepts no credential arguments and the operator IAM policy grants only
provisioning-Lambda invocation. Admin routes retain session, same-origin, CSRF, role, self/last
admin lockout, immutable audit, and private-data boundaries. Deployed CloudTrail/IAM Access
Analyzer and log sampling remain external evidence gates.
