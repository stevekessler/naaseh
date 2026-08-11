# Validation Record

## Baseline — 2026-08-11

- Working tree was already dirty before feature 008 implementation. Existing account/task UX work
  overlaps `App.tsx`, report/filter/task components, and `app.css`; those changes are preserved.
- Supplied screenshot 1 reproduces canonical zero-filled report periods being rendered as chart
  rows even though the aggregate total is independent.
- Supplied screenshot 2 reproduces unstyled inline Personal Stack controls whose borders visually
  merge and whose third action does not occupy its own row.
- Supplied screenshot 3 reproduces `.filter-fields label { flex: 1 1 120px }` squeezing ordinary
  labeled fields until their control rectangles overlap.
- Baseline inspection found no `.stack-move-controls` layout rule and no 480px one-column standard
  field rule. Raw server/local bucketing intentionally remains zero-filled.
- Ignore configuration was verified: `.gitignore`, `.dockerignore`, `.prettierignore`, and flat
  ESLint ignores already contain the required Node/build/coverage/environment patterns.

## Commands and results

| Date | Scope | Command | Result |
|---|---|---|---|
| 2026-08-11 | prerequisites | `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` | PASS; feature 008 and tasks detected |
| 2026-08-11 | repository validation | `npm run validate` | PASS |
| 2026-08-11 | focused unit/component/contract/performance | `npx vitest run apps/web/test/features/completion-presentation.test.ts apps/web/test/features/completion-bucketing.test.ts apps/web/test/features/urgency-reporting.test.tsx apps/web/test/features/stack-components.test.tsx apps/web/test/features/responsive-layout.test.tsx tests/contract/completion-reporting.contract.test.ts tests/performance/responsive-completed-tasks.test.ts` | PASS; 41 tests |
| 2026-08-11 | focused responsive browser matrix | `npx playwright test tests/e2e/completion-dashboard.spec.ts tests/e2e/archive-project-reporting-responsive.spec.ts tests/e2e/responsive-layout.spec.ts tests/e2e/responsive-desktop.spec.ts tests/e2e/responsive-dialogs.spec.ts --project=chromium --project=webkit --project=iphone --project=ipad` | PASS; 40 tests |
| 2026-08-11 | responsive accessibility/state/targets | focused Chromium and iPhone Playwright runs | PASS after exact navigation names, priority touch target, Stack status locator, and 320px overflow corrections |
| 2026-08-11 | reflow budget | `npx playwright test tests/e2e/responsive-state.spec.ts --project=chromium --project=iphone` | PASS; 2 tests, two-frame layout settle and end-to-end resize each under 200ms |
| 2026-08-11 | priority/navigation regressions | `npx playwright test tests/e2e/post-it-accessibility.spec.ts tests/e2e/urgency.spec.ts tests/e2e/personal-stack.spec.ts --project=chromium --project=iphone` | PARTIAL; 12 passed, 2 existing offline lazy-route failures when Lists is first loaded after disconnect |
| 2026-08-11 | performance | `npm run test:performance` | PASS; 12 files, 22 tests; feature projection test 2ms |
| 2026-08-11 | observability | `npm run test:observability` | PASS; 4 files, 24 tests |
| 2026-08-11 | workflow integrity | `npm run validate:workflows` | PASS; 3 workflows use immutable action SHAs |
| 2026-08-11 | repository browser suite | `npm run test:e2e` | FAIL/STOPPED after 58 passed, 10 failed, 2 interrupted, and 2 skipped; failures are stale feature-007 admin/group/project/priority locators and naming assertions, not the focused feature-008 matrix |
| 2026-08-11 | pre-AWS browser gate | `npm run validate:pre-aws:browsers` | BLOCKED at formatting by pre-existing unformatted `apps/api/src/sync/handler.ts` and overlapping `apps/web/src/app/App.tsx`; browser phase did not start |
| 2026-08-11 | formatting | `npm run format:check` | FAIL on the same two pre-existing/overlapping dirty-worktree files; feature-008-only files are formatted |

The Vite preview logs include expected `ECONNREFUSED 127.0.0.1:3000` proxy noise when browser tests
exercise the local test-mode fallback without a separately running API. The browser assertions still
completed against the deterministic local repositories and mocked report endpoints.

## Delivered evidence

- The navigation and page heading use **Completed Tasks**, while direct and offline navigation retain
  `/dashboard`.
- Local, remote, and cached report payloads are projected only after source selection. Zero periods
  are omitted; raw zero-filled aggregates, totals, urgency breakdowns, detail rows, CSV, and pending
  synchronization remain unchanged. Invalid periods use the existing safe recovery presentation.
- The supplied phone defects are covered at 320, 375, and 390 CSS pixels: standard labeled fields
  stack, stack direction buttons form an equal two-column row, and the position action/editor spans
  the following row.
- Targeted Chromium, WebKit, iPhone, and iPad geometry checks passed at phone, tablet, and desktop
  widths. Focus, 200% text, reduced motion, touch targets, dialog reachability, and resize value
  retention passed in the focused suites.

## Contract boundary

Feature 008 is browser presentation only. The `/dashboard` route, HTTP schemas, zero-filled raw
aggregates, encrypted cache, completion details/CSV, synchronization calculations, storage, AWS,
CloudWatch, authorization, and protected-data exclusions are regression boundaries.

Final-diff review found no feature-008 change under API contracts, persistence schemas, sync
protocols, infrastructure, or observability. The dirty `apps/api/src/sync/handler.ts` diff predates
this feature and was not edited. Presentation filtering neither deletes nor rewrites completion
events, so offline recovery and data durability remain unchanged. No new external call, AWS
resource, telemetry field, protected content, or recurring cost was introduced.

## Remaining release blockers

The application-wide FR-009 matrix cannot honestly be closed at 100% while the repository-wide
browser gate is red. The targeted feature-008 rows pass, but older account/admin work in the shared
dirty tree has stale selectors and an offline lazy-route test that must be reconciled before the full
mobile/desktop/accessibility audit and native Safari Technology Preview gate can be signed off.
