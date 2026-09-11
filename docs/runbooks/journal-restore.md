# Private Journal Restore Runbook

Last reviewed: 2026-09-06

For the exact production discovery, scheduling, status, validator, and cleanup commands, follow
[Verify Journal and Crisis Plan in production](../operations/verify-journal-crisis-plan-production.md#6-run-the-isolated-restore-test).

1. Restore the existing encrypted DynamoDB/backup resources into an isolated recovery environment using the approved backup role.
2. Inventory Journal entries, profiles, key envelopes, mutation receipts, feed changes, recovery requests, and audit rows. Do not decrypt entries in operator tooling.
3. Run the deployed restore-testing workflow. Its inventory validator calls the Journal restore
   validator directly and must reject malformed/plaintext-bearing records, unauthorized owner
   relationships, key-version rollback, missing key envelopes, and missing inventory. Audit-chain
   validation remains part of the separate recovery-audit validator.
4. Confirm point-in-time recovery and restore duration meet the documented RPO/RTO targets and that the restored key versions remain usable by the owner flow.
5. Validate IAM: the ordinary API/admin/report/export/notification roles cannot decrypt the recovery key; only the isolated concurrency-one recovery function can perform an owner-bound rewrap.
6. Record content-free counts, hashes, timing, authorization outcome, and CloudTrail evidence. Never record dates, answers, notes, task references, wraps, keys, ciphertext, or dashboard values.
7. Serve restored data only after authorization, audit, version, and plaintext-exposure checks pass.
