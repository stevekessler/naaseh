# Research: Native Apple Applications

## Decision 1: Native targets and module boundaries

**Decision**: Create one universal iOS/iPadOS 27 target and one native macOS 27 target, both using
SwiftUI and thin composition roots over shared local Swift packages. Use `NavigationStack` on
iPhone, adaptive `NavigationSplitView` and multiple scenes on iPad, and `WindowGroup`, commands,
menus, toolbars, inspectors, status surfaces, and desktop file flows on Mac.

**Rationale**: The product requires platform-appropriate behavior, not a stretched phone UI.
SwiftUI's split navigation collapses naturally for narrow size classes while still allowing target-
specific composition. A separate Mac target avoids Catalyst behavior and enables desktop lifecycle
and interaction conventions directly.

**Alternatives considered**:

- Capacitor or a web view: rejected by the confirmed SwiftUI decision and the need for native Siri,
  alerts, timer surfaces, windows, accessibility, and desktop behavior.
- Mac Catalyst: rejected because the release explicitly requires a native Swift macOS target.
- Three fully separate codebases: rejected because domain, crypto, sync, and service behavior must
  remain identical and independently duplicating them increases drift risk.

**Evidence**: [NavigationSplitView](https://developer.apple.com/documentation/swiftui/navigationsplitview)
supports two/three-column navigation and compact collapse; Apple supports multiple SwiftUI windows
on macOS. The local toolchain is Xcode 27.0 with Swift 6.4.

## Decision 2: Persistence and local encryption

**Decision**: Use SwiftData for schema management, app-group placement, migrations, and atomic
commits, but store domain records, outbox payloads, conflicts, and sensitive preferences as opaque
AES-256-GCM envelopes. Keep only minimum non-sensitive routing/index fields in plaintext. A single
storage actor owns all model contexts and commits the changed record plus outbox row together.

**Rationale**: SwiftData is first-party, supports explicit schema migration plans and App Group
configuration, and avoids introducing a general database dependency. It does not by itself satisfy
application-level protected-field requirements, so encryption remains explicit. A storage actor
also serializes multiple scenes and App Intent writes.

**Alternatives considered**:

- Plain SwiftData models: rejected because file protection and platform disk encryption do not meet
  the established encrypted-record boundary.
- Third-party SQLite/GRDB or SQLCipher: technically capable, but rejected for v1 because it adds a
  broad dependency and migration surface without a demonstrated requirement SwiftData cannot meet.
- One store per feature: rejected because atomic entity/outbox commits and account cleanup are safer
  with one account-partitioned store.

**Evidence**: Apple's [ModelContainer documentation](https://developer.apple.com/documentation/swiftdata/modelcontainer)
documents consistent persistence, schema migrations, and custom App Group configuration.

## Decision 3: Key and session protection

**Decision**: Generate a random device root key per installation/account, store it in a
non-synchronizing Keychain item, and derive per-purpose keys with HKDF-SHA256. Gate root-key access
with Face ID/Touch ID or device passcode after normal sign-in. Store opaque session, pre-auth, CSRF,
and trusted-device values as separate Keychain items and use an ephemeral URLSession so session
cookies are not also retained in an uncontrolled cookie jar.

**Rationale**: This limits secret persistence, makes local biometric unlock independent of server
authentication, and allows deterministic purge. The native client can continue the current
`__Host-naaseh` cookie and CSRF contract by forming the Cookie, Origin, and `X-CSRF-Token` headers
itself against the production origin.

**Alternatives considered**:

- Passkeys: explicitly out of scope.
- Biometric sign-in: rejected because biometric success is local presence proof, not server
  identity or authorization.
- Synchronizable Keychain: rejected because an installation's cache key and session must not roam
  to another device implicitly.
- New bearer-token authentication: rejected because the existing opaque session model already
  satisfies the need and a second auth mode would enlarge the server security surface.

**Evidence**: Apple's [Keychain services](https://developer.apple.com/documentation/security/keychain-services)
and [biometric Keychain access](https://developer.apple.com/documentation/localauthentication/accessing-keychain-items-with-face-id-or-touch-id)
support encrypted small-secret storage with biometric/device-presence access control.

## Decision 4: Cryptographic interoperability

**Decision**: Use CryptoKit `AES.GCM`, SHA-256, HMAC, and HKDF for existing symmetric formats;
Security framework `SecKey` with RSA-OAEP-SHA256 for recovery wrapping; and a locally vendored,
pinned upstream Argon2 reference implementation only for the existing Argon2id PIN-wrap format.
Require byte-level fixtures produced and consumed by both the web and Swift implementations.

**Rationale**: Apple frameworks cover all required primitives except Argon2id. Reimplementing
Argon2 is unsafe; a narrow source import of the upstream reference implementation pinned to commit
`f57e61e19229e23c4445b85494dbf7c07de721cb`, with canonical vectors and recorded license/hash, is
more reviewable than adopting a general crypto package. Cross-language fixtures catch base64url,
JSON canonicalization, nonce, tag, AAD, RSA, and parameter mismatches.

**Alternatives considered**:

- Change the wire KDF: rejected because existing encrypted user data and web compatibility are
  requirements.
- A young Swift Argon2 wrapper: rejected due to unnecessary maintainer and supply-chain risk.
- CryptoKit only: rejected because it does not provide the required Argon2id primitive.

**Evidence**: CryptoKit provides authenticated encryption and HKDF; Security exposes
[`rsaEncryptionOAEPSHA256`](https://developer.apple.com/documentation/security/seckeyalgorithm/rsaencryptionoaepsha256).

## Decision 5: Sync and contract compatibility

**Decision**: Preserve sync contract version 4, stable ULID mutation IDs, audience cursors,
idempotency receipts, versioned conflicts, and existing API problem envelopes. Add language-neutral
golden JSON fixtures that are decoded, validated, and re-encoded by TypeScript and Swift. Add a
small authenticated compatibility response containing minimum/supported app and contract versions;
fail closed before mutation if a TestFlight build is outside the window.

**Rationale**: The server already has the durability and authorization model needed for native
clients. Reusing it prevents parallel sources of truth. A compatibility gate lets operators expire
unsafe beta builds without corrupting shared production data.

**Alternatives considered**:

- New native-only API: rejected as duplicate behavior and cost.
- Direct DynamoDB access: rejected because it would bypass authorization and expose AWS credentials.
- CloudKit sync: rejected because the web client and existing AWS server must remain authoritative.

## Decision 6: Siri AI task capture

**Decision**: Implement one `AppIntent`/App Shortcut for task creation with a required label and
optional project, due date, and due time. Register discoverable phrases using the product name and
configure `GSD` as an alternate spoken app name. Resolve projects only by an in-process query over
the current authorized active local cache. Do not donate tasks, projects, usage history, or content
to Spotlight. Commit the task and outbox operation before returning success; carry unresolved or
locked input into a foreground continuation.

**Rationale**: App Intents are the native bridge to Siri AI, Apple Intelligence, Shortcuts, and
Spotlight. An on-demand shortcut can expose the action without indexing private product entities.
The same local command service used by the UI provides atomicity and duplicate handling.

**Alternatives considered**:

- Legacy SiriKit custom intents: rejected because no backward compatibility is required.
- Entity donation/indexing for project matching: rejected by the explicit privacy decision.
- Siri-only online creation: rejected because acknowledged offline voice captures must be durable.

**Evidence**: Apple documents [AppIntent](https://developer.apple.com/documentation/appintents/appintent)
as the action interface for Apple Intelligence, Siri, and Shortcuts, and recommends App Shortcuts
for common phrases. Apple's [App Intents verification guidance](https://developer.apple.com/documentation/appintents/verifying-your-app-intents-implementation)
supports code-level tests and end-to-end Siri checks.

## Decision 7: Native alerts and timer surfaces

**Decision**: Register APNs device tokens through the existing notification API partition and send
generic remote reminders from the existing scheduled notification Lambda. Reuse the current push
secret by adding APNs key ID, team ID, private key, and allowed topics; do not create SNS or another
secret. Use local notifications only for pending offline reminders and timer transitions. Use a
stable reminder occurrence ID across local and remote paths to suppress duplicates. Display the
canonical timer with ActivityKit on iPhone/iPad and a native menu/status surface on Mac; derive time
from stored anchors instead of continuous execution.

**Rationale**: Remote APNs delivery handles server-side changes while the app is terminated; local
alerts preserve useful offline behavior. The existing EventBridge schedule, Lambda, DynamoDB table,
secret, metrics, and alarms can support both Web Push and APNs at request scale. ActivityKit is
designed for lock-screen and system timer surfaces and supports App Intent controls.

**Alternatives considered**:

- Local notifications only: rejected because changes made on another client may never reconcile
  before the reminder fires.
- SNS mobile push: rejected because it introduces a new managed service and ongoing configuration
  for no required capability.
- Always-on APNs provider: rejected as unnecessary cost; Lambda can make token-authenticated HTTP/2
  requests when a schedule fires.
- Remote Live Activity updates in v1: rejected because local derivation from canonical timer state is
  sufficient and avoids more push token types and payload paths.

**Evidence**: Apple recommends token-based APNs provider authentication in
[Establishing a token-based connection to APNs](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns).
[ActivityKit](https://developer.apple.com/documentation/activitykit) provides Live Activities on
iPhone/iPad and Mac system surfaces, with WidgetKit/SwiftUI and App Intent controls.

## Decision 8: Files and external handoffs

**Decision**: Google Tasks synchronization is retired from the product. Use system
document/photo/camera pickers and security-scoped URLs,
stream uploads through existing presigned S3 contracts, stage plaintext only in a protected
temporary directory, and delete it after preview/share completion or cancellation.

**Rationale**: System-owned file pickers follow platform permission conventions. Existing API/S3
authorization, malware scan, and export workflows remain authoritative. Removing unused OAuth and
scheduled synchronization reduces credential exposure, AWS resources, and operational cost.

**Alternatives considered**:

- Retaining an unused OAuth integration: rejected because it adds credentials and operational cost
  without a required product capability.
- Permanent decrypted file cache: rejected because it expands exposure and cleanup risk.
- New native upload service: rejected because the existing presigned workflow already meets the
  requirement.

## Decision 9: TestFlight and rollout

**Decision**: Maintain separate App Store Connect records/builds for the universal iPhone/iPad app
and native Mac app, both built with Xcode 27 and targeting only OS 27. Begin every build with the
dedicated production smoke account; require explicit promotion evidence before normal accounts.
Provide server compatibility expiry, safe upgrade migrations, release notes, export-compliance
metadata, and a rollback/stop-testing runbook.

**Rationale**: TestFlight supports both iOS and macOS builds and feedback. The smoke gate protects
production data without paying for a duplicate AWS environment.

**Alternatives considered**:

- Separate AWS staging environment: explicitly rejected to avoid new AWS cost.
- Public App Store first release: explicitly out of scope.
- Running the iPad app on Mac: rejected because the requested desktop experience needs a native Mac
  target.

**Evidence**: Apple's [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
covers iOS/macOS beta distribution, feedback, build expiry, and testing groups.

## Decision 10: Validation and release gates

**Decision**: Keep the required pull-request gate focused on Swift package tests, one generic iOS
simulator build, one macOS build, changed TypeScript tests, and existing quick browser coverage only
after measured runtime proves the whole required check remains under ten minutes. Put full device,
window, accessibility, Siri, notification, low-storage, migration, and four-client matrices in the
local/pre-release gates.

**Rationale**: This keeps regressions visible without making required validation exceed the
repository's hard ten-minute policy. Physical Siri/APNs and real-device lifecycle behavior cannot be
reliably represented by the hosted PR job.

**Alternatives considered**:

- Full Apple matrix on every PR: rejected for runtime and flakiness.
- Manual-only validation: rejected because contract, durability, crypto, and core navigation risks
  require automated regression coverage.

## Decision 11: Centralized privacy-safe native telemetry

**Decision**: Send authenticated, content-free native diagnostic events to a bounded endpoint on the
same request-driven compatibility Lambda and existing CloudWatch log group. Accept only the closed
event schema in the native API contract, batches of 1-50 events, and requests no larger than 32 KiB.
The client keeps at most 100 pending events in a separately encrypted, protected ring file and
flushes only after session validation. If its telemetry key is unavailable, it keeps events in
memory for that process rather than writing plaintext. Server processing emits bounded structured
logs and metrics and stores no telemetry in DynamoDB.

**Rationale**: Client-only migration, local-store, cryptography, lifecycle, Siri, notification, and
file failures must be diagnosable centrally, but telemetry must not become another protected-data
store or add an AWS service. Reusing the compatibility route's Lambda, logging library, log group,
retention, and alarms provides operational visibility with request-proportional cost.

**Alternatives considered**:

- A crash-reporting SaaS: rejected because it adds a processor, SDK, contract, and cost before it is
  needed.
- A new telemetry Lambda, queue, topic, table, or log group: rejected because the bounded load does
  not justify additional AWS infrastructure or cost.
- Local-only diagnostics: rejected because failures that prevent sync or app startup would not be
  visible to operators.
- Sending task, project, user, file, journal, or voice values: rejected because diagnostic events
  need operation classes and safe error categories, not protected content.
