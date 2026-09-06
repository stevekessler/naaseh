# Crisis Plan Cryptographic Sharing Protocol

This protocol is a delta on the feature-010 Journal Master Key (JMK) design. Implementations must use reviewed shared primitives and exact canonical encodings; application code must not improvise cryptographic formats.

## Keys and purposes

| Key | Generated/held by | Purpose | Durable plaintext allowed? |
|---|---|---|---|
| Journal Master Key (JMK) | Owner browser | Feature-010 journal root; derives owner-wrap key | No |
| Crisis Plan Content Key (CPK) | Owner browser | AES-256-GCM plan body encryption | No |
| Owner wrap key | Owner browser, HKDF from JMK | AES-256-GCM wrapping of CPK for offline owner | No |
| Sharing KMS RSA-3072 key | AWS KMS | Decrypt identity-bound recipient grants | Private key never leaves KMS |
| Recipient open key pair | Recipient browser | One-use RSA-OAEP rewrap of CPK from broker | No; memory only |

The JMK is never shared. The sharing KMS key never encrypts the plan body. The recipient open private key is non-extractable and discarded after the visible online view ends.

## Algorithms

- Plan content and owner wrap: AES-256-GCM, fresh unpredictable 96-bit IV per encryption, 128-bit authentication tag.
- Owner wrap key: HKDF-SHA-256 from JMK with domain label `naaseh/crisis-plan/owner-wrap/v1` and plan/generation context.
- Recipient grant: RSA-OAEP with SHA-256 using the signed public key for a dedicated RSA-3072 KMS encryption key.
- Recipient open rewrap: RSA-OAEP with SHA-256 to a one-use browser public key of at least 2048 bits.
- Identity bindings: SHA-256 of canonical UTF-8 identifiers; constant-time byte comparison where applicable.
- Encoding: base64url without padding at JSON boundaries; exact binary formats internally.

No SHA-1, RSA PKCS#1 v1.5 encryption, AES-CBC/CTR, static IV, unauthenticated encryption, extractable browser private key, or algorithm downgrade is accepted.

## Signed sharing-key registry

Extend the existing signed recovery-public-key registry pattern with a separate authority:

```json
{
  "authority": "crisis-plan-sharing",
  "region": "us-west-2",
  "keyId": "opaque configured identifier",
  "keySpec": "RSA_3072",
  "algorithm": "RSAES_OAEP_SHA_256",
  "version": 1,
  "state": "active"
}
```

The registry is signed by the existing manifest-signing authority. The browser verifies the registry signature, authority, region, key spec, algorithm, version, and active state before creating a grant. Rotated keys may be `decrypt-only` so old grants remain openable until owners rekey; only one version is active for new grants. Missing/invalid registries block share mutation without affecting the last valid plan.

## Owner plan creation

1. Require an authenticated, unlocked owner journal session.
2. Normalize and validate the single Lexical document; reject empty/formatting-only/unsafe content.
3. Generate 32 random CPK bytes with `crypto.getRandomValues`.
4. Import CPK as non-extractable AES-GCM key for body encryption.
5. Encrypt the normalized document using canonical body AAD and a fresh IV.
6. Derive the owner wrap key from JMK and encrypt raw CPK bytes with canonical owner-wrap AAD and a distinct fresh IV.
7. Atomically persist local ciphertext + encrypted outbox mutation.
8. Clear mutable raw CPK bytes; retain only non-extractable key reference for the unlocked owner session.

## Recipient grant package

The exact package is fixed-width and at most 318 bytes before RSA-3072 OAEP-SHA-256 encryption:

```text
magic[6] = "NCPKG1"
schema[2] = uint16be(1)
cpk[32]
ownerDigest[32] = SHA256(canonical(ownerId))
planDigest[32] = SHA256(canonical(planId))
recipientDigest[32] = SHA256(canonical(recipientId))
shareVersion[8] = uint64be
keyGeneration[8] = uint64be
createdAtEpochMs[8] = uint64be
reserved[16] = zero
```

Total: 176 bytes. Reject wrong length, nonzero reserved bytes, invalid integer range, future timestamp beyond bounded clock skew, or stale age outside the mutation/retry window. Encrypt with the verified current sharing public key. The stored grant includes key-registry version/algorithm outside the ciphertext so KMS decrypt uses the exact parameters.

The owner browser creates a grant only after receiving the server-assigned/current share version. A create-share preparation endpoint may reserve that version with a short-lived opaque token, or the first relationship version is deterministically `1`; retries use the same mutation ID and grant. Re-share uses the server-returned next version before final activation.

## Recipient online open

1. Recipient opens the online `Crisis Plans` tab and selects a live shared summary.
2. Browser generates a one-use non-extractable RSA-OAEP key pair and random request nonce.
3. Browser sends only SPKI public key + nonce to the shared-open route; no private key is serialized.
4. Dedicated broker derives `recipientId` from authorizer context and strongly reads the share/plan.
5. Require active user, `share.state=active`, matching recipient, current plan generation, supported key version/algorithm, and rate-limit allowance.
6. KMS decrypts the grant. Broker validates exact package format and every identity/version/generation binding.
7. Broker re-reads the share/plan after KMS work. If state/version/generation changed, clear buffers and return concealed denial/conflict.
8. Broker imports the request SPKI after key-size/algorithm validation and encrypts CPK to it.
9. Broker clears mutable decrypted package/CPK buffers and returns current body ciphertext, versions, nonce, and rewrapped CPK with no-store headers.
10. Browser matches nonce/versions, decrypts CPK with its ephemeral private key, decrypts AES-GCM body with exact AAD, validates normalized document schema, and renders read-only.
11. Browser clears component state, DOM plaintext, CPK/private-key references, and response references on offline, hidden, route leave, logout, session invalidation, or explicit close.

The service worker must use a deny-by-default rule for `/journal/crisis-plan/shared*`, `/journal/crisis-plans/shared*`, key registry responses, and broker errors. Browser HTTP cache is disabled with `Cache-Control: no-store, private` and `Pragma: no-cache` defense in depth.

## Owner content update

With no revocation/rekey required:

1. Decrypt current CPK from owner wrap after JMK unlock.
2. Validate normalized document.
3. Encrypt body with same CPK, new plan version AAD, and fresh IV.
4. Rewrap CPK with the owner wrap key using new plan-version AAD and fresh IV.
5. Queue an exact-base-version plan mutation.

Recipient grants remain valid because key generation does not change. The broker always returns the latest successfully committed body.

## Owner revocation / rekey

Owner revocation is not complete until all steps commit:

1. Require online authenticated unlocked owner and exact current plan/share snapshot.
2. Generate a new random CPK and `nextKeyGeneration=current+1`.
3. Re-encrypt current normalized document under new CPK and next plan version.
4. Create new owner wrap.
5. Create current-version grants for every remaining active recipient; exclude target.
6. Submit complete rekey package with stable mutation ID.
7. Server validates recipient set exactly matches current active set minus target and total active count ≤90.
8. One conditional DynamoDB transaction updates plan body/wrap/generation, every remaining grant, target state, and receipt.
9. Only after receipt does browser replace local current ciphertext/key and announce revocation complete.

If any check/write fails, the prior generation remains current and access has not been revoked. Offline revocation is encrypted as an intent and is labeled pending; it must not remove the recipient from the owner's visible active list until server commit.

## Recipient self-removal

1. Require exact authenticated active recipient and CSRF/mutation protections.
2. Conditionally change only their share to `recipient_removed`, remove active recipient-index projection, set plan `keyRotationRequired=true`, and record receipt.
3. Broker/list deny the recipient immediately.
4. The next unlocked owner session displays/retries required rekey. Owner content/share mutations are blocked until rekey commits.

The server cannot cryptographically rotate without owner plaintext/key access, and must not pretend otherwise. It also must not deliver current ciphertext to the removed recipient.

## Failure behavior

- AES-GCM failure: reveal no partial plaintext; clear keys; owner gets recovery-oriented error, recipient gets generic unavailable state.
- KMS/key-registry unavailable: existing owner plan remains usable offline; share/open/rekey remain pending/failed with retry.
- Unsupported schema/key generation: preserve ciphertext and block overwrite.
- Stale share/plan version: concealed conflict; owner refetches/unlocks/rebuilds package.
- Duplicate mutation: return original stable result; never reapply rotation.
- Oversized document/grant/request: reject before durable change; preserve encrypted owner draft.
- Recipient goes offline: immediately tear down shared content/key; show online-required state.
- Owner tab hides or unlock expires: clear JMK/CPK/plaintext and lock plan UI per feature 010.

## Logging and memory prohibitions

Never log or attach to errors/traces:

- plan document or normalized nodes;
- CPK/JMK/raw key buffers;
- body ciphertext, IV, owner wrap, recipient grant, rewrapped CPK, SPKI, nonce, or request body;
- owner/recipient names or usernames;
- journal answers or trigger state;
- decrypted package bytes or binding digests.

Use content-free operation/outcome, latency bucket, schema/key/share generation, safe correlation/mutation ID, and bounded denial class only. Clear mutable byte arrays in `finally`; acknowledge that JavaScript/Web Crypto garbage collection cannot guarantee physical memory erasure and keep plaintext/key lifetime minimal.

## Rotation and recovery invariants

- Sharing-key KMS versions are separate from journal recovery-key versions.
- New grants use only the active key; broker may decrypt active/decrypt-only versions.
- Do not delete a decrypt-only KMS key while any active grant references it.
- Owner JMK recovery restores ability to unwrap CPK; recovery admin never receives CPK, grant, share list, or plan body.
- A recovered owner session must finish any `keyRotationRequired` state before updating/sharing.
- Backup restore validation checks generations/bindings without KMS decrypt unless an isolated, audited test explicitly exercises broker recovery with synthetic fixtures.
