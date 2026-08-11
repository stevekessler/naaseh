# Implementation Plan: Responsive Completed Tasks Experience

**Branch**: `008-responsive-completed-tasks` | **Date**: 2026-08-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-responsive-completed-tasks/spec.md`

## Summary

Rename the completion-report navigation and page to **Completed Tasks**, retain the stable
`/dashboard` route, and derive a browser-only presentation projection that omits nonpositive report
periods after local, network, or encrypted-cache source selection. Raw report payloads, totals,
urgency breakdowns, detail rows, exports, persistence, and synchronization remain unchanged.

Complete an application-wide responsive audit using additive, component-scoped CSS primitives:
bounded content, coherent field grids, `min-width: 0`, wrapping action groups, safe-area-aware fixed
surfaces, consistent control states, and 44-by-44-pixel targets. At 480 CSS pixels and below,
standard labeled fields use one column while compact controls may remain intentionally grouped. The
clarified stack controls use an equal Move up/Move down row and a full-width Move to position row.
Geometry, accessibility, state preservation, offline states, and performance are verified through
focused component tests and a table-driven Chromium/WebKit/iPhone/iPad Playwright matrix.

## Technical Context

**Language/Version**: TypeScript 5.8.3 on Node.js 24.x; React 19.1 browser code and CSS

**Primary Dependencies**: Existing React 19.1.1, React DOM 19.1.1, Vite 7.3.6,
`vite-plugin-pwa` 1.0.2, Dexie 4.0.11, `@naaseh/domain`, Vitest 3.2.6,
React Testing Library, Playwright 1.61.1, and `@axe-core/playwright`; no new runtime or UI dependency

**Storage**: No schema or persistence change. Existing encrypted Dexie/IndexedDB completion-report
cache and local Completion Events remain raw and zero-filled; existing DynamoDB report data is
unchanged.

**Testing**: Existing Vitest unit/component/integration/contract/security/performance suites;
Playwright desktop Chromium, desktop WebKit, iPhone 14, and iPad Pro 11 projects; axe accessibility
checks; typecheck, lint, build, format, Safari Technology Preview smoke, and pre-AWS browser gates

**Target Platform**: Existing installable offline-capable browser PWA delivered through the current
CloudFront/S3 deployment and backed by the existing AWS serverless API

**Supported Browsers**: Current stable Chrome and Safari/WebKit, including relevant iOS/iPadOS versions

**Project Type**: TypeScript monorepo web application with a React PWA, serverless API, shared
domain/contracts packages, and CDK infrastructure-as-code

**Performance Goals**: Filter and classify a 366-period completion result within 100 ms; responsive
reflow settles within 200 ms; each scoped page presents usable above-the-fold controls within two
seconds under the existing representative mobile/degraded-network profile

**Constraints**: No change to `/dashboard`, HTTP contracts, report aggregation, exports, storage,
sync calculations, authorization, visual identity, or AWS resources. No unintended page-level
horizontal overflow from 320 through 1440 CSS pixels. Standard controls remain at least 44 by 44 CSS
pixels, usable at 200% text zoom, and reachable around safe areas and browser chrome. DOM order must
remain the logical visual/focus order; responsive behavior uses CSS rather than viewport-dependent
component state.

**Offline Strategy**: Service-worker-cached application code performs naming, positive-period
projection, empty-state selection, and responsive layout entirely in the browser. Local Completion
Events and encrypted report cache remain readable offline. Pending, stale, offline, conflict, retry,
and reconnect status stay orthogonal to whether chart periods are visible. Resize and reconnection
must preserve form values, filters, dialogs, focus context, and pending edits.

**Security & Data Boundaries**: The feature reads only completion aggregates, existing authorized
page content, control state, and synchronization state already available to the signed-in actor. It
adds no writes, sharing rights, or authorization evidence. Protected labels, task content, filters,
field values, screenshots, and off-screen alternatives are excluded from diagnostics. Responsive
changes preserve private/group/admin visibility and do not render hidden data into accessible names.

**AWS Architecture & Cost Impact**: Reuse the existing API Gateway, Lambda, encrypted on-demand
DynamoDB table, KMS, backup, CloudFront/S3 PWA hosting, and CloudWatch configuration without
modification. The work adds no Lambda execution, new managed service, provisioned capacity, or
always-on compute. Principal AWS cost impact is effectively zero; the selected client-only solution
is cheaper and simpler than changing server aggregation or adding infrastructure.

**CloudWatch Observability**: No new production telemetry is warranted for deterministic layout and
presentation filtering. Existing 30-day application logs, reporting/sync metrics, alarms, safe
correlation, and protected-data redaction remain unchanged. Automated test diagnostics may record
viewport sizes and anonymous geometry but never screenshots containing production data, field
values, task content, filters, identifiers, or report totals.

**Scale/Scope**: Audit all current production user-facing areas and meaningful states named by
FR-009 across 88 feature files and the shared application shell. Verify seven widths (320, 375, 390,
768, 1024, 1280, and 1440 CSS pixels), representative portrait/landscape mobile orientations,
200% text zoom, touch/keyboard input, reduced motion, and local/network/cache/offline/pending/error
report states. Completion presentation filtering supports at least 366 periods without changing the
existing report-service scale or performance fixtures.

## Constitution Check

*GATE: Passed before Phase 0 research and passed again after Phase 1 design.*

- **Security and data boundaries — PASS**: The design changes only authorized browser presentation,
  preserves every content/role/collaboration boundary, adds no secret or data flow, and prohibits
  protected data in geometry diagnostics, screenshots, accessible alternatives, and logs.
- **Data durability and observability — PASS**: Raw Completion Events, aggregate buckets, totals,
  cache payloads, exports, filters, outbox, sync records, backup, restore, retries, and conflicts are
  unchanged. Invalid presentation data becomes a visible safe error. Existing reporting/sync
  observability remains sufficient and no silent data rewrite is introduced.
- **Browser offline operation and resynchronization — PASS**: All new behavior is in cached browser
  code, operates on local or encrypted cached reports, keeps connectivity/pending/stale status
  visible, and preserves unsaved state through reflow and reconnection.
- **Supported browsers — PASS**: Mobile-first CSS, safe-area handling, native controls, logical DOM
  order, 44-pixel targets, visible focus, reduced motion, 200% zoom, and Chromium/WebKit desktop,
  iPhone, and iPad validation are explicit in the UI contract and quickstart.
- **Automated testing — PASS**: Pure presentation selector and component tests cover positive/zero/
  invalid buckets and empty/status states. Focused Playwright geometry, touch, keyboard, axe,
  orientation, resize, safe-area, and offline tests cover the responsive inventory. Existing API,
  contract, integration, security, and performance suites remain regression gates.
- **Performance and AWS architecture — PASS**: The 100 ms, 200 ms, and two-second targets are
  measurable. The design is client-only, reuses all serverless infrastructure, has effectively zero
  AWS cost impact, and is simpler than a server contract or aggregation change.
- **Simplicity, review, comments, and documentation — PASS**: Additive shared CSS primitives and
  targeted component rules avoid a new design-system layer or UI dependency. A page/state audit
  matrix, focused contract, quickstart, user terminology update, final-diff re-review, and comments
  only for non-obvious safe-area/data-invariant decisions are planned.

## Project Structure

### Documentation (this feature)

```text
specs/008-responsive-completed-tasks/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ui-contract.md
└── tasks.md                    # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/src/
├── app/
│   ├── App.tsx                # Navigation label and page assembly
│   └── router.tsx             # Stable /dashboard route (unchanged)
├── components/                # Shared controls included in responsive audit
├── features/
│   ├── reports/
│   │   ├── CompletionDashboard.tsx
│   │   ├── CompletionFilters.tsx
│   │   ├── completion-bucketing.ts
│   │   └── report-client.ts
│   ├── stacks/
│   │   ├── PersonalStackPage.tsx
│   │   ├── StackList.tsx
│   │   ├── StackRow.tsx
│   │   └── StackMoveControls.tsx
│   └── **/                    # Page/state inventory from FR-009
└── styles/
    ├── tokens.css
    ├── global.css
    └── app.css

apps/web/test/features/
├── completion-bucketing.test.ts
├── urgency-reporting.test.tsx
├── stack-components.test.tsx
└── responsive-layout.test.tsx

tests/
├── e2e/
│   ├── responsive-layout.spec.ts
│   ├── completion-dashboard.spec.ts
│   ├── archive-project-reporting-responsive.spec.ts
│   ├── personal-stack.spec.ts
│   ├── urgency-reporting.spec.ts
│   └── enhanced-responsive.spec.ts
└── performance/
    └── responsive-completed-tasks.test.ts

docs/user/
├── archive-project-reporting.md
└── urgency-stack-ranking.md
```

**Structure Decision**: Keep the change inside the existing PWA. A pure report presentation selector
belongs beside completion bucketing and is applied by `CompletionDashboard` only after it selects the
local, network, or cached source. Shared responsive tokens/primitives live in the existing stylesheet,
with focused class rules for stack controls, filters, dialogs, and pages that cannot use a general
primitive. Existing routes, API packages, persistence, infrastructure, and server tests are retained
unchanged. A UI contract is appropriate because the public behavior changes while the HTTP contract
does not.

## Complexity Tracking

No constitution violation or approved exception is required. The application-wide audit is broad,
but it uses existing CSS, React, and test infrastructure. A new component library, JavaScript
breakpoint service, server response version, database schema, visual-regression service, or AWS
resource was rejected because each adds cost or state without addressing a present requirement better
than additive CSS and geometry/accessibility tests.
