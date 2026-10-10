# Native Apple development

The Na'aseh Apple workspace contains a universal iPhone/iPad application, a native Apple-silicon Mac
application, App Intents support, and a timer Live Activity. The first supported systems are iOS 27,
iPadOS 27, and macOS 27. There is no Catalyst, Intel, or older-system build destination.

## Required tools

- macOS 27 on Apple silicon
- Xcode 27.0 with Swift 6.4
- the iOS 27 simulator runtime
- Node.js 24 and the repository's installed npm workspaces

After installing or updating Xcode, run `xcodebuild -runFirstLaunch` once. Open
`apps/apple/Naaseh.xcworkspace`, not the project directly, so the local Swift package is available.

## Safe configuration

`Config/Debug.xcconfig` points to a loopback development origin and disables production-data and
native-telemetry flags. It contains no credential and cannot access production unless a developer
deliberately changes local, uncommitted settings. `Config/TestFlight.xcconfig` names the existing
production origin but contains no session, signing, APNs, AWS, or encryption secret.

Bundle IDs and App Group IDs are checked-in non-secret identifiers. Select an authorized Apple
Developer team locally for signed device work. Never commit a provisioning profile, signing
certificate, API key, APNs private key, session cookie, smoke-account credential, or secret-bearing
`.xcconfig` file.

## Repeatable commands

```sh
npm run apple:test
npm run apple:build:ios
npm run apple:build:macos
```

The build commands use `/tmp/naaseh-apple-derived` by default and disable signing for simulator/local
compilation. Override that disposable location with `NAASEH_DERIVED_DATA_ROOT` when necessary.

Archives require a locally configured team and signing identity:

```sh
npm run apple:archive:ios
npm run apple:archive:macos
```

Archiving does not upload or authorize a production rollout. The TestFlight runbook and dedicated
smoke-account gate remain mandatory.

## Device and simulator workflow

Use an iOS 27 simulator for layout, navigation, contract, and ordinary lifecycle work. Use supported
physical iPhone/iPad hardware for Keychain access control, biometric re-entry, APNs, Siri AI,
ActivityKit, camera, and real termination behavior. Validate desktop behavior with the native
`Naaseh-macOS` scheme on Apple silicon.

Debug builds must stay on local/mock data. When production validation is explicitly required, use a
signed TestFlight configuration and the dedicated production smoke account; never seed or repair
production by writing directly to DynamoDB.

## Troubleshooting

- If Xcode reports a missing platform plug-in, complete `xcodebuild -runFirstLaunch` and confirm the
  iOS 27 simulator runtime is installed.
- If SwiftPM cannot write a user cache in a restricted shell, use the repository script, which puts
  module caches under `/tmp` and disables SwiftPM's nested sandbox.
- If entitlements fail, verify the selected team owns the bundle IDs, App Group, associated domain,
  APNs capability, and Siri capability. Do not weaken or remove entitlements just to make signing
  succeed.
- If a Debug build can reach production, stop immediately and inspect the effective build settings;
  `NAASEH_ENABLE_PRODUCTION_DATA` must be `NO` for Debug.
- If an app cannot open encrypted state after an upgrade, preserve the store and follow the recovery
  runbook. Never interpret a decryption or migration failure as an empty account.
