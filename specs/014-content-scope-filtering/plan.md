# Implementation Plan: Content Scope and Collaborative Filtering

**Branch**: `014-content-scope-filtering` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-content-scope-filtering/spec.md`

## Summary

Separate server-enforced read authorization from viewer-specific presentation scope. Make every task carry one individual assignee, migrate legacy missing assignees to the owner, make unlocked tasks globally readable, and default Tasks/Search to directly assigned plus active-group content. Add multi-value assignee/group filters and a top-level Match all/Match any rule, while explicit cross-user conditions deliberately expand to all readable content. Narrow Personal Stack eligibility to directly assigned or active-group tasks. Automatically display authorized group rosters. Replace immediate list-audience mutation with an explicit save state and transition the parent plus all existing items between synchronization audiences.

The implementation extends the existing TypeScript domain/contracts, Lambda/DynamoDB audience feeds, encrypted Dexie cache/outbox, React filter/list/group/stack views, and current test layers. It introduces no new service or dependency.

## Technical Context

**Language/Version**: TypeScript 5.8.3 strict mode on Node.js 24; React 19.2.8

**Primary Dependencies**: Existing React/Vite, Dexie, MiniSearch, Zod, AWS SDK v3, AWS CDK, Vitest, Testing Library, Playwright

**Storage**: Existing on-demand DynamoDB single-table records and audience feeds; encrypted IndexedDB/Dexie task/list/group cache and mutation outbox

**Testing**: Vitest 3.2.6, Testing Library, Playwright 1.61.1 Chromium/WebKit, API/domain/contract/sync/migration tests

**Target Platform**: AWS serverless web application delivered through CloudFront/S3 with API Gateway HTTP API and Node.js Lambdas

**Supported Browsers**: Current stable Chrome and Safari/WebKit, including relevant iPhone/iPadOS versions

**Project Type**: TypeScript monorepo web application with React PWA, Lambda API, shared domain/contracts, and AWS CDK infrastructure

**Performance Goals**: With 50,000 readable work records, 10 active groups, and 500 users, 95% of scope/filter/search interactions show results or durable loading feedback within one second. Group rosters progressively render. Required hosted validation stays at or below ten minutes.

**Constraints**: Authorization precedes filtering; Boolean OR never broadens authorization or Personal Stack eligibility. No unassigned tasks. No silent list-sharing success. No new always-on compute. Preserve relative personal-stack order during eligibility migration. Avoid protected text, search terms, names, and membership contents in logs.

**Offline Strategy**: Continue synchronizing authorized audience feeds into encrypted Dexie. Apply presentation filtering locally. Save list-sharing drafts locally only as UI state; an accepted offline save queues one encrypted parent-list mutation, shows Pending sync, and on server acceptance atomically emits parent and child grant/revocation feed changes. Process access-control and audience tombstones before allowing cached content to reopen. Preserve URL filter state and pending/conflict states across supported browser restarts where existing outbox behavior permits. Legacy browser tasks missing an assignee are normalized to their owner and immediately rewritten in the encrypted local store.

**Security & Data Boundaries**: Private tasks remain owner-only; unlocked tasks become readable to every active user even when grouped. Group affects default discovery and stack eligibility, not task read authorization. Lists intentionally retain owner-only private, group-only shared, and account-public modes. Only list owners may change sharing. Group roster reads remain limited to active members under the existing group-detail policy. Administrators retain audited privileged reads without receiving broader default presentation scope.

**AWS Architecture & Cost Impact**: Reuse API Gateway, request-driven Lambdas, DynamoDB current records/revisions/mutation receipts/audience feeds, KMS, CloudWatch, PITR, and backups. Principal incremental costs are larger public task feeds and list-child audience transition writes. The implemented parent-and-child list transition is one atomic write bounded by DynamoDB's transaction size; an asynchronous resumable transition was intentionally not introduced for the current small deployment. No new datastore or provisioned compute.

**CloudWatch Observability**: Existing request/error telemetry covers rejected mutations and failed list transactions without logging task/list text, search terms, user/member names, memo content, or raw filter values. This implementation does not add high-cardinality filter telemetry or a separate migration metric stream.

**Scale/Scope**: Existing small deployment (about 50 users), with local filtering designed for the specification's 50,000 readable work records, 500 selectable users, 10 active groups, and offline multi-device use. Sharing changes for unusually large lists that exceed one DynamoDB transaction remain a follow-up scale concern.

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

- **Security and data boundaries — PASS**: Authorization, default scope, explicit expansion, task/list differences, roster policy, owner-only sharing mutation, revocation, and negative disclosure tests are explicit.
- **Data durability and observability — PASS WITH BOUNDARY**: Mandatory assignment is enforced at domain boundaries; legacy browser records are rewritten locally and legacy server records normalize to owner on read before their next durable write. List audience transitions are atomic and idempotent within the DynamoDB transaction bound; oversized-list orchestration remains a documented scale follow-up. Outbox/conflict feedback and protected-data-safe logging are preserved.
- **Browser offline operation and resynchronization — PASS**: Encrypted cache filtering, queued sharing mutation, visible pending/conflict states, and revocation-before-reopen behavior are included.
- **Supported browsers — PASS**: Desktop/mobile controls use native accessible fieldsets, radio/select/combobox behavior, progressive roster status, and explicit save feedback with Chromium/WebKit coverage.
- **Automated testing — PASS**: Domain truth tables, API authorization/audience tests, Dexie/outbox tests, component tests, and representative quick browser coverage are planned. Quick-suite counts and timing must be measured before and after adding a required journey.
- **Performance and AWS architecture — PASS**: The implementation reuses the serverless topology; public-feed and atomic audience-transition write costs are documented, along with the oversized-list boundary.
- **Simplicity, review, comments, and documentation — PASS**: One shared scope/filter evaluator prevents divergent views; existing repositories and feeds are extended without a new framework or service. Final review and documentation are planned.

**Post-implementation re-check**: PASS WITH DOCUMENTED SCALE BOUNDARY. Authorization, presentation scope, required assignment, offline revocation cleanup, accessible controls, and validation runtime were verified. Server legacy rows are compatibility-normalized until their next write, and list sharing is atomic only while its complete audience transition fits one DynamoDB transaction; these are the two deployment follow-ups to reconsider if the data set grows beyond current operating assumptions.

## Project Structure

### Documentation (this feature)

```text
specs/014-content-scope-filtering/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api.md
│   ├── sync.md
│   └── ui.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/
├── domain/src/             # Required task assignee, authorization, scope/filter rules
└── contracts/src/          # Filter query and task/list/group wire validation

apps/api/
├── src/tasks/              # Public task reads and mandatory-assignee enforcement
├── src/lists/              # Complete list audience transition
├── src/groups/             # Roster authorization/read behavior
├── src/ranking/            # Assignment-based Personal Stack eligibility
└── src/sync/               # Audience feed and revocation ordering

apps/web/
├── src/app/                # Route-specific scope state and shared view wiring
├── src/db/                 # Required-assignee local migration/cache indexes
├── src/search/             # Shared Boolean filter/scope evaluator
├── src/sync/               # Pending sharing and revocation application
└── src/features/           # Tasks, Search, Stack, Groups, and Lists UI

tests/e2e/                  # One representative required journey; exhaustive variants remain full-suite
```

**Structure Decision**: Extend existing monorepo boundaries. Put invariant and filter semantics in the domain/search layers, wire validation in contracts, authorization and persistence in the API, encrypted offline projections and UI in the web app, and browser coverage in the existing Playwright suites.

## Complexity Tracking

No constitution violations require an exception. The only multi-step operation is complete list audience transition, which is required for durable child grants/revocations and will reuse existing idempotency and feed patterns.
