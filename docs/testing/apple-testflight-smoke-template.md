# Apple TestFlight smoke evidence

## Release identity

- Source revision:
- iPhone/iPad build and processed-at time:
- Mac build and processed-at time:
- Archive validator output attachment:
- Release operator/date/signature:
- Internal group: `Naaseh Smoke`
- Dedicated smoke-account procedure confirmed (no identifier recorded): yes/no

## Supported hardware

| Journey                                                     | iPhone OS 27 | iPadOS 27 | Apple-silicon Mac OS 27 | Result/evidence |
| ----------------------------------------------------------- | -----------: | --------: | ----------------------: | --------------- |
| Clean sign-in, TFA, lock, sign-out                          |              |           |                         |                 |
| Bootstrap, task/list/directory/report/settings parity       |              |           |                         |                 |
| Offline mutation, relaunch, replay, conflict                |              |           |                         |                 |
| Siri AI: Na’aseh/GSD, ambiguity, locked/offline/unavailable |              |           |   n/a where unsupported |                 |
| Native alerts, stale actions, timer transitions             |              |           |                         |                 |
| Journal and Crisis Plan privacy/recovery                    |              |           |                         |                 |
| File preview/export and Google OAuth return                 |              |           |                         |                 |
| Upgrade, interrupted migration, low storage, missing key    |              |           |                         |                 |
| VoiceOver/keyboard/large text/reduced motion                |              |           |                         |                 |

## Production safety gates

- Compatibility response and minimum-build control verified:
- CloudWatch bounded event reconstruction verified; protected values absent:
- Existing log-group retention and alarm state verified:
- AWS request/log delta and cost reviewed; no new service/resource:
- Chrome and Safari/WebKit interoperability passed:
- TestFlight feedback contained only safe diagnostics:
- Unsafe-build stop-testing/expiry exercise passed:
- Pending-work recovery and exactly-once checks passed:

## Decision

- Gate: PASS / FAIL
- Promotion remains internal-only until every row and safety gate passes.
- Findings, rollback action, and follow-up links:
