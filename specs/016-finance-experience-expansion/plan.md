# Implementation Plan: Finance Experience Expansion

**Branch**: Actual checkout `codex/task-item-creation-uploads` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)

**Feature identity**: `016-finance-experience-expansion`. The setup script reports this logical feature name as BRANCH, but `git branch --show-current` confirms the actual checkout above. No branch was created or switched by planning.

**Input**: `specs/016-finance-experience-expansion/spec.md`, including all 26 original requests, six follow-up requests, and the four accepted clarification answers from October 30–31.

## Summary

Extend the existing Finance web application with authoritative Finance routes and reordered navigation, an improved account interface, a separate self-managed Finance PIN, filterable transaction tables/modals, merchant editing and subcategories, existing-group budget selection, private receipts, personal dashboard flags, spending trends and Spend reporting. Make manual transaction entry available for all editable accounts. Add first-class Upcoming Expenses with required date/account/budget/group and explicit payment fulfillment, task creation/linking in both directions, and optional task-column/post-it details. Task completion never invents a financial payment. Add explicit original-expense refund relationships and confirmed partial allocation defaults; ordinary budgets save active and expose independent deactivate/reactivate controls. Offline expense dates retain their original local calendar context even if synchronization is late.

Reuse the existing domain/contracts, React PWA, request-driven Lambda functions, DynamoDB table, encrypted Dexie/outbox, S3/KMS/GuardDuty attachment lifecycle, backup workflows and CloudWatch controls. Add bounded Finance read projections and targeted mutation loads because the current full-scope repository hydration cannot meet the 100k-transaction performance target. Keep PIN management in auth, enforce its grant at every protected data entry point, and transfer receipts through authenticated ≤1 MiB ranges rather than public bearer download URLs. Current SimpleFIN per-connection setup needs no new application-wide Admin page; the conditional requirement is resolved by repository evidence.

This refresh completes design phases 0 and 1; the requested chained task workflow regenerates tasks.md afterward, followed by read-only analysis. No application implementation, deployment or application-test pass is claimed.

## Technical Context

**Language/Version**: TypeScript 5.8.3 strict; React 19.2.8; Node 24 development/validation and existing Node 22 Lambda runtime.

**Primary Dependencies**: Existing React/Vite, Dexie 4.0.11, MiniSearch 7.1.2, Zod 4.6.7, hash-wasm, Argon2id, AWS SDK v3/CDK, Vitest 5, Testing Library, Playwright 1.61. Reuse native Web Worker, File, Web Crypto and SVG. One maintained bounded Office-container inspection dependency may be added after runtime/license/security review; no chart package, Office renderer or new framework is required.

**Storage**: Existing on-demand, KMS-encrypted DynamoDB single table and GSIs, conditional revisions/idempotency receipts/feeds, new explicit key/date fact/reference collections and common month summaries; encrypted IndexedDB for authorized Finance records, pending commands and selected receipt bytes; existing private versioned S3 media bucket for immutable receipt originals, GuardDuty/policy verdicts and existing backups. No provisioned database or search cluster.

**Testing**: Vitest domain/contract/integration/security/restore/performance, Testing Library interactions, CDK assertions, Playwright Chromium/WebKit and phone/tablet journeys, 20-iteration throttled mobile performance runs, two representative users for timed acceptance. Required validation additions are separately measured and kept within the repository runtime rule.

**Target Platform**: Existing AWS serverless deployment in us-west-2, CloudFront/S3 PWA, API Gateway HTTP API and Lambda. Native Apple Finance screens remain out of scope; new sync capability must not break existing non-Finance clients.

**Supported Browsers**: Current stable Chrome and Safari/WebKit, desktop, supported iPhone/iPad browsers, keyboard and touch.

**Project Type**: Existing web/API/domain/CDK monorepo.

**Performance Goals**: At 50 accounts, 100k accessible transactions, 20 active budgets, five concurrent group members, 5k receipt metadata records and 1k active upcoming expenses, p95 actual matching rows/authorized widget values or confirmed full-scope empty content within two seconds across 20 mid-range-mobile Chromium runs at 4× CPU, 10 Mbps, 100 ms latency. Exact connected transaction-list and Spend report matching counts/totals finish automatically within ten seconds at p95 under the same profile. Progress and local modal details appear within one second. Loading/progress alone is never usable results; measure sparse/zero-match cold scopes and both row/aggregate readiness.

**Constraints**: Exact minor-unit money, distinct currencies, preserved user metadata through provider refresh, existing individual/group/catalog permissions, separate Journal and password-recovery PINs, required future-expense references, no automatic expense payment from task completion, 1–10,000,000-byte receipt allowlist, application-wide ≥5px button gaps, total Finance incremental AWS ceiling ≤$6.50/month (explicitly approved 2026-10-31), required PR runtime target ≤10 minutes with existing 15-minute timeout as headroom.

**Offline Strategy**: Keep device-key-encrypted cache/outbox and add a centralized Finance access controller plus independent worker-derived offline PIN verifier provisioned after connected verification. Queue supported manual transactions/upcoming edits/link proposals/personal flags and retain selected receipt bytes durably before calling them queued. Never queue passwords/PIN management/grants. On reconnect validate session epoch/security revision and revocations before protected hydration/replay; preserve rejected work for resolution. Offline fulfillment/refund linking is provisional until online capacity validation. Upcoming creates retain immutable enteredAt/localDate/timeZone; dueDate is validated against the original browser day and accepted unchanged as overdue after late sync. Activity changes affect new associations while preserving management of existing expense links. Explain uncached files, known stale security state and network-only operations.

**Security & Data Boundaries**: Self-only auth routes verify current password for PIN management; server grants bind user/session/epoch/revision/tab and are checked on each protected operation, including generic sync/task/attachment routes. An application lock does not claim Journal E2EE or resistance to compromised browser-origin code. Shared tasks never carry protected source metadata. Upcoming expenses and task links use source-access intersections; private-account/group-budget relationships cannot be sent blindly to group audiences. Receipt availability requires malware-clean plus bounded format-policy-clean on the exact version. Each content range checks current authorization; downloaded originals cannot be recalled.

**AWS Architecture & Cost Impact**: Extend existing auth/Finance/attachment Lambda functions, DynamoDB, S3/KMS, GuardDuty/EventBridge, backup/reconciliation, CloudWatch/SNS. No new always-on resource, streaming gateway or dedicated database. Automatic bounded query completion reuses Finance function asynchronous invocation and owner-only expiring DynamoDB job checkpoints with current-source access checks, maximum five parallel partitions and selective token/check/amount probes; no user pagination is required to calculate exact totals. Request-driven checking/projection work stays in existing functions unless measured isolation/runtime limits justify a bounded worker addition. [The implementation forecast](../../docs/operations/finance-experience-cost.md) supersedes the original $4.55 allocation with $6.05/month at explicit household retention/traffic assumptions, including 30% contingency. This is not measured billing: reprice in us-west-2 and replace the assumed 015 baseline before accepting implementation foundation and again before release. Steve approved a $6.50/month combined ceiling on 2026-10-31; forecasts above that ceiling require renewed approval. Receipt byte growth, backups/versions, scanning objects/bytes, fact write amplification, transfer, KMS and logs are principal drivers.

**CloudWatch Observability**: Extend existing structured 30-day Finance/application retention with safe operation, correlation ID, result, duration bucket, retry/check category and bounded counts; security events follow existing auth retention without copying Finance payloads. Exclude PIN/password, grants/session credentials, filenames/contents, search/filter strings, account/merchant names, amounts and balances. Emit/check metrics for unlock throttling, denied reads, upload/check/retry failures, stalled checks, range failure, projection lag/invariant drift, claim-capacity conflict and orphan cleanup. Route invariant failures immediately and repeated failures/stalled checks through existing alarms/SNS; sampled successful reads keep log cost bounded. Security audit records store safe actor/operation references under existing retention controls. Define runbook thresholds and retention in infrastructure tests before release.

**Scale/Scope**: Household workload and inherited Finance permissions. Nine prior journeys plus manual transactions, Upcoming Expenses and task/post-it linking (12 stories total). No Finance exports, OCR, bill-pay initiation, Office conversion, new recurrence engine, exchange-rate conversion or native Finance UI. Word/Excel original upload/download is included with strict inspection and preview fallback.

## Constitution Check

*Pre-research gate: PASS for the proposed approach; no known constitutional exception. Post-design gate below checks the completed artifacts. Implementation/release evidence remains required, not implied by a design PASS.*

| Gate | Pre-research result | Post-design result and evidence |
| --- | --- | --- |
| Security and explicit boundaries | PASS: individual/group/task/receipt/PIN boundaries identified | PASS: [data-model.md](data-model.md) and [sync-security.md](contracts/sync-security.md) define separate PIN lifecycle, source intersections, no admin reset path, cached read gate, generic-route protection, exact-version receipts and negative tests |
| Durability, recovery and observability | PASS: reuse versioned mutations, backups and safe logs | PASS: fulfillment/refund capacity ledgers and immutable confirmed refund classification, canonical aliases, legacy-link adapters, partial upload state, projection checkpoints, RPO/RTO baseline, restore tests and CloudWatch events are explicit |
| Offline preservation and reconnect | PASS: supported edits remain queued locally | PASS: PIN recovery preserves cache; bytes are durable before queued; separate Finance delivery checkpoints prevent lost events; original browser calendar context/delayed-overdue replay and epoch/revision/revocation first on reconnect |
| Chrome/Safari responsive support | PASS: all core UI paths applicable | PASS: [ui.md](contracts/ui.md) covers modal focus/history, touch/keyboard, 375/768px layouts, measured gaps, file fallback, graph value equivalents |
| Meaningful automated validation | PASS: existing test layers available | PASS: [quickstart.md](quickstart.md) defines targeted negative/invariant/restore/browser coverage and preserves required-suite measurement/hosted-runtime gates |
| Performance, AWS and cost | PASS: managed serverless reuse, explicit target and ceiling | PASS: bounded indexed fact queries/automatic query completion, 2s actual results/10s exact totals with 1s progress, Worker indexing, exact/partial coverage semantics, cost assumptions and reforecast gate replace unbounded hydration; no non-serverless component selected |
| Simplicity, review, comments and documentation | PASS: existing module boundaries reused | PASS: only justified new domain entities/read projections; rollout sequence, operations/recovery docs and final-diff invariant review are required |

**Post-design re-check**: PASS for Phase 1 design. No unapproved constitutional deviation. High-risk implementation gates are refund source/capacity/classification conservation, active/inactive versus closed budget migration, original offline date preservation, source-intersection feeds, generic-route Finance gate enforcement, offline forgotten-PIN pending-data survival, actual Office/PDF policy inspection, bounded report latency, atomic/retry-safe payment claims and compatibility migration. Cost/hosted runtime/performance are acceptance measurements still to obtain; design completion does not waive them.

## Project Structure

### Documentation (this feature)

```text
specs/016-finance-experience-expansion/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── finance-api.md
    ├── sync-security.md
    └── ui.md
```

`tasks.md` is generated later with `/speckit-tasks`.

### Source Code (repository root)

```text
packages/domain/src/finance/         # Existing money/transaction/budget/catalog/task-link invariants
                                    # New upcoming-expense, fulfillment, refund and shared dashboard/spend rules
packages/domain/src/attachment.ts    # Explicit financial-transaction parent, separate receipt policy
packages/domain/src/sync.ts          # Additive capability/entity and compatibility rules
packages/contracts/src/finance.ts    # Versioned HTTP/security/link/report schemas
apps/api/src/auth/                   # Self-only Finance security, grant and throttle services
apps/api/src/finance/                # Targeted UOW/read repositories, facts, expenses, claims, task links
apps/api/src/attachments/            # Receipt upload/policy/range access, audience and retention extension
apps/api/src/sync/                   # Finance-lane checkpoints and protected command handling
apps/api/src/groups/                 # Reuse actual memberships; no new Finance group registry
apps/web/src/app/                    # Authoritative routes and main navigation
apps/web/src/features/finance/       # Dashboard/accounts/transactions/upcoming/receipts/reports/catalog
apps/web/src/features/tasks/         # Form picker, batched relationships, column/post-it display
apps/web/src/features/search/        # Locked Finance result/decoration handling
apps/web/src/features/auth/          # User-facing Finance security setting
apps/web/src/db/                     # Encrypted metadata/bytes, migration and offline state
apps/web/src/search/                 # Worker-based authorized Finance indexes
apps/web/src/sync/                   # Outbox, dependency order, revocation and protected hydration
infra/lib/                          # API IAM/routes, media checking/retention, backup and observability
apps/web/test/                      # Component/local durability/lock/column behavior
packages/domain/                    # Money/classification/expense/payment invariant tests
infra/test/                         # Resource isolation, safety and retention assertions
tests/{contract,integration,security,restore,performance,e2e}/
docs/{architecture,operations,testing}/
```

**Structure Decision**: Extend existing modules; no replacement app or standalone Finance service. New pure financial rules belong in domain; request validation in contracts; source authorization/persistence in API; offline and presentation state in web. Security management stays in auth with existing pepper access. Receipt functions get only the necessary private-object prefix permissions. Keep the finance-import function's isolated connection-decryption boundary unchanged.

## Phase 0 Output

[research.md](research.md) resolves current source gaps, selected architecture, alternatives, SimpleFIN setup condition, receipt transport limits, auth/offline threat model, reporting projection strategy, cost envelope and validation allocation. All design decisions are explicit; there are no outstanding product clarifications.

## Phase 1 Output

- [data-model.md](data-model.md): fields, references, ownership, state transitions, claim capacity, indexes, migrations and recovery.
- [contracts/finance-api.md](contracts/finance-api.md): security, existing/new Finance, expense, fulfillment, link, dashboard/report and receipt interfaces.
- [contracts/sync-security.md](contracts/sync-security.md): capability negotiation, legacy clients, independent Finance checkpoints, access intersections, lock lifecycle, retry/recovery and negative contracts.
- [contracts/ui.md](contracts/ui.md): routes, menu, modal history/focus, task/post-it behavior, responsive layouts and receipt interaction.
- [quickstart.md](quickstart.md): prerequisites, baseline commands, acceptance fixtures, meaningful validation and required release evidence.

## Implementation Sequencing for Task Generation

1. **Foundation and feasibility**: Capture the existing required-suite count/runtime before changing it. Audit unfinished 015 dependencies; add schemas/legacy fixtures and shared pure spend/refund eligibility, same-allocation predicates and independent reference tests BEFORE projections or budget widget consumers. Replace the new-feature full-scope read path with bounded repositories and benchmark a cold/warm report spike. Price the explicit workload and complete receipt content-check dependency review. Do not call these implementation gates already passed.
2. **Security and compatibility boundary**: Add self-only auth security/grants and offline access controller, gate every generic path, negotiate new client capability and independent Finance checkpoints, preserve pending data through reset/revocation. Establish denial tests before exposing new content paths.
3. **Core usable account/transaction/catalog/budget slice**: Authoritative routes/main menu, separate new-account page, manual transaction buttons on all account types, modal/filter table, payment/check metadata, subcategories/merchant editing, existing-group selector, active-on-save and deactivate/reactivate separately from close/reopen, explicit refund link/correct/remove with confirmed partial allocations, and shared action-gap token. Preserve prior Finance flows.
4. **Upcoming Expense and task slice**: First-class future obligations/claims with immutable original browser entry context and delayed-overdue replay, dashboard source, explicit payment/reversal behavior, many-to-many task links with legacy adapter, task form picker, optional task/post-it details, batched safe projections and retry/partial-success handling.
5. **Receipt slice**: Finance parent, local bytes/outbox, upload/retry/cancel, exact-version format and malware verdicts, range download/preview, browser filtering, Finance retention and restore tests. Deny generic-route bypass.
6. **Dashboard/report slice**: Personal flags, account/budget/activity widgets, exact default period summaries, line graph/table and all filtered Spend dimensions using the Foundation shared rules with explicit partial coverage and automatic exact totals by ten seconds; progress cannot satisfy the two-second results gate. Reconcile fact totals against reference ledger fixtures and validate access changes.
7. **Release evidence and documentation**: Migration/restore/failure tests, Chromium/WebKit phone/tablet coverage, 20-run performance and two-user timed workflows, actual cost reforecast, before/after test count/time and hosted total if required validation changed, final-diff/security/data-loss review and user/operations/recovery docs. Leave no unresolved high-risk acceptance issue.

## Requirement Coverage for Tasks

| Requirement scope | Design artifact / slice |
| --- | --- |
| FR-001–FR-007 | UI routes, account layout, conditional SimpleFIN finding, global action-gap audit; slice 3 |
| FR-008–FR-013 | Self auth/grants, offline access controller, throttles, session epoch; slice 2 |
| FR-014–FR-020 | Tables/filter contracts, modal history, payment/check persistence and provider preservation; slice 3 |
| FR-021–FR-026 | Classification history, merchant collision/permissions, group lookup, active-on-save/deactivation and account-less budgets; slice 3 |
| FR-027–FR-032 | Receipt lifecycle/content checking/private range access/browser/retention; slice 5 |
| FR-033–FR-043 | Owner-only flags, source-filtered dashboard/report facts, explicit linked refund model/UI/capacity and shared currency/allocation accounting; slices 1, 3 and 6 |
| FR-044–FR-045 | All-account manual entry and canonical provisional reconciliation; slice 3 |
| FR-046–FR-050 | Upcoming Expense required relationships, original local calendar context/delayed sync, forecast/payment split and claim ledger; slice 4 |
| FR-051–FR-056 | Many-to-many task targets, Add Task/form selection/post-it column/privacy/offline/retry; slice 4 |
| NFR-001–NFR-008 | Cross-cutting gates and validation guide; all slices |
| SC-001–SC-015 | Original/follow-up coverage retained; timed, invariant, browser, file, access, cost and runtime acceptance in quickstart |

## Complexity Tracking

No constitution exception. Bounded read projections are justified by observed full-scope hydration and the 100k latency target. The transaction claim ledger is necessary to prevent duplicate payment fulfillment; refund credit/original-allocation ledgers separately prevent duplicate expense offsets. Shared spending rules are Foundation-owned before either projection or UI calculations. Budget activity is separate from closure/reconciliation, and original entry date context is distinct from server acceptance time. An independent Finance sync lane is necessary to keep non-Finance sync running while locked without losing protected changes. The range adapter reuses existing HTTP API/Lambda and avoids a new streaming origin. A small audited Office-container dependency is preferable to inventing a full format parser. Any future always-on service, cost ceiling increase or validation expansion above ten minutes remains subject to the explicit approval rules; none is authorized by this plan.
