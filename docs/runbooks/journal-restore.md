# Private Journal Restore Runbook

1. Restore the existing encrypted DynamoDB/backup resources into an isolated recovery environment using the approved backup role.
2. Inventory Journal entries, profiles, key envelopes, mutation receipts, feed changes, recovery requests, and audit rows. Do not decrypt entries in operator tooling.
3. Run the Journal restore validator. It must reject plaintext field names, unauthorized owner grants, key-version rollback, missing inventory, and altered audit-chain links.
4. Confirm point-in-time recovery and restore duration meet the documented RPO/RTO targets and that the restored key versions remain usable by the owner flow.
5. Validate IAM: the ordinary API/admin/report/export/notification roles cannot decrypt the recovery key; only the isolated concurrency-one recovery function can perform an owner-bound rewrap.
6. Record content-free counts, hashes, timing, authorization outcome, and CloudTrail evidence. Never record dates, answers, notes, task references, wraps, keys, ciphertext, or dashboard values.
7. Serve restored data only after authorization, audit, version, and plaintext-exposure checks pass.
