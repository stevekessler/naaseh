# Apple security audit — 2026-10-29

Scope: current working-tree sources in `apps/apple` and `packages/apple`, including shared code used by macOS, iOS, and iPadOS. Relevant API group-revocation and web cleanup code were inspected to establish the actual server contract. Existing uncommitted work was included as found. No application code or required validation commands were changed.

Result: **four actionable findings**, including two high-priority failures to withdraw local access. Existing automated tests passing does not establish that these lifecycle boundaries are safe. This is a source and local test audit, not certification of signed binaries or physical devices.

## 1. [P1] Group revocation is rejected instead of purging the local group data

Primary location: `packages/apple/Sources/NaasehSync/SecureNativeSyncStore.swift:43`.

The API emits an `accessControl` tombstone with the group ID when a member is removed or a group is archived (`apps/api/src/groups/group-service.ts:155` and `:198`). The native transport preserves that tombstone, but the production store tries to convert its kind into `LocalRecordKind`, which has no `accessControl` case. Applying the page throws before deleting records or advancing the cursor. Previously downloaded group lists/items and pending operations remain locally accessible. Retrying encounters the same failing page.

The separate `NativeSyncPage.revokedAudiences` field is also ignored by the production store. The in-memory implementation handles that field, which is why its existing revocation test passes.

Reproduction: opened an actual temporary SwiftData store, activated its account key, and inserted a cached group list with a queued mutation. Applying the API's `accessControl` tombstone threw `unsupportedRecordKind("accessControl")`; both the readable list and mutation remained. Applying a page with `revokedAudiences` also retained the list.

Fix: recognize the API's access-control events, resolve all affected cached entities, and atomically delete those entities and their pending operations before advancing the cursor. Clear corresponding presentation state. Test this using `SecureNativeSyncStore` and the real API event shape, including a page with unrelated changes.

## 2. [P1] Disabled or expired sessions leave the open workspace accessible

Primary location: `packages/apple/Sources/NaasehFeatures/AppCore/NativeApplicationRuntime.swift:78`.

`AuthenticationService.validateSession()` throws for disabled/expired sessions without clearing the session (`packages/apple/Sources/NaasehServices/AuthenticationService.swift:257`). Runtime refresh propagates the error without deactivating the encrypted store or withdrawing its key. Both app entry points ignore foreground/periodic refresh errors with `try?` and retain the ready workspace and loaded tasks. The alternative `AppCore.refresh()` also treats every failure as offline readiness.

After the server explicitly rejects the session, a person using the open app can still read previously authorized local data and queue changes. This is a failure to revoke local access; it does not establish a bypass of server-side authorization.

Reproduction: restored an authenticated session, returned a valid 403 `account_disabled` problem, and verified that validation threw while the credential remained present and `isLocallyLocked` remained false. Source tracing confirmed the open-store/UI retention path.

Fix: distinguish definitive authorization failures from transient connectivity failures. On definitive rejection, immediately hide protected views, deactivate local data access, clear credentials and transient state, and invoke the appropriate account-disablement or expiry cleanup policy. Cover both live app entry points.

Test gap: the existing `failuresFailClosed` authentication test never restores a session, so `validateSession()` throws `noSession` before making any of its intended failing requests.

## 3. [P2] A failed logout prevents local sign-out and secret cleanup

Primary location: `packages/apple/Sources/NaasehFeatures/AppCore/NativeApplicationRuntime.swift:86`.

The runtime awaits remote logout before deactivating the store, closing persistence, or purging Keychain secrets. `AuthenticationService.logout()` itself clears its credential only after a successful response (`packages/apple/Sources/NaasehServices/AuthenticationService.swift:289`). A network failure, expired session, or disabled-account response therefore leaves local credentials and access intact when sign-out is attempted. `AppCore.signOut()` likewise does not transition to signed out if the request throws.

Reproduction: a valid disabled-account response to logout threw and retained the authenticated session. The runtime cleanup operations are all after that throwing call.

Fix: complete local sign-out even when server logout fails. Attempt remote invalidation on a best-effort basis, then reliably deactivate the store and clear credentials/transient surfaces. Preserve any intended pending-work recovery decision before destroying its encryption key. Test offline, 401, 403, and server-error responses.

## 4. [P2] Debug builds ignore the production-data isolation configuration

Primary locations: `apps/apple/iOSApp/NaasehIOSApp.swift:25` and `apps/apple/macOSApp/NaasehMacApp.swift:25`.

Both app initializers hard-code `https://gsd.thepandas.link` and the production app-group identifier. `Config/Debug.xcconfig` specifies localhost, a separate app group, and `NAASEH_ENABLE_PRODUCTION_DATA = NO`, but those settings are not consumed by these initializers. Debug builds consequently direct login, sync, and telemetry traffic toward the live service; on a signed configuration without access to the hard-coded group, startup instead fails after authentication. The intended separation between development and production does not hold.

Evidence: source tracing of both app initializers and the Debug/TestFlight configurations. No live production login or mutation was attempted.

Fix: expose validated build configuration to the app and consume it for the API origin, app group, and enabled features. Fail closed on contradictory configuration. Verify resolved Debug and TestFlight behavior in configuration tests, not just the presence of expected text in xcconfig files.

## Additional review notes

These require follow-up and are not counted among the four confirmed findings:

- Local lock needs a complete integration review. The installed runtime's `lock()` only sets an authentication flag; it does not deactivate the encrypted store or clear loaded task state. The Mac command enters a root locked screen with no unlock control. `AuthenticationViewModel.unlock()` does not itself invoke LocalAuthentication, although its configured callback subsequently reloads a user-presence-protected root key. This audit does **not** claim that the complete unlock flow bypasses device authentication.
- Journal unlock accepts Argon2 memory/iteration/parallelism settings from its envelope without upper bounds before doing expensive work (`JournalCryptoService.swift:118`, `NaasehCrypto.swift:91`). Bound supported parameters before processing untrusted envelopes. No resource-exhaustion payload was executed, and a live ingestion path into the current placeholder journal UI was not established.
- Physical-device privacy inspection remains necessary. Journal scenes have background redaction, but top-level task/workspace views do not show equivalent background handling. Confirm app-switcher snapshots and all presented sheets on iPhone/iPad, plus inactive windows and previews on Mac.

## Validation and limits

- Focused existing tests: **19 passed**, covering authentication, secure account policy, encrypted persistence recovery, file workflow, hidden memo cryptography, and journal/crisis-plan cryptography.
- Full existing Swift package suite: **passed**, using an isolated build directory under `/private/tmp`.
- Three isolated audit reproduction tests: **passed**, demonstrating retained disabled-session credentials, retained credentials after rejected logout, and missing production-store group-revocation cleanup. These assert the observed unsafe behavior; they are not regression tests asserting a fix. Harness location for this session: `/private/tmp/naaseh-audit-harness/Tests/AuditTests/AuditTests.swift`.
- Existing cryptographic primitives include AES-GCM authenticated encryption, HKDF, Argon2id, and RSA-OAEP; the API client restricts origins, rejects redirects, and uses ephemeral networking without shared cookie/cache storage. No hard-coded private key or server credential was found in the reviewed native configuration.
- No signed app archive, real Keychain biometric prompt, physical iPhone/iPad/Mac behavior, APNs delivery, or live server penetration test was performed. The package suite runs on macOS; it does not replace platform UI or entitlement testing.
- Existing `docs/reviews/native-apple-security-review.md` was left untouched. Its earlier PASS should not be treated as resolving the findings above.

## Follow-up decisions and implementation — 2026-10-29

The user clarified the intended deployment and access policy after this audit:

1. Group-revocation cleanup is fixed in the production encrypted store, including dependent records,
   queued work, conflicts, and persisted protection against stale edits/pages restoring the data.
2. Offline access is permitted for seven days after the last successful online session validation,
   including cold launches. At the deadline access locks and encrypted work is retained for later
   revalidation. An explicit session rejection or disabled-account signal removes that account's
   data and keys immediately. The app entry points now route refresh failures through this policy.
3. Failed logout is an accepted behavior: inform the user and retain the session/local data.
   The app now displays an error for the failed attempt. The original recommendation to force
   local sign-out on failure is superseded by this user decision.
4. Debug access to production is intentional for the present two-user deployment and is accepted.
   Production origin configuration was left unchanged.

These decisions supersede the corresponding remediation recommendations above. Regression tests
exercise the production store and session runtime, rather than relying only on in-memory substitutes.

Follow-up validation: the full Swift package suite passed with **91 tests**. The macOS Debug build
and the iOS Debug simulator-target build (shared iPhone/iPad app) both succeeded with signing
disabled. Interactive simulator tests were not run because Xcode reported an outdated CoreSimulator
service. No required PR workflow or browser validation command was expanded or changed.
