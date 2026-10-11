# Apple TestFlight upgrade and rollback

## Before upload

1. Tag the reviewed source revision and assign the same marketing/build version to both targets.
2. Verify free space, Keychain/root-key availability, the current encrypted store, and pending outbox count.
3. Create signed archives and run `scripts/validate_apple_archive.py` against both.
4. Confirm the server compatibility window accepts contract 4 and the candidate build.

## Clean install and upgrade

On clean install, authenticate with the dedicated smoke account, complete TFA, bootstrap, then verify no other account partition exists. On upgrade, record the pending-work count, terminate once during a fixture migration, relaunch, and verify the migration journal resumes idempotently. The previous store remains read-only until the replacement is verified and atomically selected.

Low storage, a missing key, corrupt ciphertext, or interrupted migration must block mutation and retain the old encrypted store. Never reset or delete local data as an automatic recovery step. Re-establish the missing key or storage, relaunch, and retry; otherwise sign out only after the tester confirms pending work has been exported or synchronized.

## Compatibility and expiry

An unsupported contract, build below the platform minimum, or expired beta is read-only. Existing encrypted pending rows remain intact. A temporary server pause is displayed separately from ordinary offline operation. Offline mutation is allowed only after a successful compatibility decision for the installed build.

## Rollback

1. Stop TestFlight testing for the unsafe build.
2. Do not lower schemas or erase server fields. Keep the server contract additive for the supported web/native window.
3. Publish or restore a compatible build. Raise the server minimum only after the replacement passes pending-work recovery.
4. Install the replacement over the candidate, verify migration journal completion, reconcile pending operation IDs exactly once, and run the smoke matrix.
5. Record source/build identity, reason, timestamps, compatibility settings, pending counts by bucket, and result without protected content.
