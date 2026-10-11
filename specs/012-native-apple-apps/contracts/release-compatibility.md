# Contract: Release, Compatibility, and Validation

## Supported build boundary

- iPhone: iOS 27.0 on the Siri AI-capable hardware set defined by the specification.
- iPad: iPadOS 27.0 on A17 Pro iPad mini and M-series iPads.
- Mac: macOS 27.0 on Apple silicon capable of Siri AI.
- No Intel, Catalyst, OS 26 or earlier, watchOS, visionOS, or compatibility-mode promise.
- Siri availability is checked separately from OS/hardware support. If disabled, unavailable, not
  downloaded, or excluded by language/region/account, ordinary in-app task creation remains usable.

## Build/configuration contract

- Universal iPhone/iPad and native Mac targets have distinct bundle IDs and App Store Connect
  records but share marketing version and sync compatibility declarations.
- TestFlight release configuration contains only production origin, application identifiers,
  public link configuration, and feature flags. No AWS, APNs, encryption, session, or user secret is
  embedded.
- Debug builds may use a checked-in local origin override. Release builds reject non-production
  origin changes.
- Signing identities, profiles, APNs keys, App Store Connect API keys, and export credentials live in
  developer/CI secret stores, never the repository.

## Compatibility behavior

Before bootstrap and before a mutation after a long suspension, the client checks build/contract
compatibility. `upgradeRequired`, beta expiry, or an unsupported contract locks mutation and
preserves encrypted pending work. A temporary outage is distinct from offline mode. Server schema
changes remain additive across the supported web/native window.

## Production rollout

1. Archive and sign both targets from the same reviewed source revision.
2. Run local/package/API/CDK tests and the exhaustive release matrix.
3. Upload builds and complete encryption/export compliance metadata.
4. Assign builds only to the dedicated smoke-account TestFlight group.
5. Exercise clean sign-in, TFA, bootstrap, representative parity, offline mutation/replay, Siri,
   reminders, timer actions, journal/plan privacy, files, OAuth return, and upgrade migration.
6. Confirm CloudWatch contains expected bounded events and no protected values.
7. Review AWS request/log deltas and compatibility/rollback controls.
8. Promote to ordinary production accounts only after signed evidence is recorded.
9. Expire/stop testing an unsafe build and raise minimum build only when pending-work recovery has
   been validated.

## Required PR validation

The required target remains under ten minutes. Before adding a native test/build to
`.github/workflows/validate.yml`, `test:e2e:quick`, or another required command:

1. Record current test count.
2. Measure `/usr/bin/time -p npm run test:e2e:quick` before the change.
3. Record the proposed additional count and measure the resulting command.
4. Keep only representative high-value native smoke coverage in the required gate.
5. Confirm the hosted PR check total after merge-candidate execution.

Suggested required native slice: shared Swift package unit/fixture tests, one generic iOS simulator
build, one macOS build, and changed server/CDK tests. Full UI device combinations stay outside the
required target.

## Release matrix

The local/pre-TestFlight gate covers:

- representative supported iPhone, iPad mini, M-series iPad, and Apple-silicon Mac;
- compact/regular widths, rotation, multitasking, external display, multiple windows, and relaunch;
- VoiceOver, Full Keyboard Access, Dynamic Type/large text, reduced motion, keyboard, pointer,
  trackpad, Pencil alternatives, and safe areas;
- online, offline, degraded network, server error, account disablement, authorization revocation,
  and four-client conflict/replay;
- clean install, app update, forced termination in migration, low storage, missing key, corrupt
  envelope, sign-out with pending work, and restore/re-bootstrap;
- Siri phrasing with Na'aseh and GSD, ambiguity, duplicate invocation, lock, offline, and unavailable
  Siri AI;
- APNs/local alert duplication, denial/revocation, token rotation, privacy previews, stale actions,
  and timer transitions;
- current Chrome and Safari/WebKit interoperability for shared changed contracts.
