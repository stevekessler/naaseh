# Research: Journal Crisis Plan

This research resolves the technical unknowns in [plan.md](plan.md). The design assumes feature 010 is implemented first and treats its JMK, ciphertext-only journal sync, recovery, and rich-text rules as binding dependencies.

## 1. Dependency on the private journal foundation

**Decision**: Implement this feature as a schema/contract delta on feature 010, not as an independent journal or encryption system. Reuse the JMK enrollment/unlock/recovery flow, owner feed, rich-text AST allowlist, ciphertext envelope, date-entry model, and journal lock lifecycle.

**Rationale**: The trigger fields, WYSIWYG journal fields, owner unlock boundary, and ciphertext-only sync are already specified in `specs/010-private-journal`. A second key hierarchy or duplicate Journal route would create conflicting behavior and expand the recovery and privacy surface.

**Alternatives considered**:

- Build crisis plans before feature 010 and use the general task device key: rejected because it lacks the journal PIN/unlock and administrator-exclusion boundary.
- Merge the two feature specs: rejected because the user created a separately clarified feature and downstream tasks need an explicit dependency.

## 2. Crisis-plan content encryption

**Decision**: Generate a random 256-bit Crisis Plan Content Key (CPK) in the owner browser. Encrypt the normalized Lexical document with AES-256-GCM, a fresh 96-bit IV, and canonical AAD containing schema version, owner ID, plan ID, plan version, and key generation. Wrap the CPK for the owner with a JMK-derived AES-256-GCM key using a domain-separated HKDF label. Never encrypt plan content directly with a recipient or KMS key.

**Rationale**: A separate CPK allows sharing and revocation without exposing or rotating the owner's JMK or re-encrypting unrelated journal entries. AES-GCM supplies authenticated encryption and is already available in the repository's Web Crypto patterns. MDN documents AES-GCM as the authenticated mode to prefer and Web Crypto HKDF as appropriate for deriving keys from high-entropy master material ([SubtleCrypto.encrypt](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt), [SubtleCrypto.deriveKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey)).

**Alternatives considered**:

- Derive the plan key directly from the JMK: rejected because recipients would require the JMK or a separate copy of plan ciphertext per recipient.
- Encrypt one full body per recipient: rejected because every edit multiplies storage/writes and makes consistency harder.
- Server-side plaintext encryption: rejected because ordinary server paths must remain ciphertext-only.

## 3. Immediate sharing and recipient key grants

**Decision**: Add one dedicated RSA-3072 AWS KMS encryption key for crisis-plan sharing. Publish its `RSAES_OAEP_SHA_256` public key through the repository's signed key-registry pattern. For each recipient, the owner browser encrypts a compact binary grant containing the 32-byte CPK plus SHA-256 bindings for owner, plan, recipient, share version, and key generation. Store only this KMS ciphertext and routing metadata.

The compact grant MUST remain below the RSA-3072/OAEP-SHA-256 318-byte plaintext maximum. The private key never leaves KMS; AWS explicitly supports downloading an asymmetric KMS public key for encryption outside AWS and using KMS for decryption ([asymmetric KMS keys](https://docs.aws.amazon.com/kms/latest/developerguide/symmetric-asymmetric.html), [key-spec limits](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html)).

**Rationale**: The user chose immediate access with no acceptance step. A shared environment public key lets any unlocked owner create a recipient grant without waiting for that recipient to enroll a browser key. Identity bindings prevent moving a grant to another owner, plan, recipient, or generation.

**Alternatives considered**:

- Per-user browser public/private keys: rejected for this release because users who have never opened Journal would lack a public key, private-key recovery adds another credential lifecycle, and persistent private keys work against online-only recipient access.
- One asymmetric KMS key per user: rejected because fixed key cost and lifecycle scale with accounts unnecessarily.
- Reuse the journal recovery KMS key: rejected because it would broaden recovery-key purpose, IAM, audit semantics, and blast radius.
- Symmetric KMS wrapping: rejected because the owner browser cannot call KMS with a plaintext CPK without exposing it to an ordinary server path.

## 4. Online-only recipient open protocol

**Decision**: A recipient browser generates a non-extractable, one-use RSA-OAEP key pair in memory for each open request. A dedicated key-broker Lambda:

1. authenticates the current session through the existing authorizer context;
2. strongly reads the current active share and plan generation;
3. decrypts the stored compact grant with the dedicated KMS key;
4. validates every embedded binding and size/version invariant;
5. re-reads or conditionally confirms that the share/generation did not change;
6. encrypts the raw CPK to the request's one-use public key;
7. zeroes mutable raw-key buffers; and
8. returns the rewrapped CPK plus current plan ciphertext with `Cache-Control: no-store`.

The recipient browser decrypts/render in memory only. Offline events, route changes, tab hiding, logout, session revocation, or open failure remove the ephemeral private key and plan from component state/DOM. Service-worker routing explicitly excludes all shared-plan endpoints.

**Rationale**: The broker sees a CPK transiently but never plan plaintext. The network and ordinary API never receive a raw CPK. A fresh online request and current share check enforce the user's chosen recipient policy. API Gateway authorizer documentation emphasizes route-aware cache keys when authorization is cached; the shared-open route must include the route key or disable caching so authorization cannot bleed across routes ([HTTP API Lambda authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html)).

**Alternatives considered**:

- Return a raw CPK over TLS: rejected because ephemeral browser wrapping reduces accidental intermediary/log exposure.
- Persist recipient ciphertext/key locally: rejected by the clarification that recipients must be online.
- WebSocket push: rejected because refresh-on-tab/focus satisfies discovery without an always-connected service.
- Nitro Enclaves: rejected as disproportionate operational complexity for the current small deployment; the narrowly scoped Lambda/KMS boundary is sufficient when paired with IAM, code review, CloudTrail, and negative tests.

## 5. Revocation and forward access

**Decision**: Owner-initiated revocation requires the owner to be unlocked. Generate a new CPK, re-encrypt the current plan, create a new owner wrap, and create grants for every remaining active recipient. Commit the new plan/generation, remaining grants, target revoked state, and mutation receipt in one conditional `TransactWriteItems` operation. The broker serves only the plan's current committed generation.

Offline owner revocation is an encrypted pending intent and MUST say that access continues until synchronization. Recipient self-removal immediately changes their share to `recipient_removed` and blocks server delivery; it also marks the plan `keyRotationRequired`. Before the next owner update or sharing change, the unlocked owner rotates the CPK and remaining grants. A removed recipient cannot fetch the current ciphertext or key during this interval.

**Rationale**: Rotating the CPK prevents a revoked recipient's previously observed CPK from decrypting future plan versions, even if future ciphertext leaks through an external channel. DynamoDB transactions are atomic and support condition checks and idempotency tokens, with up to 100 actions ([TransactWriteItems](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactWriteItems.html)). The current-account scale and 90-recipient ceiling leave transaction headroom for plan/share/receipt actions.

**Alternatives considered**:

- Authorization-only revocation with a stable CPK: rejected because it protects normal delivery but not future ciphertext confidentiality if the old key/ciphertext is copied outside the application.
- Re-encrypt asynchronously after declaring success: rejected because the UI would claim revocation before the cryptographic boundary changed.
- Step Functions/staged rekey generations: deferred until an owner needs more than 90 simultaneous recipients; current scale does not justify a workflow service.

## 6. Direct-share discovery and user selection

**Decision**: Add an authenticated, rate-limited, paginated shareable-user search returning only active users' ID, username, and display name; exclude the owner and do not expose roles, email, security state, group membership, or inactive accounts. Require a trimmed query before results and cap each page at 20. Present this search through Select2 wrapped behind a React lifecycle adapter that initializes once, synchronizes controlled selection, forwards accessible state, and destroys handlers/DOM augmentation on unmount.

Active shared-plan summaries are queried live from the recipient index whenever `Crisis Plans` opens, regains focus, or the user refreshes. Do not store recipient summaries or content in IndexedDB or the service worker. The owner share manager lists active/revoked/recipient-removed relationships through an owner-authorized endpoint.

Every recipient list, open, refresh, and broker request also checks that the recipient account is currently active. Deletion, deactivation, session invalidation, or loss of application access denies delivery immediately without mutating the owner's plan or other shares. The relationship remains available to the owner for audit and explicit revocation rather than adding an account-lifecycle share state.

**Rationale**: Ordinary users cannot use the admin-only user endpoint. Minimum disclosure enables explicit selection while limiting account enumeration. A live list makes direct sharing appear on the requested tab without adding WebSockets, push notifications, or recipient offline state.

**Alternatives considered**:

- Reuse `/admin/users`: rejected because ordinary users are unauthorized and the response exposes administrative fields.
- Download every user during bootstrap: rejected because it broadens disclosure and creates stale offline identities.
- Send a push notification: rejected because the user requested tab appearance and the spec prohibits automatic crisis-related notifications.

## 7. Plan prerequisite and legacy behavior

**Decision**: Enforce the prerequisite twice. The browser blocks every new-entry route when no locally valid/synchronized-or-pending owner plan exists. The server conditionally rejects every journal-entry create mutation unless the owner has a current non-deleted crisis-plan row. Existing entry updates remain allowed for legacy owners without a plan. Initial plan creation and its existence marker are one atomic server write; no delete/tombstone operation exists.

If the initial plan is pending offline, the owner may proceed with local entry creation only after the plan's local atomic save; the outbox serializes the plan mutation before the entry mutation. The server still checks the plan row, so a reordered or forged entry create fails without partial state.

**Rationale**: UI-only gating is bypassable. Server-only gating gives poor offline behavior. Ordered local durability plus a conditional server invariant satisfies both.

**Alternatives considered**:

- Gate only the literal first entry: rejected because legacy/missing-plan states would leave later trigger behavior without a plan.
- Gate reads/edits of legacy entries: rejected by the clarified spec.

## 8. Owner sync, retry, and conflicts

**Decision**: Advance journal sync contract version from 5 to 6 and add owner-only `crisisPlan` mutations/changes. Plan create/update uses stable mutation IDs, exact base versions, and ciphertext-only payload validation. The local transaction stores plan ciphertext, owner wrap, draft state, and outbox mutation atomically. A version conflict preserves encrypted local and remote variants; after unlock the owner chooses local, remote, or manual reconciliation.

Share create/revoke/remove use dedicated endpoints because they coordinate current authorization and recipient grants. Their pending intents are encrypted locally and drain serially after plan mutations. Unsupported schema/key/share generations preserve ciphertext and block overwrite.

**Rationale**: Extending the journal feed keeps multi-device owner state consistent and reuses tested retry/cursor behavior. Sharing needs stronger multi-entity conditional semantics than a generic mutation.

**Alternatives considered**:

- A separate sync engine: rejected as duplicate retry/conflict complexity.
- Last-write-wins: rejected because a crisis plan cannot be silently overwritten.

## 9. Rich text and triggered display

**Decision**: Reuse the feature-010 Lexical editor/document schema and HTTPS-link allowlist. The crisis plan is exactly one WYSIWYG field; journal structured fields and their existing WYSIWYG fields remain unchanged. Reject empty/formatting-only normalized documents before encryption. When either visible `suicidalBehaviors` or `selfHarmBehaviors` answer is `yes`, render the owner's already-unlocked current plan inline in a prominent labeled region without saving the entry, moving focus unexpectedly, notifying anyone, or snapshotting the plan into the entry.

**Rationale**: One document schema reduces sanitizer drift. Using current form values makes trigger behavior immediate and reversible while preserving the user's draft.

**Alternatives considered**:

- Modal takeover: rejected because it disrupts entry completion and focus.
- Store a plan snapshot per entry: rejected because it duplicates sensitive content and conflicts with “current plan.”
- Add a clinical resource/alert workflow: rejected by clarification and scope.

## 10. Durability, backup, and recovery

**Decision**: Existing DynamoDB PITR and locked AWS Backup include plan/share/grant/receipt rows. Restore validation checks ciphertext envelopes, owner/recipient bindings, current generation, active share state, recipient index consistency, and absence of delete transitions without decrypting content. Feature-010 journal recovery restores the owner's JMK access, which unlocks the CPK owner wrap. The recovery administrator never receives the CPK, plan ciphertext, recipient grants, or share list.

**Rationale**: Reusing journal recovery avoids a second recovery credential. Restore must not resurrect revoked access or roll current-generation pointers backward silently; reconciliation scripts compare version/generation and fail closed.

**Alternatives considered**:

- Separate crisis-plan recovery key: rejected as unnecessary key lifecycle.
- Plaintext operator validation: prohibited by the constitution and spec.

## 11. Observability and abuse controls

**Decision**: Emit only allowlisted, content-free events for plan save/sync, share lifecycle, broker open/deny, KMS outcome, migration, and restore. Use safe correlation/mutation IDs, latency buckets, state class, bounded retry counts, and schema/key/share generations. Never log request/response bodies or raw exception objects. Rate-limit shareable-user search, share mutations, and broker opens per authenticated user plus source signal; return concealed authorization/not-found responses.

CloudWatch alarms cover unusual broker volume, authorization denials, KMS failures, rekey-required backlog, plan sync conflicts, migration failures, and backup/restore validation. CloudTrail records KMS use; 90-day application retention matches feature 010 and cost controls.

**Rationale**: Broker access and user discovery are the main abuse surfaces. Bounded cardinality and explicit redaction retain diagnostic value without sensitive identity/content leakage.

**Alternatives considered**:

- Log ciphertext/grant IDs for debugging: rejected because identifiers and cryptographic artifacts can become sensitive correlation material.
- No broker metrics: rejected because misuse and KMS failures would be invisible.

## 12. AWS cost and simpler alternatives

**Decision**: Use one shared-purpose asymmetric KMS key and on-demand Lambda. AWS currently prices each KMS key at $1/month before usage; asymmetric requests are metered and excluded from the general KMS free tier ([AWS KMS pricing](https://aws.amazon.com/kms/pricing/)). No always-on capacity, new DynamoDB table, queue, stream, WebSocket API, or search service is added.

**Rationale**: Fixed cost remains bounded at one key, and usage scales only with actual recipient opens and mutations. Current users/plans are small enough for on-demand DynamoDB and direct transactions.

**Alternatives considered**:

- Per-user KMS keys: rejected due linear fixed cost.
- CloudHSM/Nitro Enclaves: rejected due disproportionate fixed cost and operations for a personal-wellness deployment.
- Client-only per-user keys: cheaper in AWS but materially more complex for onboarding, recovery, and online-only enforcement.

## 13. Compliance posture

**Decision**: Treat the feature as private personal-wellness functionality. Do not claim HIPAA compliance, clinical monitoring, diagnosis, crisis intervention, or emergency response. Retain strong encryption, authorization, backup, audit, and breach-prevention controls because the content is sensitive regardless of regulatory label.

**Rationale**: The user explicitly selected this scope, and feature 010 already excludes regulated-care claims. A future deployment for a covered organization requires separate legal/compliance, contractual, operational, and architecture review.

**Alternatives considered**:

- Designate the feature HIPAA-regulated by content alone: rejected because applicability depends on actors/deployment and the user explicitly chose personal wellness.

## 14. Required validation runtime

**Decision**: Preserve one representative Journal Chromium test in `test:e2e:quick`; extend it to create the crisis plan, prove entry creation is gated, and display it for a triggering answer. Keep direct multi-user share/revoke/key-broker and exhaustive browser/device cases in the full/local gates.

Planning baseline on 2026-08-27: 23 tests in 13 files; 23 passed in 22.4 seconds; `/usr/bin/time` real 22.76 seconds. The workflow timeout is 15 minutes, while the required hosted target remains ten minutes or less.

**Rationale**: The prerequisite/trigger path is the highest-value representative journey. Multi-user cryptographic matrices are important but too exhaustive for every required PR run.

**Alternatives considered**:

- Add a second quick sharing journey: rejected without runtime evidence and because it duplicates coverage better placed in contract/security/full browser gates.
- Omit crisis-plan quick coverage: rejected because the feature changes the primary Journal entry path.
