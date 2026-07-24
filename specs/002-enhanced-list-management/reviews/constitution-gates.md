# Constitution gates

Last reviewed: 2026-07-23

| Gate | Decision |
| --- | --- |
| Offline-first durability | Pass for implemented local mutations and atomic entity/outbox writes. |
| Authorization and privacy | Pass in local policy/security tests; live revocation timing still needs deployed evidence. |
| Encryption and secret handling | Pass in design, synthesis, cache exclusions, and log allowlist checks. |
| Accessibility and responsive behavior | Implementation present; full browser/device matrix remains a release gate. |
| Recovery | Local restore logic and synthesis pass; a real quarterly AWS restore remains an operational gate. |
| Bounded operations | Sync and UI paths are bounded; the 50,000-row export performance gate still needs dedicated recorded evidence. |

Readiness decision: suitable for continued integration, but not for production release until the
browser matrix, live AWS checks, and dedicated large-export measurement in `validation-results.md`
are complete.
