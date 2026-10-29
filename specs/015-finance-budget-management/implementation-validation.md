# Finance Implementation Validation

## Foundational AWS Cost Gate

**Status:** PASS — implementation may continue.

**Estimate date:** 2026-10-25
**Reference scale:** two users, up to 50 accounts, 100,000 retained transactions, 20 active budgets, four refreshes per account per day, 100,000 Finance HTTP requests per month, 120,000 Lambda invocations per month, 500,000 DynamoDB transactional write units, 1,000,000 read units, 10,000 KMS operations, and 0.5 GB of additional structured logs per month.

This estimate intentionally ignores temporary free-tier allowances except where the reused resource makes the incremental fixed cost zero. It assumes the existing HTTP API, on-demand DynamoDB table, KMS runtime-secrets key, backup plan, deletion workflow, alert topic, and CloudWatch log/metric infrastructure are extended instead of duplicated.

| Incremental service usage | Conservative monthly estimate |
|---|---:|
| API Gateway HTTP API requests and small response transfer | $0.15 |
| Lambda requests and 30,000 GB-seconds of compute | $0.55 |
| DynamoDB on-demand transactional writes and reads | $0.55 |
| DynamoDB/backup storage growth | $0.20 |
| KMS requests using the existing customer-managed key | $0.03 |
| CloudWatch log ingestion/retention | $0.30 |
| Four low-cardinality custom metrics and four standard alarms | $1.60 |
| Contingency for request size, retries, and regional variation | $0.60 |
| **Estimated normal incremental total** | **$3.98/month** |

The estimate is below the approved $5/month ceiling by $1.02. No RDS, Aurora, OpenSearch, NAT Gateway, provisioned concurrency, queue, or other always-on Finance resource is planned. If observed usage or the synthesized design projects more than $5/month, implementation/release must pause for Steve's explicit approval and a documented lower-cost alternative review.

Pricing basis:

- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/) — request and GB-second billing; no provisioned concurrency.
- [Amazon API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/) — HTTP APIs billed per request plus transfer.
- [Amazon DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/) — on-demand read/write request units and storage, with transactional operations consuming additional units.
- [AWS KMS pricing](https://aws.amazon.com/kms/pricing/) — symmetric cryptographic requests; the existing key avoids another $1/month key charge.
- [Amazon CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/) — logs, custom metrics, and standard alarms.

Development, migration, restore-test, and unusual one-time costs are excluded from the normal monthly total and will be measured separately before release.

## Validation Results

### Required quick-suite baseline (T095)

- Measured locally on 2026-10-28 before adding any Finance journey.
- Command: `/usr/bin/time -p npm run test:e2e:quick`
- Result: **30 passed**.
- Wall-clock time: **25.61 seconds** (`user 38.81`, `sys 8.04`).
- The first sandboxed attempt could not bind the local preview port and was excluded; the recorded
  measurement is the successful unrestricted local run.
- The existing required workflow remains comfortably below the ten-minute target before the
  representative Finance addition.

Further results will be appended as the remaining implementation tasks complete.

### Required quick-suite after Finance journey (T096–T097)

- Added exactly one Chromium journey: `tests/e2e/finance-quick.spec.ts`.
- The journey covers manual account creation, CSV mapping and offline encrypted queueing, a balanced
  two-category split, budget/category variance, and a blocked reconciliation prerequisite.
- Exhaustive Finance roles, failures, CSV limits, reconciliation variants, WebKit, iPhone, and iPad
  coverage remains in the full suites.
- `npm run test:e2e:quick -- --list`: **31 tests in 20 files** (previously 30 tests).
- Successful after-change command: `/usr/bin/time -p npm run test:e2e:quick`.
- Result: **31 passed** in Playwright's 25.3 seconds.
- Wall-clock time: **25.62 seconds** (`user 39.70`, `sys 8.38`), compared with the 25.61-second
  baseline. The one-test increase added 0.01 seconds in this local measurement and leaves ample
  headroom under the ten-minute hosted requirement.
- An intermediate run exposed and corrected an ambiguous heading locator; it is excluded from the
  recorded successful measurement.

### Finance scale and infrastructure evidence (T091–T094, T104)

- Restore, deletion, security, infrastructure, and no-export contract suites passed in focused runs.
- Deterministic performance fixtures cover 50 accounts, 100,000 transactions, and a 50,000-row CSV.
- The three local performance suites passed their two-second p95 and one-second progress gates over
  20 iterations.
- Constrained Chromium (4x CPU, 10 Mbps, 100 ms latency) passed 20 iterations per view: landing
  p95 35.76 ms, merchant p95 33.98 ms, budget p95 38.98 ms, and search p95 53.83 ms; refresh
  progress also remained under one second.
- CDK assertions found and drove removal of an implicit broad table-key KMS grant. The Finance API
  now has only context-bound `kms:Encrypt`; the importer has only context-bound `kms:Decrypt`.
- Finance v1 has no export endpoint, sync operation/feed type, UI route/action, request, or
  downloadable response format.

### Browser, accessibility, and release-gate evidence (T098)

- The Finance-only Chromium/WebKit/iPhone/iPad matrix ran **100 tests** and passed all 100 in
  1.1 minutes. This includes responsive account, transaction, budget, reconciliation, matching,
  search, task-link, and no-export behavior.
- The complete pre-AWS gate passed runtime, type checking, lint, formatting, pinned-action checks,
  **1,254 Vitest tests**, coverage thresholds, 25 Python operator tests, production builds, and CDK
  synthesis.
- Its exhaustive browser phase ran 544 cases: 518 passed, 20 production-only canaries were skipped,
  and six unrelated service-worker/urgency cases timed out during saturated WebKit/iPhone/iPad
  execution. All Finance cases passed. An isolated single-worker rerun of the affected cases and
  their parameterized siblings passed **21 of 21** in 33.3 seconds, including each of the six
  timeouts. This is recorded as suite-load flakiness rather than a product regression.
- The complete suite's representative accessibility checks passed on every executed browser/device;
  no serious or critical Axe finding was reported. Finance phone/tablet layouts, keyboard/touch
  controls, and privacy-preserving empty/error states passed in the Finance matrix.

### Static, focused, and synthesis evidence (T099)

- `npm run validate` passed: runtime, type checking, lint, **404 test files / 1,254 tests**, and API,
  web, and infrastructure builds.
- The focused Finance contract, integration, security, restore, and performance run passed
  **39 files / 133 tests**.
- CDK synthesis passed both inside the pre-AWS gate and as the production `NaasehProd` synthesis.
  No live AWS, production SimpleFIN, native-client, or deployed production canary was required for
  these local gates.

### Final review (T100)

- `git diff --check` is clean. Type checking, lint, formatting, tests, builds, and synthesis all pass.
- Authorization remains scope-first: ordinary owners may access only their owner scope; group members
  require active membership; connect/reassign/delete requires owner or manager; application-admin
  status alone grants no protected Finance access. Direct and aggregate denial paths return generic
  not-found behavior and are covered by security tests.
- SimpleFIN Bridge setup tokens and credential-bearing Access URLs remain server-only. The Access URL
  enters persistence only as KMS ciphertext, decrypt is limited to the importer with encryption
  context, redaction covers URLs/tokens/names/descriptions/amounts/balances/IDs, and CloudWatch
  telemetry contains only bounded operation/outcome/duration/count dimensions.
- Immutable source snapshots, identity locks, idempotency receipts, exact allocation totals,
  checkpointed deletion, durable audit tombstones, restore invariants, and explicit conflict/review
  states protect against data loss and silent last-writer-wins behavior. Deleting transactions does
  not delete categories.
- The implementation reuses existing table, key, backup, deletion, alarm, and API infrastructure;
  no RDS/Aurora/OpenSearch/NAT/provisioned-concurrency resource or table scan was introduced. Browser
  and accessibility support is evidenced across Chromium, WebKit, iPhone, and iPad.
- Quickstart commands were reconciled to the actual test files and performance config. Finance
  operations now document secret handling, alert response, restore isolation, deletion, release, and
  cost-stop procedures. No blocking correctness or security issue was found in the final review.

### Documentation and final cost verification (T102)

- `quickstart.md` is complete and every command names an implemented suite/configuration.
- `docs/operations.md` documents SimpleFIN Bridge operations, protected-data boundaries, alerts,
  backup/restore, destructive actions, cost escalation, and release evidence, and is linked from the
  operations index.
- The synthesized design matches the foundational estimate: it reuses the existing HTTP API,
  on-demand DynamoDB table, KMS key, backup plan, deletion workflow, alert topic, and CloudWatch
  infrastructure; it adds no fixed-cost database, search cluster, NAT gateway, queue, or provisioned
  concurrency.
- Final expected normal incremental cost remains **$3.98/month**, which is **$1.02 below** Steve's
  $5/month ceiling. Any forecast above $5 remains a release stop requiring an explicit flag and
  approval with cost drivers and cheaper alternatives.

### Hosted validation and remaining external checkpoint (T101, T103)

- PR #84 validates Finance commit `d78582d5297ec43596e17e07fb73920d00a1a6c3` on the isolated
  `codex/finance-budget-management` branch. Its required `validate` job passed on 2026-10-29 from
  01:03:46Z to 01:09:54Z (**6m08s**). This leaves **3m52s** of headroom under the ten-minute target.
  The full `npm run validate` step completed in 4m30s, Chromium installation in 21s, and
  `npm run test:e2e:quick` in 57s. Evidence: GitHub Actions run `40798064383`, job `123199244231`.
- T103 requires two real representative users to complete the moderated acceptance script. Automated
  agents and repeated browser fixtures cannot substitute for the required human timing and clarity
  evidence. The individual-owner participant is assigned as Tester H and the repository owner is
  assigned as the group-owner participant. A ready-to-use, protected-data-safe session worksheet is
  available in `acceptance.md`; results remain pending until both sessions are conducted.
