# Private Journal Recovery Runbook

1. Confirm the owner is authenticated, has freshly verified their account password, and initiated the exact unexpired request shown in the recovery console.
2. Confirm the operator has the designated `recovery` role. Ordinary administrator access is insufficient.
3. Record a concise operational reason through the request flow. The service persists only its digest.
4. Freshly verify the recovery administrator password and TFA, then approve the exact request ID, owner, session epoch, key-envelope version, recovery-key version, and ephemeral public-key digest.
5. Confirm only the owner browser can consume the result. Never copy public keys, wraps, ciphertext, or recovered key material into tickets, chat, logs, or screenshots.
6. Ask the owner to set a replacement Journal PIN and confirm old sessions are revoked. Replays, second consumption, or requests older than five minutes must fail generically.
7. Verify the content-free audit hash chain and corresponding CloudTrail KMS event. Escalate any mismatch or plaintext-bearing telemetry as a security incident.

The recovery administrator never opens, edits, searches, exports, or receives plaintext Journal content or JMK material.
