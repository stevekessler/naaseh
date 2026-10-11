# Native Apple data durability review

Reviewed 2026-10-08. Deterministic result: **PASS**. Physical upgrade/backup restore: **pending TestFlight gate**.

- Entity and outbox commits are atomic and account-partitioned.
- Low-storage injection leaves neither a partial entity nor a partial outbox row.
- Interrupted staged migrations are journaled, quarantined on the next open, and can roll back to the validated source store.
- Missing or wrong keys block opening; they never reinterpret protected data as an empty account.
- Compatibility, beta expiry, and temporary outage block unsafe mutation while retaining encrypted pending work.
- Sign-out deactivates sync, closes persistence, and removes only the selected account’s Keychain material. The release runbook requires pending work to sync or be explicitly acknowledged before destructive account cleanup.
- Duplicate delivery, four-client convergence, conflict handling, revocation, and the 1,000-operation replay workload passed with zero duplicate effects.
- Journal/Crisis Plan encryption, key rotation, RSA recovery, background zeroization, and recipient revocation passed cross-language fixtures.

Executed evidence: full Swift package suite (77 tests across the package’s Swift Testing runs), 12 focused API durability tests, Chromium/WebKit offline update recovery, and the deterministic SC-005 workload. Core Data emitted benign registration warnings during temporary-store teardown but no test failed.

Outstanding release evidence is forced termination of a signed app during a real store migration, device low-storage behavior, backup/restore/re-bootstrap, and upgrade replacement on supported physical iPhone, iPad, and Mac hardware. These remain blockers for SC-011/SC-014 and TestFlight promotion, not hidden as automated passes.
