# Validation Quickstart: Content Scope and Collaborative Filtering

## Prerequisites

- Node.js 24 and installed workspace dependencies.
- Two active users (Steve and Heather), one active group containing both, and records covering private, public, grouped, cross-assigned, and legacy missing-assignee cases.
- Current stable Chrome and WebKit test environments.

## Focused Validation

1. Run domain, contract, API task/list/group/ranking, web search/filter/stack/list/group, sync, and migration tests introduced by this feature.
2. Verify type checking and linting.
3. Run the representative Chromium/WebKit browser journey.
4. Run the complete validation command.

Expected outcomes:

- Zero stored tasks lack an assignee after migration; new tasks default to the creator.
- Heather's default view includes Heather-assigned and shared-group tasks but excludes unrelated Steve public tasks.
- Filtering Assignee=Steve expands visibly and returns readable Steve tasks.
- “Steve OR Critical” and “Steve AND Critical” match their truth tables without duplicates.
- Personal Stack contains Heather-assigned and shared-group tasks only.
- Search defaults to Heather/group content and All content reveals other readable public content.
- Group members appear automatically with per-group loading/error behavior.
- Saving a List share gives Heather the parent and every existing active item; revocation removes both.

## Required Validation Runtime

Before changing `test:e2e:quick` or another required command, record its current test count, run `/usr/bin/time -p npm run test:e2e:quick`, add only one representative journey if needed, repeat the count and timing, and confirm the hosted required check remains at or below ten minutes. Keep exhaustive Boolean/browser/device combinations in `npm run test:e2e` and `npm run validate:pre-aws:browsers`.

### Measurements

- Before implementation: 30 tests across 19 files; local Chromium quick suite passed in 29.00 seconds (`user 37.84`, `sys 8.93`).
- Required-suite change: none. The representative explicit-sharing assertion was added to the existing full `list-sharing-copy.spec.ts` journey, so the quick suite remains intentionally unchanged.
- After implementation: 30 tests across 19 files; all passed in 28.31 seconds (`user 38.33`, `sys 9.35`). The measured required suite remains comfortably below the ten-minute limit.

### Final Results

- Type checking: passed.
- Lint and formatting: passed.
- Full unit/integration/security/contract suite: 344 files and 1,051 tests passed.
- Production build: passed; Vite reported the existing large-chunk advisory only.
- Focused Chromium filter journey: passed.
- Focused Chromium explicit list-sharing save journey: passed.
- Required Chromium quick suite: 30 of 30 passed.
