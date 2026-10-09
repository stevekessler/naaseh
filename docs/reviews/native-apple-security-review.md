# Native Apple security and privacy review

Reviewed 2026-10-08. Automated/source result: **PASS**. Signed-device inspection: **pending TestFlight gate**.

| Surface               | Evidence and finding                                                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local files           | SwiftData values/outbox are encrypted and account-partitioned; exports and previews use protected writes and explicit cleanup. Low-storage and missing-key tests fail closed.                                    |
| Keychain              | Sessions, CSRF, trusted-device state, device root keys, and telemetry keys are non-synchronizing, this-device-only items. Root keys require user presence.                                                       |
| Snapshots/previews    | Sensitive journal/Crisis Plan views use privacy controls in the platform UI sources; notification previews become generic when protected data is unavailable. Physical app-switcher inspection remains required. |
| Logs/crashes/feedback | Native diagnostics and feedback use closed content-free schemas. Task, memo, journal, plan, attachment, user, token, and credential fields cannot be encoded.                                                    |
| APNs                  | Payload size is bounded; generic text is the default; task and occurrence identifiers are reauthorized before routing. Token rotation and unregister are tested.                                                 |
| Siri                  | Only transient task input and authorized active project entities are exposed; intent tests prohibit proactive donation/indexing and avoid echoing protected content.                                             |
| URLs                  | OAuth and Siri continuation URLs validate scheme/state/opaque token and route through authorization. No protected body is placed in a URL.                                                                       |
| Clipboard             | No native clipboard API use was found. Protected-data exclusions explicitly include clipboard.                                                                                                                   |
| Temporary files       | File previews and report exports use protected destinations and cleanup paths; tests verify cleanup and scan-gated preview.                                                                                      |
| Donations/search      | Source/privacy tests reject `CSSearchableIndex`, `INInteraction`, and `NSUserActivity` donations.                                                                                                                |

Validation included the full Swift package suite, native telemetry/API negative tests, administrator-boundary tests, crypto fixtures, file workflow tests, alert tests, and source scans. No protected-data leak was found. Before promotion, inspect signed binaries, app-switcher snapshots, crash organizer output, system notification history, and Siri transcripts on each physical platform; those cannot be honestly certified from this host.
