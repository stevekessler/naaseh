# Finance Experience Expansion Implementation Validation

## Starting point — 2026-10-31 (T001)

Feature: `specs/016-finance-experience-expansion`; actual checkout:
`codex/task-item-creation-uploads`, starting HEAD
`c58fccb4be365fd0b0533a856fc853fcbdde4cc3`.

The checkout contains pre-existing modified/untracked Finance 015, task, search,
security, infrastructure and Apple-client work. Those changes were retained;
feature 016 is not an authorization to reset or replace them. Only the repository
root AGENTS.md applies; no nested agent instruction file was found.

### Reusable baseline

- Finance 015 tasks are checked except T101 (hosted duration evidence) and T103
  (two-user usability). Its implementation-validation report distinguishes
  fixture-only performance from the unmeasured production DynamoDB hydration path.
- Existing domain/contracts cover accounts, manual/provisional/CSV/provider
  transactions, exact money, splits, budgets, catalog entries, reconciliation,
  deletion/reference rules and budget-item-only task links.
- Existing API/import handlers use request-local DynamoFinanceRepository and
  conditional scope commits. `forActor()` hydrates all accessible scope/catalog
  rows before routing; new bounded query/projection work cannot reuse that path
  unchanged at the specified 100k scale.
- Existing browser Finance has account/transaction/catalog/budget subviews and
  encrypted Dexie/outbox. FinanceLandingPage owns local subview state alongside
  incomplete URL routes. Budget choices derive from existing accounts. Existing
  task links return one budget-item link, not the new target union/arrays.
- Private versioned KMS media storage, GuardDuty scan events and attachment
  upload/retention/backup already exist. Current parents are task/listItem, generic
  policy allows 25 MiB/ten files, and downloads issue temporary signed GET URLs.
  Finance receipts require an explicit parent/policy/access/retention branch.
- Existing Finance cache uses the shared device key. There is no separate Finance
  security preference/grant/offline verifier; all normal app read/decrypt paths
  need the new access controller without deleting pending device-encrypted work.

### Required work and dependencies

Foundation must introduce shared spend/refund rules before projections, targeted
reads/units of work, versioned query jobs and compatible sync capabilities. The
source does not yet implement linked refunds, personal dashboard flags, receipt
transaction parents, explicit budget activity, first-class Upcoming Expenses or
many-to-many transaction/upcoming task links. These remain unchecked until actual
implementation and meaningful tests pass.

### Project setup verification

Existing .gitignore covers Node/build/test outputs, environment files, logs,
editor artifacts, Python and Swift outputs. Existing ESLint flat-config ignores
build/dependency/coverage artifacts. Existing .prettierignore excludes generated
outputs and lockfiles. This is a private workspace with no npm publishing step;
no .npmignore is needed. No Dockerfile, Terraform or Helm configuration was found;
no corresponding ignore files were invented. No ignore changes were necessary.

### Baseline validation

Validation is being measured before adding required tests. Results and any
pre-existing failures are recorded in
[finance-experience-validation-runtime.md](finance-experience-validation-runtime.md).
Measurements of unrelated current native work are not feature-016 completion
claims. Live AWS restore, new hosted-runner totals and human usability remain
future evidence gates.

### Setup checkpoint — 2026-10-31

T001–T005 work is complete: inventory, measured validation baseline, deterministic
synthetic fixtures, regional cost forecast and isolated parser dependency audit.
No feature-016 application behavior, required test cases or project dependencies
were added. Baseline validation passed 1,267 tests; the existing quick browser
suite passed 31 tests. Fixture builders were bundled and checked for fresh
instances, valid references, independent spend expectations and local calendar
contexts.

After setup edits, `npm run typecheck`, focused fixture ESLint, formatting of
non-ignored new documents/fixtures and `git diff --check` passed. Project package
manifests/lockfile have no changes from this work. No new required test cases or
workflow changes require an after-expansion runtime measurement yet.

**Setup acceptance is PASS with approval:** the combined forecast is $6.05/month
including the planned 30% contingency. Steve explicitly approved a $6.50/month
combined Finance ceiling on 2026-10-31. See
[the quantity-by-rate forecast](../operations/finance-experience-cost.md).
Foundation implementation may proceed and must repeat performance/cost acceptance
at T018. No extension hooks are configured.
