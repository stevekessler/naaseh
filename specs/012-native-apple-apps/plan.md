# Implementation Plan: Native Apple Applications

**Branch**: `codex/native-apple-apps` | **Date**: 2026-10-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-native-apple-apps/spec.md`

## Summary

Build a universal native iPhone/iPad application and a separate native Mac application with Swift
6.4 and SwiftUI for iOS/iPadOS/macOS 27. Shared Swift packages will implement wire contracts,
application-level encryption, a SwiftData-backed encrypted local store, idempotent offline sync,
and feature services; each target will supply an intentional platform interface. The clients will
reuse the existing production CloudFront/API Gateway/Lambda/DynamoDB backend, opaque session and
CSRF contract, sync feeds, cryptographic formats, and recovery rules. The only bounded production
extensions are native device registration, APNs delivery in the existing notification Lambda,
native-client compatibility metadata, and a bounded authenticated native-telemetry route handled by
that existing compatibility Lambda. Siri AI task capture will use an on-demand App Intent and App
Shortcut without donating product content.

## Technical Context

**Language/Version**: Swift 6.4 in Xcode 27.0 for Apple clients; existing TypeScript 5.8/Node.js 24
for bounded API and AWS CDK changes

**Primary Dependencies**: SwiftUI, Observation, Foundation/URLSession, SwiftData, CryptoKit,
Security, LocalAuthentication, Network, App Intents, UserNotifications, ActivityKit, WidgetKit,
AuthenticationServices, UniformTypeIdentifiers, QuickLook; a locally vendored and pinned upstream
Argon2 reference implementation used only for byte-compatible Argon2id PIN derivation

**Storage**: One account-partitioned SwiftData store in an App Group container containing encrypted
record envelopes, encrypted outbox entries, cursors, conflicts, and non-sensitive indexes; device
root keys and session material in non-synchronizing Keychain items protected by device
authentication; existing on-demand DynamoDB and S3 remain server-authoritative

**Testing**: Swift Testing for shared packages and feature logic, XCTest/XCUITest for lifecycle and
UI, App Intents Testing plus physical-device Siri checks, contract golden fixtures shared with
Vitest, existing Vitest/CDK tests, focused required build/smoke coverage, and exhaustive simulator,
device, accessibility, notification, migration, and four-client interoperability release gates

**Target Platform**: Siri AI-capable iPhones on iOS 27.0; A17 Pro or M-series iPads on iPadOS 27.0;
Apple-silicon Siri AI-capable Macs on macOS 27.0. No Intel, Catalyst, watchOS, visionOS, or earlier
OS compatibility

**Supported Browsers**: Existing current stable Chrome and Safari/WebKit PWA remains supported and
contract-compatible; native work must not regress its Chromium/WebKit journeys

**Project Type**: Monorepo containing a universal mobile/tablet app, a desktop app, shared Swift
packages, and bounded changes to the existing web/API/infrastructure applications

**Performance Goals**: Warm cached navigation within 2 seconds; local mutation visibly durable or
failed within 500 ms; search/filter over 10,000 cached records within 1 second; size/orientation
reflow within 250 ms; resolved Siri request durably committed within 2 seconds, excluding system
speech and clarification

**Constraints**: TestFlight-only first distribution; production data only after smoke-account gate;
no admin UI; generic notification content by default; no proactive intelligence donations; no
background-execution correctness dependency; no production secrets in builds; required PR
validation stays at or below ten minutes

**Offline Strategy**: After an authorized bootstrap, decrypt records only for active use and commit
each supported local state change and its encrypted outbox operation in one store transaction.
Sync runs on launch, foreground entry, manual refresh, and connectivity restoration, pushes stable
mutation IDs, pulls authorized audience cursors, and preserves explicit conflicts. Security,
sharing, OAuth, export, attachment upload, and other server-authoritative operations fail clearly
offline. Background refresh is opportunistic only.

**Security & Data Boundaries**: The server remains authoritative for identity, membership,
visibility, sharing, and every mutation. Native installations hold only the signed-in actor's
authorized encrypted cache. Opaque session/pre-auth values, CSRF token, and device root keys live in
non-synchronizing Keychain items; biometric success only unlocks those local items. Protected
content is excluded from URLs, logs, crash reports, notifications by default, Siri responses,
Spotlight, previews, and feedback. Journal/Crisis Plan/hidden-memo wire ciphertext remains
byte-compatible with the web client. Sign-out, account disablement, or revoked authorization clears
keys, plaintext, alerts, live activities, and transient system surfaces, with a deliberate path for
pending work.

**AWS Architecture & Cost Impact**: Reuse the existing CloudFront same-origin API, HTTP API,
request-driven Lambdas, EventBridge Scheduler reminders, on-demand DynamoDB table, S3 workflows,
Secrets Manager, backups, and CloudWatch. Extend the current push-registration partition and
notification Lambda to store APNs tokens and send token-authenticated APNs requests; add APNs fields
to the existing push secret rather than creating another secret or service. Handle compatibility
reads and authenticated native telemetry batches in one request-driven Lambda and existing log group;
do not store telemetry in DynamoDB. APNs itself is free.
At the current smoke-account scale, incremental AWS cost should remain effectively within existing
minimum/free-tier usage and below $5/month. At 1,000 active users, assuming up to three devices,
200 API/sync requests and two alerts per user per day, the incremental request, DynamoDB, Lambda,
Scheduler, transfer, and bounded-log cost is expected to be roughly $10-$40/month. Validate these
assumptions with production metrics before broadening TestFlight. A separate test stack, SNS mobile
push, provisioned database, or always-on APNs provider is rejected because the existing serverless
path is simpler and cheaper.

**CloudWatch Observability**: Extend current structured events and embedded metrics with client
platform, app version, sync contract version, operation class, duration, bounded outcome,
retry/conflict reason, APNs status class, and safe correlation ID. The compatibility Lambda also
accepts authenticated, schema-limited batches of client-only migration, secure-store, crypto,
lifecycle, Siri, notification, and file-workflow failure events and writes them through the existing
observability package and log group. The client retains at most 100 events in a separately encrypted,
protected ring file when offline and flushes only after session validation; telemetry delivery is
best-effort and never changes a user-operation outcome. Never log tokens, device tokens, voice
transcripts, project/task/list/category names, ciphertext, filenames, journal values, record IDs, or
notification payload text. Reuse current log groups, retention, Lambda error/throttle alarms, and
notification failure alarms; add dimensions only when cardinality remains bounded.

**Scale/Scope**: One initial production smoke account, then gated TestFlight users; design and cost
check at 1,000 active users and three installations per user. Full parity covers the end-user
capabilities in specifications 001-011 across phone, tablet, desktop, Siri, native alerts, and timer
surfaces, while admin/operator workflows remain web-only.

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

- **Security and data boundaries — PASS**: [data-model.md](./data-model.md) identifies every local
  security-bearing entity and purge transition; [native-security-sync.md](./contracts/native-security-sync.md)
  defines Keychain, encrypted-envelope, authorization, and system-surface boundaries.
- **Data durability and observability — PASS**: Atomic entity/outbox persistence, migration states,
  idempotency, explicit conflict/retry states, upgrade recovery, and bounded CloudWatch signals are
  defined in the data model and contracts.
- **Browser offline operation and resynchronization — PASS**: The existing web offline model is not
  replaced. Golden contracts and four-client convergence tests keep the PWA interoperable while the
  native clients implement the same durable outbox and audience-cursor semantics.
- **Supported browsers — PASS**: API additions are backward-compatible. Existing Chromium and
  WebKit suites remain required for affected shared contracts; native matrices are separate release
  gates.
- **Automated testing — PASS**: The design assigns Swift unit/UI/intent tests, TypeScript contract
  and API tests, CDK assertions, focused PR smoke coverage, and exhaustive release matrices. Before
  any native test enters required validation, record counts and `/usr/bin/time -p npm run
  test:e2e:quick` before and after, then verify the hosted check remains under ten minutes.
- **Performance and AWS architecture — PASS**: Measurable client targets, request-scale assumptions,
  estimated costs, and rejected higher-cost alternatives are explicit. No new managed service or
  always-on compute is planned.
- **Simplicity, review, comments, and documentation — PASS**: First-party Apple frameworks are used
  except for the narrowly vendored Argon2 primitive required by an existing wire format. Shared
  behavior lives in packages while UI remains target-specific. Tasks must include final-diff review,
  security/data-loss review, architecture/runbook updates, and comments for cryptographic,
  synchronization, migration, and lifecycle invariants.

No constitution violation or approved exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/012-native-apple-apps/
├── plan.md
├── research.md
├── parity-matrix.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── native-api-additions.openapi.yaml
│   ├── native-security-sync.md
│   ├── native-system-surfaces.md
│   └── release-compatibility.md
└── tasks.md                         # created later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/
├── api/
│   ├── src/auth/                    # existing cookie/session contract, compatibility response
│   ├── src/notifications/           # APNs registration and delivery alongside Web Push
│   └── test/                        # native contract/auth/notification integration tests
├── apple/
│   ├── Naaseh.xcworkspace/
│   ├── Naaseh.xcodeproj/
│   ├── Config/                      # checked-in non-secret xcconfig values
│   ├── iOSApp/                      # universal iPhone/iPad entry point and platform UI
│   ├── macOSApp/                    # native desktop entry point and platform UI
│   ├── SystemExtensions/            # Live Activity/widget/App Intent shared target support
│   └── UITests/                     # platform-focused XCUITest targets
└── web/                             # unchanged UI; shared-fixture compatibility checks only

packages/
├── apple/
│   ├── Package.swift
│   ├── Sources/
│   │   ├── NaasehContracts/         # Codable wire models and problem envelopes
│   │   ├── NaasehCrypto/            # AES-GCM/RSA-OAEP/Argon2 interoperability
│   │   ├── NaasehPersistence/       # encrypted SwiftData envelopes and migrations
│   │   ├── NaasehSync/              # outbox, cursors, retries, conflicts, compatibility gate
│   │   ├── NaasehServices/          # auth, API, files, reports, alerts
│   │   ├── NaasehFeatures/          # shared feature state and commands
│   │   ├── NaasehDesignSystem/      # semantic styles and accessible controls
│   │   └── NaasehTestSupport/       # fixtures, clocks, stores, transports
│   └── Tests/
├── contracts/                       # existing TypeScript/OpenAPI contracts
├── domain/                          # existing authoritative domain behavior
└── test-fixtures/
    └── fixtures/apple/              # language-neutral canonical JSON/crypto fixtures

infra/
├── lib/notification-stack.ts        # grants/config only; no new managed service
└── test/                            # APNs and no-new-service CDK assertions

docs/
├── architecture/                    # native client/security/sync architecture
├── operations/                      # App Store Connect/TestFlight and production rollout
├── runbooks/                        # notification, migration, rollback, account cleanup
├── security/                        # threat model and crypto review
└── testing/                         # device/release matrices and runtime evidence
```

**Structure Decision**: Keep the existing JavaScript workspaces intact and add `apps/apple` for the
two native app targets plus `packages/apple` for shared Swift packages. This gives iPhone/iPad and
Mac distinct app composition roots while sharing behavior that must remain identical. Language-
neutral fixtures live under the existing test-fixtures package so Swift, API, and web tests can all
consume the same canonical cases without attempting to compile TypeScript into the Apple clients.

## Delivery Strategy

Implementation should follow the bounded feature sequence already captured in
[the native backlog](../../docs/product/ios-app-feature-backlog.md), beginning with application
foundation, shell, authentication, and encrypted sync before product parity modules. A feature may
merge only when its own independently testable journey works on every platform it touches; the
complete TestFlight rollout waits for all FR-001 through FR-048 and release gates.

Cross-cutting server work lands behind a native-client compatibility response and registration
capability so older native builds fail closed before mutation. The same request-driven compatibility
Lambda accepts bounded authenticated native telemetry; it does not add a managed service or
always-on process. [The parity matrix](./parity-matrix.md) is the release traceability index for every
end-user story in specifications 001 through 011 and must remain synchronized with tests. The
dedicated production smoke account receives each TestFlight build first. Promotion to ordinary
production accounts requires clean install, upgrade, offline replay, notification, Siri,
accessibility, and PWA/native interoperability evidence, plus a confirmed rollback/expiry path.

## Complexity Tracking

No constitution violations require justification.
