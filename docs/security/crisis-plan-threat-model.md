# Crisis Plan threat model

The plan plaintext boundary is an unlocked owner browser or an active recipient's visible, online-only browser session. Ordinary APIs, administrators, recovery operators, support tooling, exports, reports, notifications, telemetry, backups, URLs, service-worker caches, and durable recipient storage must never receive plaintext or a decrypted CPK.

## Required controls

- Encrypt each plan with a random 256-bit CPK and AES-256-GCM authenticated metadata. Wrap the owner CPK under a JMK-derived key.
- Bind every recipient grant to owner, plan, recipient, share version, CPK generation, and sharing-key version. Verify the signed public-key registry before grant creation.
- The broker reauthorizes active account and share state before and after KMS decrypt, decrypts grants only, rewraps to a one-use browser key, zeroizes raw bytes, and returns `no-store`.
- Owner revocation rotates body ciphertext, CPK, owner wrap, and every remaining grant atomically. Recipient self-removal denies delivery immediately and blocks owner mutations until rotation.
- Shared content and keys are memory-only and are purged on offline, route leave, visibility hide, pagehide, logout, session invalidation, and back/forward restoration.
- No delete operation exists. Backup restore rejects key-generation rollback, revoked-grant resurrection, and share/owner mismatch without decrypting content.
- Allowlisted telemetry excludes plan content, ciphertext, wraps, grants, public keys, CPK/JMK material, user search text, recipient identifiers, and journal answers.

Screenshots, clipboard contents, photographs, or other copies made outside Naaseh cannot be cryptographically retracted. The UI states this before sharing, revocation, and recipient removal. This is a personal-wellness feature, not clinical monitoring or emergency response.
