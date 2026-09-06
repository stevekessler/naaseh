# Journal Crypto and Recovery Contract

## Ordinary unlock

1. Owner authenticates to the application.
2. Client reads its owner-bound JournalKeyEnvelope or its previously synchronized local copy.
3. Owner enters the journal PIN; Argon2id derives the wrapping key.
4. Client authenticates and unwraps the JMK, imports it as a non-extractable HKDF base key, and starts a five-minute `UnlockSession`.
5. Wrong PIN, malformed wrap, unsupported key version, AAD mismatch, or decryption failure returns one generic unlock error and renders no partial data.
6. Tab hiding, logout, session revocation, timeout, or explicit lock clears all in-memory journal keys and decrypted caches.

The PIN and JMK never leave the browser. The owner wrap and recovery wrap never enter telemetry.

## Enrollment and PIN change

- First use generates the JMK, owner wrap, and recovery wrap in-browser after validating the signed recovery public-key registry.
- Key-envelope create is conditional on no existing record.
- PIN change requires current unlock/reauthentication and replaces only the owner wrap with `If-Match`; journal ciphertext and recovery wrap remain unchanged.
- A failed/conflicted wrap update leaves the prior wrap usable and the new PIN unconfirmed.

## Two-party recovery state machine

| Transition | Actor and proof | Result |
|---|---|---|
| `none → requested` | Owner session, CSRF, recent password verification, reason, one-use RSA public key | Five-minute request bound to owner/session/key/public-key digests |
| `requested → adminApproved` | Designated recovery role, fresh password plus TOTP/recovery code, exact request approval ID | Approval recorded; no key/content returned to admin |
| `adminApproved → rewrapped` | Isolated recovery Lambda only | Recovery-wrapped JMK decrypted transiently and immediately encrypted to owner public key |
| `rewrapped → consumed` | Same owner session/browser private key | Owner imports non-extractable JMK; result becomes non-replayable |
| `consumed → completed` | Owner sets new PIN; conditional key-envelope update | Replacement owner wrap stored; session epoch advances |
| Any live state → `cancelled|expired|denied` | Owner cancel, timeout, or failed control | No JMK result and no envelope change |

### Mandatory controls

- Request lifetime: five minutes.
- One result consumption and one completion; replays fail generically.
- Owner session epoch, key-envelope version, recovery-key version, and ephemeral-key fingerprint must still match.
- Owner must explicitly initiate; ordinary or recovery administrators cannot create a request for another user.
- Ordinary `role=admin` is insufficient. Approval requires the designated recovery authority plus fresh password and TFA.
- The only `kms:Decrypt` runtime grant belongs to the reserved-concurrency-one recovery Lambda.
- Recovery Lambda accepts only stored, server-validated request/wrap identifiers—never arbitrary caller-supplied ciphertext.
- Raw JMK bytes are zeroed immediately after re-encryption and never returned to the administrator, logs, errors, traces, or durable storage.
- Recovery endpoints cannot list/read/edit journal records, compute dashboards, export, delete, rotate recovery keys, or alter KMS policy.

## Tamper-evident audit

Append an event for request, approval, denial, rewrap, consumption, completion, expiry, cancellation, and attempted reuse. Events contain only approved opaque identifiers and digests, operation/state/outcome, key version, correlation ID, latency, timestamp, previous hash, and event hash. Conditional append prevents overwrite. Sign the terminal chain head with the existing manifest-signing KMS key and retain audit rows with journal backups.

The documented reason is accepted transiently but only a digest is persisted. CloudWatch uses a smaller positive allowlist and 90-day retention. CloudTrail independently records KMS decrypt/sign and policy activity.

## Threat boundaries

- The unlocked owner browser and isolated recovery Lambda transient memory are the only JMK/plaintext boundaries.
- Same-origin script compromise while unlocked can read rendered journal data; mitigate with existing strict CSP, dependency review, no third-party scripts, short unlock lifetime, visibility locking, and structural rich-text rendering.
- Database/API/admin compromise exposes ciphertext, owner routing IDs, operational timestamps, and access patterns but not plaintext dates/content or the date-token key.
- Recovery Lambda compromise still requires one valid owner-bound approved request to target a JMK. It cannot enumerate plaintext or accept arbitrary wraps.
- Single-region loss remains governed by the existing backup/recovery architecture and documented regional risk.
