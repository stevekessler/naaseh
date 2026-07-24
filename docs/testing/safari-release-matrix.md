# Safari release matrix

Playwright defines desktop WebKit, iPhone 14, and iPad Pro 11 profiles. On 2026-07-22,
the complete local Chromium and WebKit suite passed 38/38 journeys (19 per browser), and the
focused accessibility suite passed all four desktop/mobile profiles. A clean GitHub Actions
WebKit run plus real macOS Safari and physical iPhone/iPad ordinary-tab and Home Screen
validation are still required before production approval.

## Safari Technology Preview smoke test

Safari Technology Preview provides independent native-WebDriver evidence; it does not replace
Playwright WebKit or the physical-device matrix.

1. Install Safari Technology Preview beside ordinary Safari.
2. In Technology Preview, open **Settings > Developer** and enable **Allow remote automation**.
   Quit Technology Preview, then run
   `"/Applications/Safari Technology Preview.app/Contents/MacOS/safaridriver" --enable`
   once and approve any macOS authorization prompt.
3. From the repository root under Node.js 24, run `npm run test:safari-preview`.

The runner builds and serves the test-mode PWA on ephemeral loopback ports, launches
`/Applications/Safari Technology Preview.app/Contents/MacOS/safaridriver`, and checks the logo,
username field, password field type, submit control, control count, document readiness, and
responsive login-card bounds. It creates an isolated Safari automation session and terminates
the driver and preview server afterward. Set `NAASEH_SAFARI_DRIVER` only when the Technology
Preview application is installed at a nonstandard path.

Record the Technology Preview release, macOS version, command result, and date below whenever
this release gate is run. A missing browser, disabled remote automation, or WebDriver timeout is
a blocker—not a skipped or passing test.

### Current native-run evidence

- **2026-07-22 — passed.** Safari Technology Preview Release 248 on macOS 26.5.2 created a native
  WebDriver session and completed `npm run test:safari-preview`. The smoke test verified the logo,
  username field, password field type, submit control, control count, document readiness, and
  responsive login-card bounds. The runner uses the preview driver's advertised
  `Safari Technology Preview` browser capability; the earlier generic `safari` request was the
  source of the capability mismatch.
