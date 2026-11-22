# Implementation Plan — Contacts and Inventory

**Checkout** `main` | **Feature** `017-contacts-inventory` | **Date** 2026-11-17 | **Spec** [spec.md](spec.md)

## Summary

Add Contacts under Lists, Inventory including Medicine in the main navigation, and Admin catalogs for contact types, locations, and strength units. Contacts and Inventory ship with their Combined Search integrations as one independently deployable web release. A one-time host integration on the supported baseline provides navigation, identity and offline lifecycle hooks. A dedicated release pipeline publishes versioned UI and API artifacts and activates or rolls back feature 017 independently. Steve and Heather automatically use one shared workspace for all Contacts and Inventory records, including Medicine. Either member can delete a record, ending access for both.

## Technical Context

| Area | Planned approach |
| --- | --- |
| Runtime and dependencies | Node 24, TypeScript, React and Vite, Dexie and Web Crypto, repository validators, AWS CDK |
| Platform | Na’aseh web/PWA in stable Chrome and Safari/WebKit, including iPhone and iPad. Native clients are compatibility targets. |
| Storage | Feature-owned on-demand DynamoDB and encrypted, versioned S3; separate retained deletion ledger; local encrypted, account-scoped IndexedDB |
| Interfaces | Same-origin host integration and feature API. Existing session, Finance, and native sync contracts remain interoperable. |
| Offline behavior | Warm feature assets and cached workspace/reference records; encrypted transactional drafts/outbox; catch up shared edits and tombstones on reconnect and foreground activation; preserve pending edits as conflicts if their record was deleted |
| Security | Host session authorizer, CSRF checks, workspace-member access to records and admin-only catalog writes, authorized image reads and short upload credentials, protected local state, least-privilege IAM |
| Observability | Feature application logs for 30 days, audit logs for 90 days; alarms for sustained API failures, scan/reconciliation backlog and failures, and backup failure. Aggregated replay/conflict, scan delay and API latency metrics with bounded dimensions. |
| Scale and performance | 500 contacts plus 500 inventory records for a representative mobile account. At least 95% of loaded-data queries and filter changes within 2 seconds on throttled mobile. |
| Validation | Vitest, API contract/integration tests, CDK synth/diff, the repository’s locked Playwright 1.61.1 across Chromium/WebKit and touch profiles, hosted deploy/rollback and recovery drills |
| AWS and cost | Managed serverless in us-west-2; estimated $1–$5/month incremental at the planning workload. Assumptions, rates and alternatives in [research.md](research.md). |

## Constitution Check

| Gate | Before design | After design |
| --- | --- | --- |
| Security and data boundaries | Pass. Access limited to the two workspace members. Catalog edits require the admin role. | Session/CSRF, scoped authorization, encrypted caching, protected image access, audit, and negative tests specified. The workspace holds all records. Both configured members can edit and delete. Provisioning establishes membership once, without invitations, acceptance or individual access grants. Deletion ends both members’ access to the record. |
| Durability and observability | Pass. Retries, conflicts, backup and observability required. | Conditional revisions, durable operation receipts, reference and image transactions, a retained deletion ledger, recovery rehearsal, and redacted logs specified. |
| Offline and resynchronization | Pass. Web edits and cached reads require an offline path. | Account-scoped store, queued edits with replay, lifecycle cleanup, and offline image behavior specified. |
| Browser support | Pass. Chrome and Safari/WebKit in scope. | Responsive/touch, foreground reconnect, page reload, and private-data tests specified in [quickstart.md](quickstart.md). |
| Automated tests | Pass. Risk-based coverage required. | Unit, integration, contract, Chromium/WebKit, and hosted release/recovery gates mapped. Required validation budget is preserved. |
| Performance and AWS architecture | Pass. Serverless alternatives and measurable limits required. | Workload and provisional budget in [research.md](research.md). Mobile thresholds and hosted infrastructure checks in [quickstart.md](quickstart.md). |
| Simplicity, review and documentation | Pass. Release independence justifies its own artifact and data boundaries. | One host integration, no separate app shell or search service. Tasks will include final diff review, release/restore documentation, and comments for concurrency and browser invariants. |

## Project Structure

### Documentation

| Artifact | Purpose |
| --- | --- |
| [research.md](research.md) | Release design decisions, alternatives and cost |
| [data-model.md](data-model.md) | Entities, lifecycle, concurrency and retention |
| [contracts/host-release.md](contracts/host-release.md) | Host slots, artifact manifest and deploy/rollback rules |
| [contracts/http-api.md](contracts/http-api.md) | Feature endpoints, request semantics and errors |
| [quickstart.md](quickstart.md) | Validation scenarios and release evidence |
| [tasks.md](tasks.md) | Existing implementation checklist |

### Source Code

| Proposed area | Ownership |
| --- | --- |
| `apps/web/src/features/contacts-inventory-host/` | Small host loader and typed adapters. Existing router, menus, search and worker receive explicit integration points. |
| `apps/contacts-inventory/` | Standalone Vite artifact, screens, filters, admin UI, feature-scoped offline cache and replay |
| `apps/api/src/contacts-inventory/` | Feature-only bundle entry points, routing, storage and media lifecycle |
| `packages/contacts-inventory-contracts/` | Versioned host and API schemas used at build time |
| `infra/lib/contacts-inventory-*.ts` | Retained feature resources, feature release code and independent deployment entry |
| `.github/workflows/`, `docs/operations/` | Protected feature release and rollback workflow and operator runbook |
| `tests/`, feature-local test folders | Unit, protocol, integration, browser, performance and release sequencing |

Both independently built artifacts consume baseline-compatible utilities at build time. Keep pending Finance and Apple sources out of the feature diff, and keep all writes out of the task, Finance, and native sync data planes.

## Implementation Sequence

1. **Host support and release proof.** Use an isolated feature branch based on the supported main baseline. Implement the one-time shell and edge preparation, stable API/authorizer inputs, and the protected feature artifact pipeline. First demonstrate an install and rollback with a fixture feature, with and without the supported Finance web build. Preserve the host bridge when promoting or rolling back another web release. Require zero changes to Finance artifacts or deployed native contract behavior across feature operations.
2. **Feature data and security.** Add retained DynamoDB and media, idempotent catalog seeds, workspace access, record deletion and admin policies, browser vault adapter, recovery instrumentation, and contract/negative tests.
3. **Contacts and Inventory.** Build Contacts and its filter page, locations and base inventory, safe image operations, and then Medicine, its catalog and dependent filter/list workflows. Add offline persistence/replay and test macOS/iOS browser behavior separately from native compatibility.
4. **Search and release verification.** Register three opt-in Search scopes and prove upgraded preference defaults and private-data isolation. Run performance, backup/restore and hosted install/upgrade/rollback drills in [quickstart.md](quickstart.md). Review infrastructure cost, operational runbook, and final diff before release.

## Validation Budget and Rollback

New browser combinations and hosted release drills belong in targeted local/release runs. If a representative test is later proposed for required PR checks, follow [AGENTS.md](../../AGENTS.md) for test counts, before/after local timings and hosted duration. The planning phase makes no workflow or application changes.

Use feature-only activation and retained resources as described in the [host and release contract](contracts/host-release.md). Recovery restores DynamoDB and image versions to isolated destinations. Verify and reapply the separately retained deletion ledger, rebuild reference counts, and advance the sync generation before reattaching the feature backend. Use the existing checklist’s foundation and release gates to verify these invariants.
