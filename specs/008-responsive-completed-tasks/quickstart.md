# Quickstart: Validate Responsive Completed Tasks Experience

## Purpose

Use this guide after implementation to validate [spec.md](spec.md), the presentation concepts in
[data-model.md](data-model.md), and the user-observable [UI contract](contracts/ui-contract.md).

## Prerequisites

- Node.js 24.x and npm
- Repository dependencies installed
- Local Na'aseh test environment configured
- Existing Playwright Chromium, WebKit, iPhone, and iPad projects available
- Safari Technology Preview installed for the independent native-WebDriver smoke when run on macOS
- No AWS credentials for local unit/component/browser validation; this feature adds no infrastructure

## Baseline validation

From the repository root:

```bash
npm run check:runtime
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: existing domain, browser, API, contract, security, restore, and infrastructure regressions
pass without schema, route, report-contract, sync, export, or build changes.

## Focused automated validation

Run focused suites once implemented:

```bash
npx vitest run \
  apps/web/test/features/completion-presentation.test.ts \
  apps/web/test/features/completion-bucketing.test.ts \
  apps/web/test/features/urgency-reporting.test.tsx \
  apps/web/test/features/stack-components.test.tsx \
  apps/web/test/features/responsive-layout.test.tsx \
  tests/performance/responsive-completed-tasks.test.ts
```

```bash
npx playwright test \
  tests/e2e/responsive-layout.spec.ts \
  tests/e2e/responsive-desktop.spec.ts \
  tests/e2e/responsive-dialogs.spec.ts \
  tests/e2e/responsive-accessibility.spec.ts \
  tests/e2e/responsive-state.spec.ts \
  tests/e2e/responsive-targets.spec.ts \
  tests/e2e/completion-dashboard.spec.ts \
  tests/e2e/archive-project-reporting-responsive.spec.ts \
  tests/e2e/personal-stack.spec.ts \
  tests/e2e/urgency-reporting.spec.ts \
  tests/e2e/enhanced-responsive.spec.ts
```

Expected:

- zero-count local/network/cache periods are hidden without changing totals or raw contracts;
- all-zero reports show the correct accessible empty state alongside sync/freshness status;
- Completed Tasks terminology is consistent while `/dashboard` remains valid;
- stack action geometry matches the UI contract;
- required viewport geometry, target size, focus, state-preservation, and performance assertions pass.

## Scenario 1: Terminology and stable route

1. Sign in and inspect the main navigation at desktop and collapsed phone widths.
2. Activate **Completed Tasks** by keyboard and touch.
3. Open `/dashboard` directly and reload it offline from a warmed application.
4. Search user documentation and accessible page names for the old page label.

Expected:

- navigation and the page heading say **Completed Tasks**;
- `/dashboard` remains the URL and saved links still work;
- the longer label is reachable within collapsed local navigation without document overflow;
- operational CloudWatch dashboard terminology and internal route identifiers remain unchanged.

## Scenario 2: Positive, zero, empty, and invalid completion periods

For daily, weekly, and monthly reports, exercise local, network, and encrypted-cache sources with:

1. mixed positive and zero periods;
2. all-zero periods without filters;
3. all-zero periods caused by Category, Project, or priority filters;
4. a period changing zero-to-positive and positive-to-zero after refresh;
5. malformed, duplicate, negative, non-integer, and non-finite test payloads.

Expected:

- only positive periods appear, in original chronological order;
- visible counts sum to the unchanged report total;
- urgency breakdown, details, sorting, pagination, and CSV remain unchanged;
- unfiltered and filtered empty states use accurate copy;
- invalid data uses the safe calculation/retry path rather than being silently hidden.

## Scenario 3: Synchronization and offline-state independence

1. Display a mixed or empty report while up to date.
2. Repeat with local changes pending sync.
3. Repeat from a warmed cache offline and while stale.
4. Exercise calculation, cursor-expired, context-changed, retry, restart, and reconnect states.

Expected:

- the same positive-period rule applies in every state;
- pending, offline, stale, last-sync, conflict, error, and recovery controls remain visible even when
  the chart is replaced by an empty state;
- reconnecting refreshes data without clearing filters or moving focus unexpectedly.

## Scenario 4: Supplied stack-control reproduction

At 320, 375, and 390 CSS-pixel widths:

1. Open Personal Stack with first, middle, last, and only-item cases.
2. Confirm Move up and Move down form an equal two-button row with a gap.
3. Confirm Move to position spans the row below.
4. Open the direct-position editor, apply a move by keyboard and touch, and inspect focus return.
5. Repeat offline with a pending operation and after conflict recovery.

Expected:

- no action overlaps, clips, merges borders, or leaves its stack-row container;
- every target is at least 44 by 44 CSS pixels;
- disabled state is apparent without color alone;
- reorder, live announcement, pending/conflict behavior, and moved-row focus remain unchanged.

## Scenario 5: Supplied filter-field reproduction

At 320, 375, 390, 768, and 1440 CSS-pixel widths:

1. Open task, archive, personal-stack, Completed Tasks, and project filters.
2. Populate search, scope/content, date, assignee, Category, Project, and priority controls.
3. Resize and rotate while values and validation messages are present.
4. Repeat with long labels and 200% text zoom.

Expected:

- standard labeled fields use one column at 480px and below;
- labels, controls, help, and validation remain one non-overlapping unit;
- compact priority controls wrap accessibly;
- desktop fields form bounded intentional grids with compatible heights;
- values, filter result, and logical focus context survive reflow.

## Scenario 6: Application-wide page/state audit

Use the FR-009 inventory and record pass/fail evidence for:

- sign-in; header/navigation; task list/post-its/details/subtasks/attachments/hidden memos;
- search/filters; Personal Stack; Google synchronization; Completed Tasks; projects/categories;
- archive/deletion; lists/global directory; groups; reminders/settings; administration; dialogs;
- loading, empty, populated, validation, success, offline, pending, stale, conflict, update, storage,
  retry, and error states supported by each area.

At every required profile verify:

- document overflow is within one-pixel rounding tolerance;
- controls remain inside their usable container and do not intersect unintentionally;
- content and focus indicators are not clipped;
- primary actions are reachable around safe areas, dynamic browser chrome, and on-screen keyboard;
- long content does not create page-level horizontal scrolling;
- visual and focus order match, and axe reports no new serious/critical violations.

## Scenario 7: Performance

1. Run the deterministic 366-period selector benchmark.
2. Run viewport-reflow measurement from settled state across the required widths.
3. Run the focused above-the-fold journey under the repository's degraded-network mobile profile.
4. Retain existing server completion-report performance results as an unchanged baseline.

Expected:

- selector completes within 100 ms;
- layout settles within 200 ms without state loss or layout loop;
- usable above-the-fold controls appear within two seconds;
- no new server work, Lambda duration, DynamoDB traffic, CloudWatch ingestion, or AWS resource appears.

## Full release gate

```bash
npm run validate
npm run test:e2e
npm run test:performance
npm run validate:pre-aws:browsers
npm run test:observability
npm run validate:workflows
```

On macOS with Safari Technology Preview:

```bash
npm run test:safari-preview
```

Before completion, attach the page/state audit matrix and record the final-diff review, Chrome/WebKit
desktop/iPhone/iPad evidence, accessibility and 200% zoom results, performance results, unchanged AWS
cost/observability review, documentation updates, and any non-obvious safe-area or presentation-data
invariant requiring a durable code comment.
