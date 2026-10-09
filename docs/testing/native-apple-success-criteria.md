# Native Apple success-criteria results

Validated on 2026-10-08 against the implementation and traceability artifacts for feature 012.
This document distinguishes automated evidence from the physical-device, hosted CI, production,
and App Store Connect evidence that is still required before a TestFlight rollout.

## Parity traceability

The parity matrix contains all 64 source-story rows from specifications 001 through 011. Every row
has an implementation-task mapping and a validation-task mapping. The explicit exclusions are user
provisioning, system administration, Category and Project lifecycle administration, and recovery-
operator work. Native clients can use existing authorized Categories and Projects but cannot create,
edit, archive, restore, or delete them. `NativeAdminExclusionTests` and the native API authorization
tests pass and verify that these routes, modules, and operations are absent.

The matrix is structurally complete, but its Native rows cannot receive a final release-pass verdict
until the physical-platform and TestFlight evidence below is collected. That blocks SC-001 without
invalidating the implemented/tested mappings.

## Measurable outcomes

| Criterion | Result                                                | Evidence and remaining work                                                                                                                                                                                                                                                                                      |
| --------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-001    | **Blocked**                                           | All 64 rows are mapped and automated domain/service coverage passes. Supported iPhone, iPad, and Mac primary-journey execution remains pending with T080, T131, and T153.                                                                                                                                        |
| SC-002    | **Automated pass; production smoke pending**          | Four-client convergence, offline outbox, conflict, revocation, retry, and atomic persistence tests pass with no silent loss. Production smoke-account confirmation remains part of T153.                                                                                                                         |
| SC-003    | **Automated pass; signed-surface inspection pending** | Authorization-negative, encrypted storage, hidden memo, Journal/Crisis Plan, alert privacy, Siri privacy, diagnostics, and feedback-schema tests pass. Inspect signed notifications, Siri/system search, screenshots, logs, and feedback on physical devices in T153.                                            |
| SC-004    | **Blocked**                                           | The versioned corpus contains 240 complete and 60 ambiguous cases with the required balance. Service parsing, authorization, ambiguity, durability, and deduplication tests pass; the 80+20 spoken requests per platform have not run on representative hardware (T080).                                         |
| SC-005    | **Pass**                                              | A deterministic 1,000-ID workload replays every ID two to five times: 200 voice, 200 alert, 200 sync, 150 completion, 150 timer, and 100 sharing operations. It produces zero duplicate durable effects.                                                                                                         |
| SC-006    | **Automated pass; APNs smoke pending**                | Alert reconciliation tests cover changed, completed, deleted, revoked, rescheduled, stale-action, local/remote duplicate, token-rotation, and private-preview cases. Physical APNs delivery/cancellation remains in T153.                                                                                        |
| SC-007    | **Automated pass; cross-device smoke pending**        | Canonical timer tests cover correction, background/termination reconstruction, idempotent transitions, and convergence within one second. Native/web physical-device confirmation remains in T153.                                                                                                               |
| SC-008    | **Partial pass**                                      | Package workloads pass 10,000-record search under one second and local mutation/layout projection thresholds in at least 95% of runs. Representative-hardware warm navigation and 250 ms layout measurement remain blocked by T131.                                                                              |
| SC-009    | **Automated pass; physical alternatives pending**     | VoiceOver labels, values, traits, order, focus behavior, status announcements, target sizing, and non-color/non-motion meaning are implemented and covered by source/XCUITest checks. Per release scope, a manual VoiceOver pass is optional. Physical keyboard and alternative-control journeys remain in T131. |
| SC-010    | **Blocked**                                           | Phone safe-area/keyboard, iPad state restoration, and Mac multiwindow/resize behavior have source and unit coverage. Physical window-class, resize, keyboard, and restoration matrices remain T131/T153 release evidence.                                                                                        |
| SC-011    | **Automated pass; signed upgrade smoke pending**      | Clean-store, staged migration, interruption quarantine, rollback, low-storage atomicity, key failure, sign-out, account partition, and account-switch tests pass with zero silent loss. Signed build upgrade/backup/restore remains in T153.                                                                     |
| SC-012    | **Automated pass; device availability cases pending** | Compatibility, expired build/version, offline, expired session, blocked mutation, and actionable-state tests pass. Unsupported hardware and unavailable Siri behavior must be inspected on physical devices in T080/T153.                                                                                        |
| SC-013    | **Blocked**                                           | The unchanged required browser gate has 30 tests and passed locally in 26.94 seconds. A candidate six-test Swift slice passed in 2.06 seconds. No required workflow expansion was made; hosted PR duration for this diff remains T166.                                                                           |
| SC-014    | **Blocked**                                           | Archive validators and TestFlight configuration sources pass. No signed iPhone/iPad or Mac build has been uploaded, processed, installed, upgraded, or smoke-tested (T149/T153).                                                                                                                                 |
| SC-015    | **Planning pass; production measurement pending**     | The design reuses existing API Gateway, Lambda, DynamoDB, Scheduler, logs, alarms, and notification resources and adds no always-on service or separate beta environment. Confirm the production Cost Explorer delta after smoke traffic before expanding access.                                                |

## Release verdict

The automated implementation baseline is suitable for continued release preparation, but the first
tester rollout is **not approved**. Open release gates are the Siri device corpus (T080), physical
layout/accessibility evidence (T131), App Store Connect configuration (T149), signed TestFlight
archive/upload/smoke (T153), and hosted PR runtime confirmation (T166).
