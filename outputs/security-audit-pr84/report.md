# Security audit: PR 84

Reviewed commit `0f71cc12e93a9dfc060d4c0c137d373f8a73dccd` against base `17fc0ee4d08cb6d9c3754e48e8445a5d4e737576`.
PR: https://github.com/stevekessler/naaseh/pull/84

Recommendation: address the findings before merging. This is a source and targeted-test audit, not a deployed penetration test or a dependency-advisory scan. Existing local changes were excluded by extracting the committed snapshot into `/tmp/naaseh-pr84-audit`.

## P1: Reconciliation history discloses inaccessible account totals

Location: `apps/api/src/finance/reconciliation-service.ts:169-175`; also `budget-service.ts:306-310` and `reconciliation-service.ts:230-240`.

The history reader checks only budget group membership and returns complete stored totals. The archived-budget reader bypasses the history helper and returns the same records. Reconciliation records are also emitted to the whole budget group. An owner can link a private account and reconcile it; a second group member who cannot read that account receives its historical amounts and category totals even though the normal budget response correctly hides its items and current totals. A single-account budget reveals the private contribution exactly.

Reproduction: create a shared budget linked to an owner-only account, add an item and reviewed transaction for -12345, reconcile as the owner, then call getFinanceBudget as a different member. Items and current totals are empty; reconciliations[0].totalsByCurrency[0].actualMinor is -12345.

Fix: apply account-contribution authorization to reconciliation reads, including archived budgets and feed projections. Preserve full immutable evidence server-side, and expose totals only to eligible viewers. A group feed must not carry a full private-account snapshot.

## P1: Budget-item group feed bypasses account visibility

Location: `apps/api/src/finance/budget-service.ts:225-232`.

Item creation permits private accounts owned by the actor but publishes the entire item to GROUP#budget.groupId. That payload contains relatedAccountIds, description, plannedAmountMinor, and category/merchant relationships. getFinanceBudget filters these items out for group members lacking account access, but the emitted feed record bypasses that filtering. The reproduction confirms the private item and account ID are present in the group-audience change.

Fix: use an authorized projection or restricted audience for account-dependent item content; test the actual bootstrap/pull path with a second group member. This is a confirmed unsafe feed payload, but delivery is presently limited by the incomplete production feed wiring described below.

## P2: Stale deletion previews permanently remove newly referenced records

Location: `apps/api/src/finance/handlers.ts:1004-1018`.

Account and transaction permanent-delete branches do not compare the current record version or recompute references. executeDeletion only compares the submitted version against the old preview. A five-minute preview obtained for an empty account remains valid after a transaction is created and the account version advances. Confirmation permanently deletes the account and leaves the transaction orphaned. The same omission affects transaction deletion after allocations or other references change.

Fix: reauthorize and revalidate the current version and dependent references at execution, then atomically condition deletion on the reviewed state. Return a conflict requiring a fresh preview when state changes.

## Deployment limitations found during the audit

- Finance API and import worker each instantiate separate FinanceMemoryRepository instances (`handler.ts:11`, `import-handler.ts:139`). The live paths do not use the DynamoDB persistence helpers. Data cannot survive cold starts or reliably cross API instances; the import worker cannot see the connection created by the API.
- Infrastructure routes use `/api/v1/finance/{proxy+}`, but handler.ts:66-69 resolves event.routeKey against exact registered endpoint templates. A real catch-all route key does not resolve, so deployed Finance requests return 404. Existing handler tests synthesize exact endpoint route keys.

These blockers mean the service-level reproductions do not establish currently reachable attacks through the deployed API. Correcting routing/persistence must retain the authorization fixes, and the unsafe feed payload must be fixed before feed wiring is completed.

## Validation

14 targeted test files / 56 tests passed, including all ten Finance security files, SimpleFIN SSRF security tests, Finance HTTP handler tests, SimpleFIN import integration tests, and three added reproduction tests. The reproduction tests assert the vulnerable behavior; their passing confirms the findings rather than the fixes. Results are in test-results.txt.

Tests ran from the extracted PR snapshot with aliases to its domain/contracts/observability source and existing installed dependencies. Reproduction source is supplied alongside this report for review; its imports assume placement under tests/security as in the temporary snapshot. No required validation commands or repository source files were changed. No GitHub review or comments were posted.
