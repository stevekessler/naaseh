# Native encrypted-store recovery

Use this runbook when a native client reports a missing key, corrupt envelope, interrupted migration,
low-storage failure, repeated sync rejection, or pending work during sign-out.

## Safety rules

1. Do not ask the user for Keychain values, ciphertext, task text, journal text, filenames, voice
   transcripts, or notification payloads.
2. Record only the app version, build, platform, safe error class, time bucket, and correlation ID.
3. Do not delete the app or local store while recoverable pending work exists.
4. Server data remains authoritative only for operations already acknowledged as applied or
   duplicate. Never describe unacknowledged local work as synchronized.

## Triage

1. Confirm the client is a supported iOS/iPadOS/macOS 27 build and check the compatibility endpoint.
2. Ask the user to free storage when the safe error is `storageUnavailable`; retrying before space is
   available intentionally makes no partial write.
3. For `missingKey` or `decryptionFailed`, stop automatic mutation and sync. Lock all previews and
   system surfaces. A missing device-only root key cannot be reconstructed from AWS.
4. For `migrationInterrupted`, leave the quarantined store untouched. The application must either
   validate and complete the staged copy or roll back to the validated source version.
5. For sync conflicts, compare the encrypted local and current server versions in the app. Keep
   local creates a new mutation against the current server version; keep server discards only the
   selected local mutation.

## Pending-work sign-out or account switch

The user must choose one of these explicit paths:

- **Recover later**: create the application-defined encrypted recovery package, verify it was
  written, then purge the account’s keys and local partition.
- **Discard**: clearly confirm that unsynchronized work will be lost, remove the pending operations,
  then purge keys and the account partition.
- **Cancel**: leave the session, keys, store, alerts, and pending operations unchanged.

After cleanup, remove scheduled notifications, end Live Activities, clear transient plaintext, close
the SwiftData container, and purge only the selected account’s Keychain items. Open the next account
in a distinct namespace and verify no prior-account record is queryable.

## Verification

Run `npm run apple:test`, the native API contract tests, and the native sync interoperability browser
test. On a physical release device, verify relaunch, local unlock, offline pending work, reconnect,
conflict review, sign-out warning, and a clean sign-in to a second account. Full Xcode builds require
a healthy Xcode 27 installation; an `IDESimulatorFoundation`/`DVTDownloads` symbol mismatch is a host
installation failure and must be resolved by updating or reinstalling Xcode/system components.
