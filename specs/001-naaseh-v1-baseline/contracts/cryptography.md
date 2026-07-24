# Contract: Authentication, Hidden Memo Encryption, and Recovery

## Password Verification

- Use Argon2id PHC verifiers through a pinned, maintained native library.
- Minimum parameters: version 19, memory 102400 KiB, parallelism 1, salt at least 16 random
  bytes, output at least 32 bytes.
- Benchmark from `m=131072 KiB, t=2, p=1`; choose the highest `t` whose deployed p95
  verification remains at or below one second. Never lower memory below 100 MiB.
- Apply a versioned pepper held in Secrets Manager before hashing; never log password,
  intermediate, verifier, salt+hash bundle, or pepper.
- Unknown usernames execute a dummy verifier and return the same response shape/status.

## Sessions

- Generate 32 random bytes and return base64url only in a `__Host-naaseh` cookie with
  `Secure; HttpOnly; SameSite=Strict; Path=/` and no `Domain`.
- Store only SHA-256 token digest, CSRF digest, user/session epoch, idle/absolute expiry, and status.
- State-changing requests require matching Origin and synchronizer CSRF token.
- Enforce expiry in application logic; DynamoDB TTL is cleanup only.
- Rotate after login or privilege/security change and revoke on logout/disablement.

## HiddenMemoPackage v1

```json
{
  "schema": "naaseh-hidden-memo/v1",
  "cipher": "AES-256-GCM",
  "ciphertext": "base64url",
  "iv": "base64url-12-bytes",
  "aad": {
    "memoId": "01...",
    "taskId": "01...",
    "ownerId": "01...",
    "schemaVersion": 1,
    "keyVersion": 1
  },
  "pinWrap": {
    "kdf": "Argon2id",
    "memoryKiB": 102400,
    "iterations": 2,
    "parallelism": 1,
    "salt": "base64url-at-least-16-bytes",
    "algorithm": "AES-256-GCM",
    "iv": "base64url-12-bytes",
    "wrappedDek": "base64url"
  },
  "recoveryWraps": [
    {
      "authority": "recovery",
      "region": "us-west-2",
      "kmsKeyId": "...",
      "algorithm": "RSAES_OAEP_SHA_256",
      "keyVersion": 1,
      "wrappedDek": "base64url"
    }
  ]
}
```

The browser:

1. Generates a random 256-bit DEK and 96-bit IV.
2. Encrypts UTF-8 memo plaintext with AES-GCM and canonical AAD.
3. Derives a PIN KEK using pinned Argon2id WebAssembly in a worker and wraps the DEK.
4. Wraps the DEK with each cached, signed KMS public key registry entry.
5. Immediately zeroes/discards extractable plaintext/key buffers where JavaScript permits.
6. Persists only the package; unlocked plaintext/search tokens remain in memory and expire
   after five minutes of inactivity, tab hiding, logout, or explicit lock.

Changing the PIN unwraps with the old PIN and creates a new PIN wrap without re-encrypting
memo ciphertext. A forgotten PIN uses the audited recovery flow.

## Recovery Flow

1. Authenticated owner re-verifies account password online and requests PIN recovery.
2. Recovery Lambda validates ownership, fresh authentication, CSRF, rate limits, and reason.
3. Browser supplies a fresh ephemeral RSA-OAEP public key.
4. Recovery Lambda uses only the recovery KMS role to decrypt the selected recovery wrap,
   immediately re-encrypts the DEK to the browser ephemeral key, and clears buffers.
5. Browser unwraps the DEK, creates a new PIN wrap, and submits a versioned rewrap mutation.
6. CloudTrail/CloudWatch record safe identifiers, authority/key version, actor, result, and
   timing—never DEK, PIN, memo plaintext, or ciphertext.

The AWS recovery trust boundary can ultimately recover a DEK. This is an accepted tradeoff
for recoverability and is not end-to-end encryption against AWS or the recovery authority.

## Key Registry and Rotation

- The signed public registry lists active KMS public keys, authority, algorithm, and version.
- V1 registry entries and keys are restricted to `us-west-2`; there is no replica key.
- New memos require the active recovery wrap; a missing required wrap blocks “synced” state.
- Rotation creates a new active key, dual-wraps new data, rewraps retained DEKs in batches,
  verifies an isolated restore, then marks the old key decrypt-only.
- Never schedule deletion while any retained backup references the key. Routine roles are
  explicitly denied deletion permissions; deletion/policy changes alarm immediately.
- Backup manifests inventory every referenced key and package version.

## Logging Redaction Contract

Logging uses an explicit allowlist. The following are always forbidden: passwords, PINs,
PHC verifiers, peppers, raw sessions/CSRF tokens, memo plaintext, search tokens, raw DEKs/
KEKs, decrypted recovery results, Web Push private keys, and private-task field values.
Verbose mode does not alter this list.
