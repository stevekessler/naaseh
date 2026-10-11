# Native platform experience validation

Status: **iPhone, iPad, and Mac automated layout checks pass; physical-hardware timing pending**

The source suite covers phone safe areas, keyboard dismissal, rotation, accessibility text sizes,
reduced motion, named controls, iPad split-view/restoration/keyboard alternatives, Mac window and
menu conventions, authorized routing, stale targets, encrypted state restoration, and multiwindow
edit conflicts. Swift package tests pass on the current host.

On 2026-10-08, Xcode 27 successfully built and analyzed the iOS/iPadOS and macOS apps. XCUITest
passed 2/2 iPhone tests on an iPhone 18 Pro iOS 27 simulator and 2/2 iPad tests on an iPad Pro
13-inch (M5) iPadOS 27 simulator. The tests covered rotation, Accessibility XXXL text, reduced
motion, 44-point touch targets, three-column layout, hardware-keyboard input, named controls, and
geometry screenshots. The iPad landscape test now asserts that the window is wider than it is tall
and that the complete detail-column empty-state frame is inside the window. A clean rerun passed in
16.884 seconds. Use the portrait image in `ipad-final/` as the visual baseline; Xcode 27's
post-rotation screenshot attachment contains a compositing offset even though the accessibility
window and element frames are valid. Evidence is in `docs/testing/evidence/2026-10-08/`.

After **Xcode Helper** received Accessibility permission, the macOS XCUITest suite passed 2/2 in
7.490 seconds. The run covered the minimum window width, menu availability, Cmd-N, and the accessible
Import File alternative. Screenshot capture is restricted to the Na’aseh window so unrelated
desktop applications and private information cannot enter test evidence. No 250 ms
physical-hardware reflow result or full VoiceOver primary-journey pass is claimed yet.

On 2026-10-09, the current Mac suite was independently rerun after the production Siri,
notification, associated-domain, App Group, and Keychain entitlements were removed only from the
temporary UI-test build. Xcode then applied its local ad-hoc signature, avoiding the Gatekeeper
warning produced by the earlier unsigned runner. Both tests passed in 23.813 seconds. This proves
the current desktop layout and controls can be exercised locally; it does not replace development
certificate signing of the real entitled app or the physical-device release gate.

## Automated result summary — 2026-10-08

| Check                                      | Result                                                |
| ------------------------------------------ | ----------------------------------------------------- |
| Apple contract drift                       | Pass                                                  |
| Archive configuration and validator tests  | Pass (3/3 validator tests)                            |
| Native API release/compatibility/telemetry | Pass (10/10)                                          |
| Swift package tests                        | Pass (79/79)                                          |
| iOS 27 Xcode build and analyze             | Pass                                                  |
| macOS 27 Xcode build and analyze           | Pass                                                  |
| iPhone 18 Pro iOS 27 XCUITest              | Pass (2/2)                                            |
| iPad Pro 13-inch (M5) iPadOS 27 XCUITest   | Pass (2/2; 16.884 s, explicit landscape bounds check) |
| Mac XCUITest                               | Pass (2/2; 7.490 s, window-only screenshots)          |

The retired Google Tasks authentication code has been removed, and the shared SVG app icon has been
replaced with a complete PNG icon set generated from the existing Na'aseh logo. Re-run Xcode build
and analysis after these changes and record any remaining warnings before TestFlight upload.

## Release evidence to capture

For each representative iPhone, iPad, and Mac, record build/device/OS, initial and final layout
timestamps for rotation, resize, keyboard, sheet, inspector, Dynamic Type, and multiwindow changes.
Every measured reflow must be at most 250 ms, no actionable control may be obscured, and the primary
task, Journal, list/file/report, and settings journeys must pass with keyboard or accessible gesture
alternatives. VoiceOver support remains required, but manual VoiceOver execution is not a release
gate. Attach privacy-safe screenshots showing geometry only; never
include account or protected content.
