# Tasks — Contacts and Inventory

**Feature** [spec.md](spec.md) · [plan.md](plan.md) · [data-model.md](data-model.md) · [quickstart.md](quickstart.md)

Write story tests and confirm they fail against the supported baseline before implementing the behavior they describe. Paths below are repository-relative targets. **[P]** indicates work in separate files that can run concurrently once its prerequisites are complete.

## Phase 1 — Setup

- [X] T001 Verify the pointer in `.specify/feature.json`, record the supported main SHA, and use an isolated feature branch with pending Finance and Mac/iOS work excluded. Use Node 24 and keep the baseline’s Playwright 1.61.1 lockfile unless a concrete feature requirement warrants an upgrade. Record the resolved runtime in `docs/testing/contacts-inventory-validation.md`.
- [X] T002 Configure standalone UI and API build entries and the shared contracts workspace in `apps/contacts-inventory/package.json`, `apps/contacts-inventory/vite.config.ts`, `apps/api/package.json`, `packages/contacts-inventory-contracts/package.json`, `tsconfig.json`, and `package-lock.json`. Build immutable feature artifacts on the supported baseline.
- [X] T003 [P] Create synthetic fixtures for two named workspace members, a separate admin, an outsider, and two compatible release IDs in `tests/fixtures/contacts-inventory.ts`.

## Phase 2 — Foundation

**Checkpoint** — A fixture feature can activate and roll back on the prepared baseline. Member access, persistence and offline boundaries are ready for story tests.

- [X] T004 [P] Write host and deployment contract tests for scoped manifest/asset paths, unavailable or incompatible releases, stale clients, existing navigation, and isolated API/resource ownership in `tests/contract/contacts-inventory-host.check.ts` and `infra/test/contacts-inventory.check.ts`.
- [X] T005 [P] Write shared workspace and sync integration tests for outsider/admin denial, CSRF, conditional revisions, actor-scoped replay, paged change delivery, and concurrent delete/edit in `tests/integration/contacts-inventory-sync.check.ts`.
- [X] T006 Define host, manifest, API headers, workspace records, sync cursors and tombstone schemas in `packages/contacts-inventory-contracts/src/host.ts` and `packages/contacts-inventory-contracts/src/api.ts`.
- [X] T007 Build the feature loader, compatible offline startup, safe fallback and navigation slots in `apps/web/src/features/contacts-inventory-host/loader.ts`, `apps/web/src/app/router.tsx`, `apps/web/src/app/App.tsx`, `apps/web/src/components/ListsNavigation.tsx`, and `apps/web/src/components/AdminNavigation.tsx`. Refresh on foreground and withdrawal. Hide feature slots when the online manifest is inactive or incompatible.
- [X] T008 Wire the session-bound request and vault adapters, lifecycle events, sign-out warnings, and immutable-only worker caching in `apps/web/src/features/contacts-inventory-host/adapters.ts`, `apps/web/src/features/auth/sign-out.ts`, `apps/web/public/push-sw.js`, and `apps/web/vite.config.ts`.
- [X] T009 Add a retained private artifact origin for immutable assets and the uncached manifest. Exclude the feature namespace from SPA rewrites and core pruning and expose stable API/authorizer IDs in `infra/lib/web-stack.ts` and `infra/lib/api-stack.ts`. Scope upload CSP and CORS to the approved origins and keep private API responses outside edge caching.
- [X] T010 Add retained on-demand DynamoDB, versioned encrypted media, backup coverage, a protected copy of deletion history for restore reconciliation, and least-privilege roles in `infra/lib/contacts-inventory-data-stack.ts` and `infra/bin/contacts-inventory.ts`.
- [X] T011 Implement release-pinned feature routes with host session authorization and CSRF in `infra/lib/contacts-inventory-release-stack.ts` and `apps/api/src/contacts-inventory/handler.ts`. Derive the workspace from the two configured account IDs. Both members automatically read, edit and delete every Contacts and Inventory record, including Medicine. Require admin authority for catalog writes.
- [X] T012 Build shared persistence with conditional revisions, actor-scoped mutation receipts, sequenced metadata-only changes, and atomic tombstone and ledger writes in `apps/api/src/contacts-inventory/repository.ts`. Implement checkpoint, paged snapshots and strongly consistent change resolution in `apps/api/src/contacts-inventory/sync.ts`. Enforce workspace generation on cursors and writes and exclude deleted fields from replays and changes.
- [ ] T013 Implement the account-bound encrypted browser store, transactional outbox, snapshot reconciliation and tombstone-aware replay in `apps/contacts-inventory/src/offline/store.ts` and `apps/contacts-inventory/src/offline/replay.ts`. Verify reconnect and Safari foreground replay, cancel stale work on account change, and purge deleted payloads while retaining actionable failure metadata. Preserve eligible drafts for explicit reconciliation across restore generations.
- [X] T014 Add redacted timing and outcome logs, 30-day application and 90-day audit retention, bounded metrics, and alarms for sustained failures, scan and reconciliation backlog, and backup health in `apps/api/src/contacts-inventory/telemetry.ts` and `infra/lib/contacts-inventory-observability.ts`.
- [X] T015 Implement protected feature deploy and rollback in `.github/workflows/deploy-contacts-inventory.yml` and `tools/release-contacts-inventory.mjs`. Publish immutable artifacts, probe authorization and assets, and switch the manifest last. Retain the prior runnable release and handle first-install withdrawal and stale tabs calling withdrawn releases.
- [ ] T016 Build a local same-origin fixture with real built assets, a switchable manifest and a test API in `tests/fixtures/contacts-inventory-host.ts`. Verify install and rollback on the prepared host with and without Finance in `tests/e2e/contacts-inventory-release.spec.ts`. Record fallback, failure handling, artifact retention, Finance fingerprints and native contract evidence in `docs/testing/contacts-inventory-validation.md`.

## Phase 3 — US1 Manage and filter contacts (P1)

**Goal** — One Contacts directory appears under Lists. Both members can create, edit, filter and delete shared contacts.

**Independent test** — Create a CO Prescriber with a preferred phone number, make an edit from the other account, filter to the original UUID, then delete it and verify that access ends for both.

- [X] T017 [P] [US1] Test contact field validation, default-number clearing, case-insensitive names and digit matching, and admin catalog permissions in `tests/contract/contacts-inventory-contacts.check.ts`.
- [X] T018 [P] [US1] Write Chromium/WebKit coverage for catalog seeding and renaming, shared contact create/edit, filtering, and offline stale-edit replay after deletion in `tests/e2e/contacts-inventory-contacts.spec.ts`.
- [X] T019 [US1] Implement Contact validation and default-number handling in `packages/contacts-inventory-contracts/src/contacts.ts`. Add catalog reads, revision-checked admin writes and a stable, idempotent Prescriber seed in `apps/api/src/contacts-inventory/catalogs.ts` and route them in `apps/api/src/contacts-inventory/handler.ts`.
- [X] T020 [US1] Implement UUID-based shared contact list, detail, create, edit and deletion endpoints in `apps/api/src/contacts-inventory/contacts.ts`, registered via `apps/api/src/contacts-inventory/handler.ts`.
- [X] T021 [US1] Build Contact Types admin and the Contacts directory, form, empty state and filters in `apps/contacts-inventory/src/admin/ContactTypesPage.tsx`, `apps/contacts-inventory/src/contacts/ContactsPage.tsx`, and `apps/contacts-inventory/src/contacts/contact-filters.ts`. Cover blank fields and duplicate names in `apps/contacts-inventory/src/contacts/contact-filters.test.ts`.
- [X] T022 [US1] Wire the feature entry and offline interaction, including deletion confirmation and status feedback, in `apps/contacts-inventory/src/entry.tsx` and `apps/contacts-inventory/src/contacts/ContactsPage.tsx`. Run the story’s contract and browser checks.

## Phase 4 — US2 Track inventory and its location (P1)

**Goal** — Both members use the same base item records and locations, with up to one image per item.

**Independent test** — Configure a location, create an item with a JPEG or PNG, replace the image, and find the same item by name and location. Delete it from the other account and verify image access ends.

- [ ] T023 [P] [US2] Test inventory, location and image contracts, including member/outsider access, actual file validation, stale scan and concurrent replacement or deletion, in `tests/integration/contacts-inventory-media.test.ts`.
- [X] T024 [P] [US2] Write Chromium/WebKit coverage for multiline location details, shared inventory, filters, image error and replacement, and offline image deferral in `tests/e2e/contacts-inventory-items.spec.ts`.
- [X] T025 [US2] Implement base item schemas and location references in `packages/contacts-inventory-contracts/src/items.ts` and `apps/api/src/contacts-inventory/catalogs.ts`.
- [X] T026 [US2] Implement inventory list, detail and mutation routes and transactional deletion with image generation invalidation in `apps/api/src/contacts-inventory/items.ts` and `apps/api/src/contacts-inventory/handler.ts`.
- [X] T027 [US2] Implement candidate upload, exact-version JPEG/PNG verification, 25 MiB limit, GuardDuty scan handling, conditional image activation, timeouts and reconciliation in `apps/api/src/contacts-inventory/images.ts`, `apps/api/src/contacts-inventory/scan-results.ts`, and `infra/lib/contacts-inventory-data-stack.ts`.
- [X] T028 [US2] Add authenticated, uncached image reads in `apps/api/src/contacts-inventory/images.ts`. Serve at most 4 MiB of raw bytes per response, require the current strong validator for subsequent ranges, and recheck the live pointer and membership on each request.
- [X] T029 [US2] Build Locations admin, base item create/edit/delete and filters in `apps/contacts-inventory/src/admin/LocationsPage.tsx`, `apps/contacts-inventory/src/inventory/InventoryPage.tsx`, and `apps/contacts-inventory/src/inventory/item-filters.ts`. Mount the routes in `apps/contacts-inventory/src/entry.tsx`.
- [X] T030 [US2] Add image upload, progress, error, replacement and removal UI in `apps/contacts-inventory/src/inventory/ItemImage.tsx`. Let users save other fields offline and defer upload. Abort partial image assembly and clear transient URLs on deletion, version mismatch or account change. Run the story’s integration and browser checks.

## Phase 5 — US3 Record and filter medicine (P1)

**Goal** — Medicine is a shared Inventory type with its own fields, filters and medication-list inclusion.

**Independent test** — Seed a location and shared Prescriber, create a medicine with a decimal strength and dose, then have the second member filter and toggle inclusion on the same record.

- [X] T031 [P] [US3] Test Medicine enums, optional fields, base-type rejection, Prescriber eligibility and reference races including deletion or reassignment, in `tests/integration/contacts-inventory-medicine.test.ts`.
- [ ] T032 [P] [US3] Write Chromium/WebKit coverage for the shared picker, strength unit edits, Medicine filters and medication list, including offline Prescriber-before-Medicine replay, in `tests/e2e/contacts-inventory-medicine.spec.ts`.
- [X] T033 [US3] Add the Medicine discriminator, fields, fixed enum choices, validation and stable strength-unit seeds in `packages/contacts-inventory-contracts/src/items.ts` and `apps/api/src/contacts-inventory/catalogs.ts`.
- [X] T034 [US3] Update item writes and shared contact edits and deletion to manage Prescriber links transactionally in `apps/api/src/contacts-inventory/items.ts` and `apps/api/src/contacts-inventory/contacts.ts`. Enforce the built-in type, workspace and active-record predicates at commit, and update counts on linking, clearing, reassignment and Medicine deletion.
- [X] T035 [US3] Build Strength Units admin, the conditional Medicine form and shared Prescriber picker in `apps/contacts-inventory/src/admin/StrengthUnitsPage.tsx`, `apps/contacts-inventory/src/inventory/MedicineFields.tsx`, and `apps/contacts-inventory/src/inventory/InventoryPage.tsx`.
- [ ] T036 [US3] Add Medicine-only filters and reset behavior, and the shared medication-list view driven by the toggle independent of Status or Who’s Med, in `apps/contacts-inventory/src/inventory/item-filters.ts`, `apps/contacts-inventory/src/inventory/MedicationListPage.tsx`, and `apps/contacts-inventory/src/entry.tsx`. Run the story’s integration and browser checks.

## Phase 6 — US4 Opt in to Contacts and Inventory in Search (P2)

**Goal** — Combined Search can include each shared content type independently, with all three off by default.

**Independent test** — Seed three records with a common term. Verify all eight switch combinations and legacy/new/reset defaults, then delete one and confirm it disappears for both members.

- [ ] T037 [US4] Write tests in `tests/contract/contacts-inventory-search.test.ts` and `tests/e2e/contacts-inventory-search.spec.ts` for legacy/default/reset settings, all eight switch combinations, safe result links, outsider denial in results, counts and snippets, deletion, and clearing stale context. Compare existing host and Finance results across feature activation where available.
- [X] T038 [US4] Implement host-owned preference keys, opt-in controls and safe result merging in `apps/web/src/features/search/search-state.ts`, `apps/web/src/features/search/CombinedSearchColumnSettings.tsx`, and `apps/web/src/features/search/CombinedSearchPage.tsx`.
- [ ] T039 [US4] Supply the workspace-authorized matching projection in `apps/contacts-inventory/src/search.ts` and register it in `apps/contacts-inventory/src/entry.tsx`. Invalidate results on deletion, unmount, or account change. Run the story’s contract and browser checks.

## Phase 7 — Validation and release readiness

- [ ] T040 [P] Measure at least 40 filter and Search updates against 500 contacts and 500 inventory items, including Medicine, in `tests/performance/contacts-inventory.performance.spec.ts` using `playwright.contacts-inventory.performance.config.ts` on a throttled mobile profile. Record whether 95% finish within two seconds and whether four of five first-time testers finish the Prescriber-to-Medicine journey within three minutes in `docs/testing/contacts-inventory-validation.md`.
- [X] T041 [P] Document feature install, upgrade, rollback, alarms, cost assumptions and paired backup recovery, including preservation and reconciliation of deletion history, in `docs/operations/contacts-inventory-release.md`.
- [ ] T042 Run unit, integration, contract and security gates, Chromium/WebKit on desktop and iPhone/iPad-sized viewports, offline and conflict journeys, and native contract smoke checks. Record commands, runtime and results in `docs/testing/contacts-inventory-validation.md`. Keep expanded coverage in targeted local and release runs and follow `AGENTS.md` for any proposed required-check change.
- [ ] T043 Verify actual AWS behavior in an approved isolated environment. Install on the prepared baseline, then upgrade, roll back and redeploy with Finance present. Record manifest and deployment fingerprints, retained workspace data, unchanged Finance and native compatibility probes, and outsider/image access checks in `docs/testing/contacts-inventory-validation.md`.
- [ ] T044 Restore paired table and S3 recovery points from before a deletion and image removal. Reapply the authoritative ledger, rebuild reference counts and advance the sync generation in isolation. Verify deleted data stays inaccessible, links and counts are correct, and any active image points to its exact clean version. Check that old cursors require a fresh snapshot and old writes and scans cannot commit. Verify workspace access, log redaction, alarms and observed costs. Record evidence in `docs/testing/contacts-inventory-validation.md` and `docs/operations/contacts-inventory-release.md`.
- [ ] T045 Review the final diff for data integrity, architecture scope, permissions, actionable errors, logs, explanatory comments, tests and docs against `specs/017-contacts-inventory/quickstart.md`. Verify that the release targets exclude Finance and native projects.

## Dependencies and execution order

- Phase 1 → Phase 2. T003 can run alongside T002. T004 and T005 can run alongside each other once fixtures are ready.
- US1 and US2 each depend on the foundation and can be tested in isolation. The story endpoints and entry point share files. Coordinate those edits or integrate them in phase order.
- US3 depends on US1 Contacts and US2 Inventory. US4 depends on the three source types and the host integration. Test cases can be drafted against their contracts before implementation.
- Phase 7 depends on all stories. T040 and T041 can run concurrently. Complete both before recording consolidated local release evidence in T042. Hosted release and recovery checks follow passing local results and use an approved isolated environment.

## Parallel examples

| Story | Work that can proceed concurrently |
| --- | --- |
| US1 | T017 contact contract cases and T018 directory browser scenarios |
| US2 | T023 media/inventory integration coverage and T024 browser coverage |
| US3 | T031 schema/reference concurrency coverage and T032 browser coverage |
| US4 | Within T037, preference and authorization contract tests can be authored separately from Combined Search browser tests |

## Implementation strategy

Use US1 as the first local demonstrable increment after foundation and validate it before expanding the workspace. Add base Inventory, then Medicine, then Combined Search. The first complete feature release packages all four stories, including Admin integration. Verify release independence before any production deployment.
