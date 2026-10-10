# Native four-client and exactly-once results

Run date: 2026-10-08. Result: **PASS for deterministic automated workloads**.

The Swift sync suite modeled web, iPhone, iPad, and Mac replicas receiving duplicate delivery and verified one canonical record per client, conflict/retry classification, offline queue preservation, and audience revocation cleanup. Chromium and WebKit each displayed a native-created private record and replayed one web offline mutation exactly once.

The SC-005 workload used exactly 1,000 unique identifiers, each invoked two to five times:

| Operation class         | Unique IDs | Durable result                                                    |
| ----------------------- | ---------: | ----------------------------------------------------------------- |
| Siri task creation      |        200 | 200 tasks and create operations                                   |
| Native alert occurrence |        200 | 200 pending and delivered occurrence IDs                          |
| Sync mutation           |        200 | 200 applied IDs, 200 distinct                                     |
| Completion              |        150 | 150 completion records and operations                             |
| Timer transition        |        150 | version 150; 149 unique phase feedback events after initial start |
| Crisis Plan sharing     |        100 | 50 grants plus 50 revocations; 50 relationships at version 2      |

Commands:

```sh
swift test --package-path packages/apple --disable-sandbox --filter 'ExactlyOnce|fourClientConvergence|revokedAccess'
npx playwright test tests/e2e/native-sync-interop.spec.ts --project=chromium --project=webkit
```

Both passed. The workload found and corrected missing receipts in direct task mutations, timer reset/phase changes, in-memory sync enqueueing, and Crisis Plan grants/revocations. No duplicate durable effect remained. Production multi-device smoke remains part of the TestFlight gate, not this deterministic result.
