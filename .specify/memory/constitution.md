<!--
Sync Impact Report
- Version change: Unratified template -> 1.0.0
- Modified principles:
  - Template Principle 1 -> I. Security and Explicit Data Boundaries
  - Template Principle 2 -> II. Durable Data and Observable Failures
  - Template Principle 3 -> III. Browser Offline Operation and Resynchronization
  - Template Principle 4 -> IV. Chrome and Safari/WebKit Compatibility
  - Template Principle 5 -> V. Cost-Conscious, Reliable AWS Infrastructure
- Added sections:
  - Product and Engineering Constraints
  - Development Workflow and Quality Gates
- Removed sections: None.
- Templates requiring updates:
  - ✅ updated: .specify/templates/plan-template.md
  - ✅ updated: .specify/templates/spec-template.md
  - ✅ updated: .specify/templates/tasks-template.md
- Runtime guidance reviewed:
  - ✅ README.md (no conflicting guidance)
  - ✅ installed .agents/skills/speckit-*/SKILL.md files (no agent-specific conflicts)
- Follow-up TODOs: None.
-->
# Na'aseh Task Manager Constitution

## Core Principles

### I. Security and Explicit Data Boundaries
Every design, implementation, deployment, and dependency decision MUST follow current
security best practices appropriate to its risk. Authentication and authorization MUST be
enforced at every trust boundary; access MUST follow least privilege; secrets MUST never be
committed or exposed to clients or logs; and sensitive data MUST be protected in transit and
at rest. Every feature MUST identify the data it reads, writes, shares, and retains, along
with the actors permitted to perform each action. Security checks MUST be completed before
work is declared done. Protecting Steve's data and collaborators' data is a
non-negotiable product requirement.

### II. Durable Data and Observable Failures
User tasks and associated data MUST not be silently lost, overwritten, or corrupted. Every
state-changing workflow MUST define persistence, validation, conflict, retry, recovery, and
backup or restoration behavior proportional to its risk. Failures MUST produce actionable
user feedback when user action is relevant. Production application and infrastructure logs
MUST be centralized in Amazon CloudWatch. Logs MUST be structured and detailed enough to
reconstruct significant operations and failures, including safe correlation identifiers,
operation outcomes, timing, and actionable error context. Logs MUST NOT contain secrets,
credentials, session tokens, or protected task content. Retention, indexing, metrics,
alarms, and verbosity MUST balance diagnostic value, security, and cost. Silent failure is
prohibited. Tests MUST cover critical data lifecycle and failure paths because trust in a
task manager depends on durable, explainable state.

### III. Browser Offline Operation and Resynchronization
Na'aseh MUST be web based, highly responsive across supported screen sizes, and usable in a
supported browser when Internet access is unavailable. Internet-connected operation is the
primary mode. Every user-facing feature that reads or changes task data MUST specify and
test its offline behavior. Changes made in the browser while offline MUST be preserved
locally and MUST synchronize when Internet access returns. Connectivity state, pending
changes, synchronization conflicts,
and synchronization failures MUST be visible and MUST NOT cause silent data loss.

### IV. Chrome and Safari/WebKit Compatibility
Supported functionality MUST work in current stable Chrome and Safari/WebKit, including
Safari on supported iPhone and iPad operating-system versions. Feature specifications MUST
identify relevant touch, viewport, storage, installability, background execution, and
browser capability constraints. User-facing changes MUST receive automated browser coverage
with Playwright where the behavior can be meaningfully exercised, using Chromium and WebKit
projects as appropriate. A feature is incomplete if its primary journey fails on any
supported browser class.

### V. Cost-Conscious, Reliable AWS Infrastructure
Production infrastructure MUST run on AWS unless Steve explicitly approves an amendment or
documented feature-level exception. Designs MUST choose the lowest reasonable ongoing cost
that still satisfies security, data integrity, reliability, performance, backup, and
recovery requirements. Plans MUST evaluate managed serverless AWS services before
provisioned or always-on compute and MUST select a serverless design when it satisfies the
requirements at an equal or lower expected total cost. A non-serverless selection MUST
document why serverless alternatives fail the requirements, including limits, latency,
reliability, security, operational burden, and cost. Plans MUST document expected AWS
services, principal cost drivers, scaling assumptions, and a simpler or cheaper alternative
when one exists. Cost savings MUST NOT weaken Principles I-IV. Infrastructure MUST avoid
needless always-on capacity and complexity so that the product remains economical to operate.

## Product and Engineering Constraints

- Steve is the primary user and sole current developer. Task sharing MUST be included in v1,
  although it is not the primary product capability. Every collaborative feature MUST define
  ownership, visibility, invitation, acceptance, revocation, and authorization boundaries
  before implementation.
- Losing user tasks or data, exposing data beyond authorized boundaries, silent failures,
  and unnecessary complexity are prohibited outcomes.
- Solutions MUST favor the simplest architecture that satisfies the current requirements.
  New services, dependencies, abstraction layers, and infrastructure components require a
  concrete present need and documented operational impact.
- Performance requirements MUST be measurable for critical user journeys and MUST include
  realistic mobile and degraded-network conditions when relevant.
- Platform support, security assumptions, offline behavior, and AWS cost impact MUST be
  explicit in feature specifications and implementation plans rather than inferred during
  implementation.

## Development Workflow and Quality Gates

Every change MUST satisfy all applicable gates before it is reported complete:

1. Requirements and design identify data boundaries, collaboration boundaries, failure
   behavior, offline behavior, supported-browser behavior, performance targets, CloudWatch
   observability, and AWS architecture and cost impact where applicable.
2. Automated tests cover changed behavior and regression risk. Unit, integration, contract,
   and Playwright end-to-end tests MUST be included where each provides meaningful coverage.
3. Security, data-loss, and recovery risks are reviewed explicitly. Relevant negative and
   failure-path tests MUST accompany critical state-changing behavior.
4. Chrome and Safari/WebKit compatibility is verified for affected user journeys, including
   an appropriate iPhone- or iPad-sized viewport for responsive changes.
5. Performance is checked against the feature's measurable targets. Infrastructure changes
   MUST review AWS cost impact, serverless alternatives, and CloudWatch logging, retention,
   metrics, and alarm coverage.
6. Code is re-reviewed in its final diff before completion. The review MUST check correctness,
   unnecessary complexity, security, data durability, error handling, logging, test quality,
   platform support, and documentation accuracy.
7. Code comments MUST explain non-obvious intent, invariants, security decisions, data-safety
   constraints, or browser workarounds. Comments MUST remain accurate and MUST NOT merely
   restate the code.
8. User-facing behavior, setup, operations, architecture decisions, and recovery procedures
   MUST be documented at the level needed to maintain and safely operate the change.

Any gate that is not applicable MUST be marked as such with a brief rationale. A failed gate
blocks completion; it cannot be waived silently.

## Governance

This constitution is the highest-authority project guidance. Specifications, plans, tasks,
reviews, and implementation decisions MUST comply with it. When another project document
conflicts with this constitution, this constitution prevails.

Steve is the sole amendment approver. An amendment MUST document its rationale and impact,
update dependent templates and guidance in the same change, and include a migration or risk
plan when existing behavior is affected. Constitution versions follow semantic versioning:
a MAJOR change removes or incompatibly redefines governance or a principle; a MINOR change
adds a principle, section, or materially expanded obligation; and a PATCH change clarifies
wording without changing obligations.

Every feature plan MUST perform a Constitution Check before design work and repeat it after
design. Every completion review MUST verify the Development Workflow and Quality Gates.
Exceptions require Steve's explicit approval, written rationale, bounded scope, identified
risk, and an expiration or follow-up action; Principles I and II cannot be waived for
production data.

**Version**: 1.0.0 | **Ratified**: 2026-07-22 | **Last Amended**: 2026-07-22
