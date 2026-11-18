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

## Pending browser evidence

The browser fixture builds and the release test lists for Chromium, WebKit, iPhone and iPad. Playwright could not start the same-origin preview server because this session denied listening on `127.0.0.1:4173`. The browser revisions required by Playwright 1.61.1 were absent from the local cache. From a terminal that allows a local server and browser processes, install the locked revisions and run the fixture.

```sh
npm ci
npx playwright install chromium webkit
npx playwright test tests/e2e/contacts-inventory-release.spec.ts
```

The browser fixture exercises host activation, upgrade, rollback, and safe fallback. The complete release proof still needs the supported Finance compatibility, offline, and persistence checks specified in T016 and quickstart. The record API remains unavailable until the repository and sync tasks are implemented. No AWS rollout or recovery drill was performed.
