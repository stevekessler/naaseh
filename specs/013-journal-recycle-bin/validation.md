# Validation Evidence: Journal Recycle Bin

## Required quick-suite baseline

- Date: 2026-10-14
- Command: `/usr/bin/time -p npm run test:e2e:quick`
- Discovered tests: 30
- Result: 30 passed
- Playwright duration: 29.3 seconds
- Wall time: 29.65 seconds
- CPU time: 36.04 seconds user, 8.13 seconds system
- Note: the first sandboxed attempt could not bind `127.0.0.1:4173`; the approved local run
  started the preview server and passed. Expected runtime remains comfortably below ten minutes.

## Post-change required-suite evidence

- Date: 2026-10-14
- Command: `/usr/bin/time -p npm run test:e2e:quick`
- Discovered tests: 30 (change from baseline: 0)
- Result: 30 passed
- Playwright duration: 29.6 seconds
- Wall time: 29.98 seconds (change from baseline: +0.33 seconds)
- CPU time: 35.21 seconds user, 7.52 seconds system
- Coverage decision: the existing Journal quick journey was extended to cover recycle and restore,
  avoiding an additional required test while retaining representative Chromium coverage.
- Hosted PR duration: not yet available because this work has not been pushed to a pull request.
  The measured local duration remains comfortably below the ten-minute required-check ceiling.

## Local release-gate evidence

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run format:check`: passed
- `npm test`: 329 files passed; 1,007 tests passed
- `npm run build`: passed (web production bundle and infrastructure TypeScript build)
- `git diff --check`: passed
