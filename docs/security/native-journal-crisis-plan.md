# Native Journal and Crisis Plan security boundary

Journal profiles, projections, bodies, and Crisis Plans are encrypted on the Apple client before
they enter the shared sync pipeline. AES-256-GCM uses canonical record identity, schema version,
key version, and opaque date token as authenticated data. The Journal Master Key is wrapped with a
minimum 64 MiB Argon2id PIN key and separately with the existing RSA-OAEP-256 recovery authority.
Unlocked key bytes are memory-only and are zeroized on lock, background, sign-out, or account
cleanup.

The server and administrators receive ciphertext, versions, opaque identifiers, and opaque date
tokens only. Journal and plan plaintext is prohibited from logs, telemetry, feedback, alerts,
previews, Siri, Spotlight, URLs, clipboard, scene restoration, and crash reports. Native client
headers never widen the authenticated account’s authorization.

A current owner Crisis Plan is required before the first journal entry. Journal entries cannot be
deleted. Owner changes can queue offline and use version conflicts; recipient access to a shared
Crisis Plan is online-only and plaintext is discarded when the view closes or access is revoked.
Revocation removes the grant and requires key rotation for remaining recipients. Triggering a plan
is an explicit display action that preserves the unsaved journal draft; it does not contact people,
emergency services, or clinical systems.

Recovery rewraps the same Journal Master Key through the existing audited recovery workflow. It
does not reveal plaintext to the operator. Failed recovery, wrong PIN, missing key, corrupt AAD,
revoked access, and offline recipient access all fail closed.
