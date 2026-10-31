# Quickstart Validation: Finance and Budget Management

This guide validates the completed feature. It uses deterministic fixtures and a local mock SimpleFIN Bridge. Never use a production setup token, Access URL, account identifier, transaction description, balance, or other real financial data in local tests, screenshots, recordings, or logs.

## Prerequisites

- Node.js 24.x and the repository's locked dependencies
- Current Chromium and WebKit Playwright browsers for full release validation
- No live AWS or SimpleFIN credentials for unit, integration, contract, security, or browser suites
- Feature artifacts:
  - [Specification](spec.md)
  - [Implementation plan](plan.md)
  - [Data model](data-model.md)
  - [Finance HTTP contract](contracts/finance.openapi.yaml)
  - [Synchronization contract](contracts/sync.md)
  - [UI contract](contracts/ui.md)

Install and verify the existing toolchain:

```sh
npm ci
npm run check:runtime
```

## 1. Static and Domain Validation

Run type, lint, formatting, and focused domain/contract tests:

```sh
npm run typecheck
npm run lint
npm run format:check
npx vitest run packages/domain/src/finance tests/contract/finance.contract.test.ts tests/contract/finance-sync.contract.test.ts
```

Expected outcomes:

- Exact money parsing supports ISO currency exponents without floating-point arithmetic.
- Allocation sums, transfer rules, match thresholds, budget dates, recurrence occurrences, and reconciliation digests reject invalid states.
- Contract v7 accepts every planned finance entity and rejects provider fields in client-authored mutations.
- Finance problem responses contain safe correlation data but no protected values.

## 2. Manual Account and Balance History

Run the focused repository/service integration tests:

```sh
npx vitest run tests/integration/finance-account-repository.test.ts tests/integration/finance-transactions.test.ts
```

Verify:

1. An active user creates an individually owned manual account.
2. Both organization and account name are required; the friendly name defaults to `organization - account` and can be edited. A SimpleFIN account missing either required value pauses for user completion before creation or transaction import.
3. Each accepted balance update appends an immutable snapshot.
4. A duplicate snapshot is idempotent.
5. The latest manual snapshot plus only strictly later transactions determines current balance; historical CSV rows and transactions at the snapshot instant do not change it.
6. Recording a later snapshot moves the baseline and recomputes the projection without deleting transactions.
7. Currency cannot change after transactions exist.
8. Archive and restore preserve history.

## 3. Group Authorization and Privacy

```sh
npx vitest run tests/security/finance-authorization.security.test.ts tests/security/finance-account-access.security.test.ts tests/security/finance-budgets.security.test.ts
```

Verify the complete role matrix:

- Active members can read group accounts and manage budgets, allocations, matches, reusable items, and reconciliation.
- Active members can add/edit manual transactions, record balance snapshots, import CSV, and resolve provider reconciliation for group accounts.
- Only owners/managers can connect, reassign, or delete group finance records, including manual and CSV-origin transactions.
- Revoked members receive not-found behavior across direct reads, sync, search, merchant activity, aggregates, task links, and cached content.
- Application administrators can maintain global catalog identities but cannot read protected finance activity due solely to that role.
- A private account linked to a group budget produces `totalsComplete=false` for other members without revealing identity, count, or amount.

## 4. SimpleFIN Claim and Import

Use only the mock Bridge fixture:

```sh
npx vitest run tests/integration/simplefin-import.test.ts tests/security/simplefin-ssrf.security.test.ts tests/security/finance-observability.security.test.ts
```

Validate these fixtures:

1. Valid Bridge setup token is claimed once, the Access URL is KMS-encrypted, and no response/log/outbox record contains it.
2. Non-HTTPS, non-Bridge host, IP-literal, redirect escape, overlong body, timeout, and malformed payload attempts are rejected safely.
3. Protocol v2 account, connection, balance, pending/posted transaction, and structured error fields are parsed.
4. Initial request is at most 90 days; subsequent request overlaps the last success by five days.
5. Repeat import produces zero duplicates and does not overwrite friendly names, merchants, allocations, transfers, matches, or budget links.
6. A partial account error retains accepted data, marks the job partial, and supports safe retry.
7. Authentication/compromise errors set the connection to attention and do not auto-retry.
8. One-hour cooldown and single connection lease prevent provider quota bursts.
9. Changed pending identity creates review work instead of an automatic merge.

## 5. Manual and CSV Transactions, Splits, and Transfers

```sh
npx vitest run tests/integration/finance-transactions.test.ts tests/integration/finance-csv-import.test.ts tests/integration/finance-transfers.test.ts
```

Verify:

- One transaction can allocate across multiple categories and budget items only when the exact minor-unit total balances.
- A source amount correction preserves history, invalidates an incompatible allocation/match, and creates visible review work.
- Two confirmed transfer legs do not inflate income or spending; broken legs re-enter review.
- Mixed-currency records never produce a combined total.
- Archived categories and merchants remain understandable on historical records but cannot receive new assignments.
- A non-SimpleFIN account accepts manual transactions and CSV-origin transactions using its currency.
- CSV parsing handles quoted commas, escaped quotes, CRLF/LF, empty optional fields, and the three supported date formats in a worker without blocking the UI.
- Mapping accepts one signed amount column or separate debit/credit columns. Split-column rows reject negative inputs, both nonzero, or neither nonzero; valid debit becomes negative and credit positive.
- Files over 10 MB/50,000 rows, invalid UTF-8, missing mappings, malformed quoting, invalid dates, and invalid amounts fail with bounded actionable errors; invalid rows are never committed.
- Preview walks every suspected duplicate through an explicit include/exclude decision and blocks confirmation while any remain unresolved. Cancellation commits nothing.
- Same-file replay and chunk retry produce zero duplicate rows. Identical legitimate rows in one file remain distinct after explicit inclusion, while cross-file similarities require review. A newly detected authoritative duplicate at commit returns to review without committing that row.

## 6. Provisional SimpleFIN Reconciliation

```sh
npx vitest run tests/integration/finance-provider-reconciliation.test.ts tests/security/finance-reconciliation.security.test.ts
```

Verify:

1. A manual transaction on a SimpleFIN-managed account is created as provisional and can retain allocations, merchant, transfer, and budget links.
2. One same-account, same-currency, same-signed-amount candidate within three inclusive UTC calendar days attaches its provider identity only when corresponding non-empty payees or descriptions are exactly equal after Unicode NFC, case folding, punctuation-to-space conversion, whitespace collapse, and trim.
3. Refresh creates no duplicate, preserves every user-owned field, records the automatic decision, and makes replay idempotent.
4. Case, punctuation, and repeated-whitespace variants reconcile; empty, cross-field, substring, fuzzy, changed-amount, out-of-window, two-provisional-to-one-provider, and one-provisional-to-two-provider fixtures never auto-merge.
5. The original entry snapshot and all allocations, merchant/transfer links, matches, and audit state survive provider attachment; provider fields remain a separate snapshot.
6. Explicit reconcile requires current access to the provisional, candidate, account, and review plus current versions; it atomically transfers the identity lock, aliases the candidate, and resolves review. Revoked, nonmember, or cross-account requests return generic not-found.
7. A candidate with user-owned classifications/links creates conflict rather than merging, and replay after keep-separate does not recreate the same review.
8. Concurrent or replayed refresh and explicit decisions produce one identity owner and no partial state.

## 7. Budgets, Reusable Items, Matching, and Reconciliation

```sh
npx vitest run tests/integration/finance-budgets.test.ts tests/integration/finance-matching.test.ts tests/integration/finance-reconciliation.test.ts
```

Verify:

1. Create bounded, single-date, and open-ended group budgets.
2. Link multiple group accounts and one private account; verify viewer-dependent completeness without disclosure.
3. Copy reusable items and generate a future/recurring occurrence exactly once.
4. Edit a budget copy without changing the reusable source.
5. One unique exact merchant/amount/date/account candidate auto-matches and remains undoable.
6. A difference greater than zero and at most 20% is suggested only; ambiguous candidates never auto-match.
7. Multiple transaction allocations aggregate into one item's actual amount and category variance.
8. Reconciliation fails for incomplete views, invalid allocations, pending refresh, or changed versions.
9. Successful reconciliation writes immutable actor/time/digest/totals history.
10. A later total-affecting change marks the budget changed without rewriting history.

## 8. Search and Financial Task Links

```sh
npx vitest run tests/integration/finance-search.test.ts tests/security/finance-task-link.security.test.ts
```

Verify:

- Tasks and lists default on; transactions and merchants default off.
- Transaction results include only selected or all accessible accounts.
- Global merchant identities may appear without activity counts or hidden relationship signals.
- Search text and plaintext finance indexes are never persisted or logged.
- Creating a task from a budget item writes a finance-audience link rather than embedding finance data in the task feed.
- A task viewer without finance access receives no link, label, amount, merchant, budget name, or inaccessible-state hint.

## 9. Offline, Conflict, and Revocation

```sh
npx vitest run tests/contract/finance-sync.contract.test.ts tests/security/finance-account-access.security.test.ts
npx playwright test tests/e2e/finance-accounts.spec.ts tests/e2e/finance-search.spec.ts --project=chromium
```

Verify:

1. Cached finance data remains readable with freshness labels offline.
2. Manual transactions, CSV commit chunks, budget, allocation, catalog-association, reusable-item, and task-link edits queue in the encrypted outbox.
3. CSV parsing/mapping/preview remains available offline; claim, refresh, provider reconciliation, budget reconciliation, reassignment, and deletion explain that they require connectivity.
4. Concurrent semantic edits enter conflict review and never use silent last-writer-wins.
5. Revocation tombstones apply before route/search rendering, clear memory-only indexes, and purge protected cache rows.
6. A revoked pending mutation returns content-free authorization failure and cannot resurrect data.

## 10. Backup, Restore, and Destructive Actions

```sh
npx vitest run tests/restore/finance-restore.test.ts tests/integration/finance-deletion.test.ts tests/security/finance-deletion.security.test.ts
npm run cdk:synth
```

Verify:

- Backup selection still covers every finance table row and immutable reconciliation record.
- Restore validation checks account/transaction/allocation/budget/reference invariants without contacting SimpleFIN or exposing/decrypting Access URLs in logs.
- Restored encrypted credentials remain usable only by the production finance-import role under the correct KMS context.
- Destructive previews for accounts, transactions, budgets, reusable items, matches, task links, merchants, and categories report authorized impact counts and blockers without disclosing inaccessible details.
- Referenced records archive or become durable audit tombstones; permanent deletion is offered only for an unreferenced draft or mistake after confirmation.
- Large archival/tombstone cascades checkpoint/retry through the existing workflow and preserve required audit evidence.
- Synthesized IAM grants KMS decrypt only to finance import and KMS encrypt only to the connection boundary.

## 11. Performance

```sh
npx vitest run tests/performance/finance-search.test.ts tests/performance/finance-budget-totals.test.ts tests/performance/finance-csv-import.test.ts
npx playwright test --config playwright.performance.config.ts
```

Use deterministic data for 50 accounts, 100,000 accessible transactions, 20 active budgets, and five group members. Confirm:

- Run 20 measured iterations each for the Finance landing page, merchant view, budget view, and filtered transaction search with a mid-range mobile profile, 4x CPU slowdown, 10 Mbps bandwidth, and 100 ms latency.
- Each measured journey shows useful content within two seconds at p95, and long refreshes show progress within one second.
- First content does not wait for all transactions to decrypt or index.
- Account/date reads remain cursor-bounded to at most 200 records.
- No table scan or new GSI is required at the reference scale.
- A 10 MB/50,000-row CSV parses and previews off the main thread with progress, bounded memory, and responsive cancellation.

## 12. Browser and Responsive Validation

Run the representative journey and the exhaustive feature suite:

```sh
npx playwright test tests/e2e/finance-*.spec.ts --project=chromium
npx playwright test tests/e2e/finance-*.spec.ts
npm run validate:pre-aws:browsers
```

The representative journey covers manual account creation, a small CSV preview/import, a split transaction, budget/category variance, reconciliation prerequisites, and an offline queued edit. The full suite covers group roles, provisional provider reconciliation and ambiguity, provider status/failures, CSV validation/limits, search toggles, merchant privacy, task-link privacy, Chrome, WebKit, iPhone, and iPad layouts with keyboard and touch behavior.

## 13. Two-User Usability Acceptance

Moderate the same scripted workflows with two representative users covering individual-owner and group-owner/manager perspectives. Both users must:

- Add or import an account, assign it correctly, and confirm its latest balance in under three minutes without assistance.
- Create a date-appropriate multi-account budget, add direct or reusable items, and identify total and category variance in under five minutes without assistance.
- Map, preview, correct, and commit a supported CSV without assistance; invalid rows remain uncommitted with actionable reasons.
- Rate account freshness, budget status, match state, and reconciliation history as clear without developer explanation.

Record participant role, elapsed time, pass/fail, observed confusion, and follow-up changes without recording real financial content.
Use [the acceptance record](acceptance.md) during both sessions so every required criterion and rerun
is captured consistently.

## 14. Required Validation Runtime Gate

Before adding any finance test to `playwright.quick.config.ts`, capture the current count and timing:

```sh
npx playwright test --config playwright.quick.config.ts --list
/usr/bin/time -p npm run test:e2e:quick
```

After the change, run the same commands and record the before/after count and `real` time in implementation validation notes. Keep only one representative high-value finance journey in the quick suite; keep exhaustive variants in full browser/release gates.

Run the complete local required validation:

```sh
npm run validate
npm run test:e2e:quick
```

After pushing, confirm the hosted PR validation check remains at or below ten minutes. The workflow's 15-minute timeout is a safety limit, not the runtime target. Do not merge a required-suite expansion above ten minutes without explicit approval and a documented reason.

## Expected Completion Evidence

- Focused unit, integration, contract, security, restore, performance, and browser results
- Before/after quick-suite test count and local timing if required validation changed
- Hosted PR validation duration at or below ten minutes
- CDK diff/synthesis showing no RDS/Aurora/OpenSearch/always-on resources and least-privilege finance/KMS grants
- CloudWatch metric/alarm assertions and protected-data log redaction tests
- Restore evidence meeting RPO at most five minutes and RTO at most four hours
- Two-user moderated usability evidence with both users passing every required workflow
- Twenty-iteration throttled Chromium performance evidence for all four measured views
- Incremental AWS cost estimate at or below $5 per normal month, or Steve's explicit approval of the documented higher forecast
- Contract and UI evidence that v1 exposes no Finance export surface
- Final diff review covering correctness, simplicity, security, durability, errors, logs, tests, browser support, documentation, and cost
