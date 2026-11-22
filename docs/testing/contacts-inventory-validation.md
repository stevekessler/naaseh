# Contacts and Inventory validation

## Implementation baseline

- Baseline `main` at `8d5759ec865f507dc408c1b58bbc245e41e0be3b`. Development branch `codex/contacts-inventory`.
- `.specify/feature.json` resolves to `specs/017-contacts-inventory`. All 16 requirements checklist items passed.
- Node 24.22.2 and locked Playwright 1.61.1. The existing required browser selection lists 36 tests across 22 files.

## Local evidence

- Offline `npm ci`, repository typecheck, and web, standalone feature UI, and standalone feature API builds passed.
- The feature Vitest configuration passed ten checks across the host contract, API access boundary, CloudFront artifact isolation, retained data and backup resources, and immutable API release routing. Run `npx vitest run --config apps/contacts-inventory/vitest.config.ts`.
- Nineteen existing router, navigation, sign-out, web security, and infrastructure regression checks passed. The existing infrastructure test now expects one OAC per private web origin.
- `npm run apple:contracts` passed the Apple interoperability drift check.
- The independent Data and Release stacks synthesized locally using `npm run cdk:synth -- --app "node --import tsx bin/contacts-inventory.ts" -c contactsInventoryWebOrigin=https://naaseh.example.test -c contactsInventoryReleaseId=local-proof --quiet --no-lookups`.

## Browser evidence and follow-up

The first release fixture passed in the regular Mac Terminal on Chromium, WebKit, iPhone and iPad, confirmed by the user and the Playwright result file. The user also confirmed that the encrypted offline storage and sign-out fixture passed in the regular Mac Terminal. Playwright could not start the same-origin preview server because this session denied listening on `127.0.0.1:4173`. The locked Chromium and WebKit revisions are now installed. Run both fixtures from a terminal that allows a local preview server and browser processes.

```sh
npx playwright test tests/e2e/contacts-inventory-release.spec.ts tests/e2e/contacts-inventory-offline-foundation.spec.ts
```

The browser fixture exercises host activation, upgrade, rollback, and safe fallback. The complete release proof still needs the supported Finance compatibility, offline, and persistence checks specified in T016 and quickstart. No AWS rollout or recovery drill was performed.

## Persistence and offline foundation

- Sixteen targeted checks passed. New cases cover actor-scoped receipts, conditional revisions, bounded change delivery, deletion redaction, restores, the DynamoDB transaction shape, the offline fixture build, and aggregate telemetry.
- TypeScript, the standalone builds, Apple contract validation, and local CDK synthesis passed. The quick browser command still lists 36 tests.
- The feature can generate a version-scoped release manifest with `node --import tsx tools/release-contacts-inventory.mjs pack local-proof apps/contacts-inventory/dist <output-directory>`. The protected publication, reactivation and withdrawal workflow has local contract tests. AWS publication and rollback still need isolated hosted proof.

## Shared Contacts and release controls

- The Contacts directory can create, edit, filter, and delete shared contacts. The catalog serves a stable Prescriber ID from first use, and administrators can rename it without changing the ID.
- The release workflow stages a feature API stack and immutable assets, probes public denial and member readiness, then switches a conditional manifest pointer. It can reactivate retained releases and reject stale API versions. Provision the dedicated environment, retained data stack, artifact bucket and endpoint configuration before hosted proof.
- Twenty-six targeted tests, TypeScript, standalone builds, local CDK synthesis, and GitHub workflow validation passed. The required Playwright selection still lists 36 tests and Playwright remains at 1.61.1.
- The managed session now starts the preview server, but Chromium and WebKit exit before assertions. The shared Contacts journey is ready for a normal terminal run across the four existing browser projects.

```sh
npx playwright test tests/e2e/contacts-inventory-contacts.spec.ts
```

The `contacts-inventory-release` GitHub environment owns the feature-specific deployment role, workspace canary session, and workspace identities. Before the isolated proof, configure the target host's API and authorizer IDs, HTTPS origin, and retained artifact bucket. Provision the retained data stack first. The release role needs conditional writes to the feature manifest and release prefix, and prefix-scoped listing for the first manifest lookup. The feature API role only reads the active manifest. Use the expected active release ID on each manual workflow dispatch, or `inactive` before the first publication.

## Hosted Contacts browser verification

- Run [45057960735](https://github.com/stevekessler/naaseh/actions/runs/45057960735) passed the Contacts create, filter and edit journey on Chromium, WebKit, iPhone and iPad.
- Run [45058527537](https://github.com/stevekessler/naaseh/actions/runs/45058527537) passed the expanded journey including a Prescriber catalog rename that preserved the ID and a stale offline edit purged after another member deleted the record.

## Inventory, Medicine and Search

- Hosted run [45059657838](https://github.com/stevekessler/naaseh/actions/runs/45059657838) passed the Inventory journey on Chromium, WebKit, iPhone and iPad. It covers multiline locations, filtering, image deferral while offline, activation after an accepted scan, and a rejected replacement that preserves the existing image. The hosted browser tests use simulated scan responses.
- The targeted feature configuration passed 42 local checks across API access, deletion and sync, image validation and scan versioning, Medicine links and reference races, Search preferences and projection, and infrastructure. The repository Vitest suite also passed 1,364 tests across 411 files in 72 seconds. TypeScript, the two standalone feature builds, Apple contract validation and feature stack synthesis passed.
- Offline conflict review now compares the saved record with the encrypted draft and requires an explicit apply or discard. A targeted browser fixture covers rebasing a draft onto a new restore generation.
- The managed session started the browser preview server. Chromium and WebKit exited during launch in all four projects before the new Medicine and Search assertions ran. The hosted runner is available once the new commit is pushed. The required browser selection is unchanged.
- The mobile benchmark seeds 500 contacts and 500 inventory records, applies 4× CPU slowdown under a Pixel 7 profile, and records 40 end-to-visible-result measurements. Successful browser timing and observations from five first-time testers are still pending.

```sh
npx vitest run --config apps/contacts-inventory/vitest.config.ts
npx playwright test tests/e2e/contacts-inventory-medicine.spec.ts tests/e2e/contacts-inventory-search.spec.ts
npx playwright test --config playwright.contacts-inventory.performance.config.ts
```

The [release runbook](../operations/contacts-inventory-release.md) covers isolated install, rollback and paired recovery. Hosted AWS acceptance and the paired recovery exercise still need an approved isolated environment.
