# Native required-validation runtime

Measured locally on 2026-10-08 before any required-workflow edit.

## Existing required browser gate

- Command: `npx playwright test --config playwright.quick.config.ts --list`
- Count: 30 tests in 19 files, Chromium only.
- Timed command required by repository policy: `/usr/bin/time -p npm run test:e2e:quick`
- Result: 30 passed in 26.6 seconds; wall `real 26.94`, user `34.50`, system `7.08` seconds.
- An initial sandbox attempt could not bind `127.0.0.1:4173`; the recorded result is the successful unsandboxed rerun.

## Candidate native smoke slice

- Command: `swift test --package-path packages/apple --disable-sandbox --filter 'GoldenContractTests|CompatibilityCoordinatorTests'`
- Count: 6 tests (4 golden wire-contract tests and 2 release-compatibility tests).
- Result: 6 passed; wall `real 2.06`, user `1.60`, system `0.59` seconds with warm build artifacts.
- Generic iOS and native Mac builds now pass locally. Hosted duration and cold dependency cost remain
  unmeasured, so native build steps have not been added to the required pull-request workflow.

Decision: do not modify `.github/workflows/validate.yml`, `test:e2e:quick`, or another required command in this change. The measured unit slice is small, but no reliable generic Xcode build timing or hosted-run evidence exists. Exhaustive device/window/accessibility/Siri/notification/failure matrices stay in `npm run apple:release-gates` and the TestFlight gate. This preserves the existing required test count and avoids making an unsupported ten-minute claim.

## Hosted confirmation — pull request #57

- Run: <https://github.com/stevekessler/naaseh/actions/runs/37948763288>
- Required job: `validate`
- Result: **Pass**
- Started: 2026-10-09 09:02:57 MDT
- Completed: 2026-10-09 09:08:51 MDT
- Total job duration: 5 minutes 54 seconds
- Required browser count before/after: 30 / 30 tests (unchanged)
- Native tests added to the required workflow before/after: 0 / 0 (unchanged)
- Headroom under the ten-minute ceiling: 4 minutes 6 seconds

The hosted run passed dependency installation, workflow validation, runtime dependency audit, the
complete `npm run validate` gate, Chromium installation, and all 30 quick Playwright tests. The
required workflow remains within policy without adding the exhaustive Apple release matrix.
