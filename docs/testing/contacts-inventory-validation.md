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

The first release fixture passed in the regular Mac Terminal on Chromium, WebKit, iPhone and iPad, confirmed by the user and the Playwright result file. The new encrypted offline storage and sign-out fixture is ready on the same four projects. Playwright could not start the same-origin preview server because this session denied listening on `127.0.0.1:4173`. The locked Chromium and WebKit revisions are now installed. Run both fixtures from a terminal that allows a local preview server and browser processes.

```sh
npx playwright test tests/e2e/contacts-inventory-release.spec.ts tests/e2e/contacts-inventory-offline-foundation.spec.ts
```

The browser fixture exercises host activation, upgrade, rollback, and safe fallback. The complete release proof still needs the supported Finance compatibility, offline, and persistence checks specified in T016 and quickstart. Workspace reads and the shared persistence layer are implemented. Record mutations remain pending until the feature-specific schemas and reference checks are implemented. No AWS rollout or recovery drill was performed.

## Persistence and offline foundation

- Sixteen targeted checks passed. New cases cover actor-scoped receipts, conditional revisions, bounded change delivery, deletion redaction, restores, the DynamoDB transaction shape, the offline fixture build, and aggregate telemetry.
- TypeScript, the standalone builds, Apple contract validation, and local CDK synthesis passed. The quick browser command still lists 36 tests.
- The feature can generate a version-scoped release manifest with `node --import tsx tools/release-contacts-inventory.mjs pack local-proof apps/contacts-inventory/dist <output-directory>`. Protected publication and rollback are pending.
