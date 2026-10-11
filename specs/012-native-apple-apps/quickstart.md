# Quickstart: Native Apple Applications

This is the implementation and verification entry point for the native Apple feature. It does not
authorize production deployment; TestFlight rollout follows the smoke-account gate in
[release-compatibility.md](./contracts/release-compatibility.md).

## Prerequisites

- macOS 27 on Apple silicon
- Xcode 27.0 with Swift 6.4 and the iOS 27 simulator runtime
- Node.js 24 and the repository's existing npm dependencies
- An Apple Developer team for physical-device, APNs, App Intents, and TestFlight work
- Local development configuration copied from checked-in examples; never place signing, APNs, AWS,
  session, or encryption secrets in the repository

The universal iOS target supports iPhone and iPad. The Mac target is native SwiftUI, not Catalyst.

## Read first

1. [Feature specification](./spec.md)
2. [Implementation plan](./plan.md)
3. [Research decisions](./research.md)
4. [Native data model](./data-model.md)
5. [Parity traceability matrix](./parity-matrix.md)
6. [Native API additions](./contracts/native-api-additions.openapi.yaml)
7. [Security and sync contract](./contracts/native-security-sync.md)
8. [System-surface contract](./contracts/native-system-surfaces.md)
9. [Release compatibility contract](./contracts/release-compatibility.md)

## Initial implementation order

1. Create `apps/apple` with the universal iOS/iPadOS and native macOS 27 targets.
2. Create `packages/apple` with contract, crypto, persistence, sync, service, feature, design-system,
   and test-support modules shown in the plan.
3. Add language-neutral fixtures and prove Swift/TypeScript JSON and crypto compatibility.
4. Implement Keychain session/device-key protection and the existing sign-in/TFA/CSRF flow.
5. Implement the encrypted SwiftData store, staged migrations, atomic outbox, bootstrap, push/pull,
   conflicts, and account cleanup.
6. Build platform shells and then the product feature sequence in
   `docs/product/ios-app-feature-backlog.md`.
7. Add APNs registration/delivery to the existing notification path and local timer/reminder
   reconciliation.
8. Add the on-demand task App Intent and App Shortcut without entity donations.
9. Complete TestFlight signing/configuration, release matrices, runbooks, and production smoke gate.

Authentication and encrypted sync must be trustworthy before feature screens persist production
data. Siri, alerts, widgets, and deep links must call the same command services as the app UI rather
than creating alternate mutation paths.

## Local commands

Once the Xcode project and package exist, expose stable repository scripts for these operations:

```sh
swift test --package-path packages/apple
xcodebuild -workspace apps/apple/Naaseh.xcworkspace -scheme Naaseh-iOS \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
xcodebuild -workspace apps/apple/Naaseh.xcworkspace -scheme Naaseh-macOS \
  -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build
npm test
npm run typecheck
npm run lint
```

Use repository scripts rather than requiring contributors to remember long Xcode invocations. A
physical signed device is still required for final Siri AI, notification, biometric, Live Activity,
and TestFlight validation.

## Development safety

- Default local configuration to a local/mock transport. Connecting a development build to
  production requires an explicit, visible configuration and the dedicated smoke account.
- Never seed tests by editing production records directly. Use public API behavior and stable test
  fixtures.
- Use deterministic clocks, IDs, network responses, and in-memory/temporary stores in unit tests.
- Do not make background refresh a test prerequisite. Terminate after each persistence boundary and
  prove state is correct on relaunch.
- Treat any crypto authentication failure, migration mismatch, missing key, or partial store as a
  blocked/quarantined state, not empty data.
- Verify that screenshots, console output, crash diagnostics, Siri responses, notification payloads,
  and deep links contain no protected values.

## Minimum acceptance slice per bounded feature

Each backlog feature should ship as an independently testable slice with:

- shared Swift domain/service behavior and target-specific UI;
- encrypted local persistence and explicit offline/online-only behavior;
- contract fixtures and negative authorization/failure tests;
- iPhone, iPad, and Mac accessibility behavior appropriate to the affected workflow;
- current Chrome/Safari regression coverage when a shared API or contract changes;
- safe CloudWatch operation/outcome telemetry for server changes;
- authenticated, content-free native telemetry through the existing compatibility service for
  client-only failures;
- updated architecture, user, operations, and recovery documentation;
- a final diff review covering correctness, security, data loss, error handling, complexity, and
  platform behavior.

## Required validation runtime

Do not add Apple builds or tests to required validation until the before/after count and timing are
recorded. For browser validation, measure exactly:

```sh
/usr/bin/time -p npm run test:e2e:quick
```

After changing the workflow, confirm the hosted required check remains at or below ten minutes.
Keep exhaustive devices, windows, Siri, notifications, accessibility, failures, and four-client
combinations in `npm run test:e2e`, `npm run validate:pre-aws:browsers`, or a documented native
release-gate script rather than the quick PR path.

## Production smoke checklist

Before expanding a TestFlight build beyond the dedicated smoke account, verify:

- both iPhone/iPad and Mac builds install, launch, upgrade, and pass the server compatibility gate;
- sign-in/TFA, local biometric re-entry, sign-out, and disabled-account behavior;
- encrypted bootstrap, offline mutation, forced termination, replay, conflict, and web convergence;
- no protected values in local plaintext inspection or CloudWatch/crash diagnostics;
- generic-by-default remote/local alerts, token rotation, stale action handling, and timer state;
- Na'aseh and GSD Siri phrases, omitted/ambiguous project handling, offline durability, and duplicate
  invocation safety;
- journal/Crisis Plan/hidden memo privacy and recipient online-only access;
- representative files, reports/exports, and temporary-file cleanup;
- keyboard/pointer/large-text/reduced-motion journeys on every platform; VoiceOver support is
  implemented, but manual VoiceOver execution is optional for the first release;
- incremental production request/log cost remains consistent with the plan estimate;
- build expiry and rollback preserve encrypted pending work and prevent unsafe mutation.

Record the evidence with the build number and source revision. Expire the build rather than promote
it if any security, durability, compatibility, or migration gate fails.
