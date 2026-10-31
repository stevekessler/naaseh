# Phase 0 Research: Finance Experience Expansion

Date: 2026-10-31; refreshed after the four accepted clarifications. Inputs: [spec.md](spec.md), the project constitution, feature 015, and current working-tree source. Existing uncommitted Finance code is a dependency, not a delivered baseline. Research agents inspected security/files and Finance/tasks separately; findings below are consolidated design decisions. No application code or infrastructure was changed.

## 1. Extend the current monorepo

**Decision:** Reuse TypeScript 5.8.3, React 19.2.8, Node 24 tooling, Node 22 Lambda, Zod 4.6.7, Dexie 4.0.11, MiniSearch 7.1.2, AWS SDK/CDK, Vitest and Playwright. Keep invariants in `packages/domain/src/finance`, contracts in `packages/contracts/src/finance.ts`, services in `apps/api/src/finance`, and UI in `apps/web/src/features/finance`. Use a browser Worker for progressive search/aggregation and an accessible SVG line graph with a table equivalent; no chart dependency is necessary for three simple period modes.

**Rationale:** All domain and platform boundaries already exist. The old Finance plan's Zod 3 statement is stale; the installed manifest uses Zod 4. Native Finance UI remains out of scope, while shared sync contracts require compatibility validation.

**Alternatives considered:** A new framework, SQL database, analytics/search service, chart package, or native feature adds operating and migration cost without a demonstrated need.

## 2. Authoritative routes and actual group memberships

**Decision:** Replace FinanceLandingPage's separate subview state with the existing app router. Add distinct dashboard/new-account/categories/receipts/reports/upcoming/detail routes. Transaction URLs represent modal routes with a background destination and a Transactions fallback. Use `listLocalGroups()` and current active memberships for named group selectors; server-side membership validation remains authoritative. Allow an empty-account budget. Ordinary confirmed budget creation sets existing lifecycle status active and a separate `activity: active|inactive` field active. Add versioned deactivate/reactivate actions that preserve history, links, dashboard flags and separate closure/archive state; use `closedAt` for independent close/reopen. Existing draft records remain drafts during migration, with an explicit Save as active action through versioned budget update rather than silent promotion. New/reassigned upcoming expenses require active/open budgets; deactivation does not block management of existing associations.

**Evidence:** `apps/web/src/app/router.tsx`, `features/finance/FinanceLandingPage.tsx`, `features/finance/budgets/FinanceBudgetsPage.tsx`, `db/group-repository.ts`, `apps/api/src/groups/handlers.ts`, `packages/domain/src/finance/budget.ts`. The current group selector derives IDs from Finance accounts, and BudgetStatus has no closed state.

**Alternatives considered:** Continuing local navigation state breaks direct links/history. Inferring groups from accounts perpetuates the reported save defect. Treating reconciliation as closure contradicts the specification.

## 3. Personal Finance access gate

**Decision:** Own enrollment/change/reset/disable and online unlock in the existing auth Lambda, which already holds password-pepper access. Add a separate self-only Finance security record and monotonically increasing revision. Do not reuse `StoredUser.pinHash` (password recovery) or Journal key wraps. Verify the current password against the canonical user's correct pepper version for each management operation. Use existing Argon2id primitives with fresh salts; calibrate verification cost using the existing calibration workflow. Finance services receive a random opaque grant, bound to user, device session, session epoch, tab nonce, and Finance revision; no password/pepper is added to Finance Lambda permissions. Grants remain memory-only and are checked against canonical security/session state at every protected read/write, including generic sync, attachments, and tasks. Authorizer caching must not retain a stale Finance grant decision.

**Rationale:** `apps/api/src/auth/password.ts`, `password-reset-service.ts`, `rate-limit.ts`, and `apps/web/src/crypto/pin-kdf.worker.ts` supply reusable primitives. Password reset already advances sessionEpoch. Admin password reset must preserve the separate Finance record. No target-user PIN-management route is introduced. Finance throttling is separate: the existing fifth-failure delay is less than 30 seconds, so its policy cannot be reused unchanged.

**Offline decision:** Preserve existing device-key encryption for cached Finance and pending work. Provision a separately salted worker-derived PIN verifier/wrapped verification secret only after a successful online enrollment/unlock. All app decrypt/read paths go through a Finance access controller; offline unlock authorizes only local access and cannot mint a server grant. Persist failure count/delay per user/device; after five failures delay at least 30 seconds, then double up to a 30-minute cap. Missing verifier or a known epoch/revision mismatch fails closed. A forgotten-PIN reset updates the verifier on the next successful online unlock without destroying unsynchronized device-key-encrypted data. Do not clear the shared device key, which also protects unrelated data.

**Threat boundary:** This is an application access gate, not Journal-style end-to-end encryption or protection against malicious code already running in the origin/local browser profile. Device encryption is not derived from the Finance PIN; deleting local state cannot turn protected Finance off. Remote resets/revocation cannot reach a disconnected device; reconnect checks epoch/revision and revocations before any new Finance hydration/replay. Already downloaded originals cannot be recalled. These are the existing offline/access boundaries, not an administrative PIN bypass.

**Alternatives considered:** A UI-only prompt with unguarded decrypt helpers fails normal app entry paths. Reusing Journal PIN changes its recovery promise. Re-encrypting all cached data under a forgotten PIN risks pending-data loss and requires an unnecessary new recovery service. Letting Finance read password peppers broadens trust.

## 4. Manual transactions and first-class upcoming expenses

**Decision:** Expose existing manual transaction creation on every editable account, including SimpleFIN. Preserve manual snapshot accounting and provisional/provider reconciliation. Introduce a distinct UpcomingExpense with required date, account, budget, and group plus description/positive expected amount. Dashboard consumes those records. Optional references to existing planned items identify one obligation; text/amount similarity never silently merges obligations. Use explicit positive fulfillment amounts referencing canonical transactions, with a transaction-level claim ledger to prevent double use. Pending/provisional fulfillment is visible but does not count paid. Task completion never changes financial state. Capture immutable `entryContext:{enteredAt,localDate,timeZone}` when the browser confirms an expense; dueDate must be after that original localDate, not after server/reconnect today. Late synchronization accepts the otherwise valid original date as overdue. Retries preserve creation context and mutation identity; explicit rescheduling records a separate date-change context without overwriting original entry history.

**Evidence:** `packages/domain/src/finance/transaction.ts`, `provider-reconciliation.ts`, `balance.ts`, `budget.ts`, `reusable-item.ts`; `apps/api/src/finance/transaction-service.ts`. Existing future transactions are observations or provisional records, not a sufficient Upcoming Expense lifecycle.

**Alternatives considered:** Using future transaction dates for the dashboard confuses expected, posted, pending and provisional money. Automatically turning all budget items into expenses risks duplicate obligations. Automatic task-completion payment invents financial facts.

## 4a. Linked expense refunds and shared spending rules

**Decision:** Add ExpenseRefundRelationship from one credit transaction to one original expense, with linked amount, currency, explicitly confirmed original-allocation amounts/classification snapshots, source revisions, active/removed history, and credit/original-allocation capacity versions. Several partial refunds may reference one original. Same-currency cross-account refunds are allowed when both sources are accessible. Link/edit/remove requires refund edit permission plus independent original/association read permission; no original edit permission is invented merely for capacity bookkeeping. An inaccessible original or classification cannot be exposed by a relationship, feed, report fact, or default selector.

**Conservation:** Link only positive credit amounts to a valid expense, never to self, another refund, income or an internal transfer. Confirmed allocation amounts sum exactly to linked amount and cannot exceed either the remaining credit amount or the original allocation's remaining refundable principal across accepted claims. An unallocated original has an explicitly unclassified slice, not a fabricated category/budget. Extra credit remains unchanged/unlinked and is not silently erased or counted as a refund. Negative spending remains possible when a valid refund arrives in a later period than the purchase. Capacity locks, immutable snapshots and idempotency receipts prevent duplicate refund offsets. Partial split refunds require explicit allocation confirmation, not silent proration. Original recategorization does not automatically rewrite confirmed refund history; corrections are explicit and versioned.

**Posting and corrections:** Only posted valid linked amounts contribute negative spending, on the refund's own received transaction date/account/merchant. Pending/provisional links are proposals with zero current contribution. Remove/correct reverses prior contributions exactly once. User edits that violate capacity are rejected with a relationship conflict; provider corrections are retained, incompatible relationships move to review and stale/exactness flags update until explicit resolution. Canonical identity reconciliation retains links and capacity claims for both original and refund.

**Shared predicate ownership:** Implement pure `packages/domain/src/finance/spend.ts` eligibility, contribution slices, same-allocation scope matching and exact currency sums in Foundation before facts, budget widgets, trends, reports or Workers consume them. Inputs include validated canonical transactions, transfer/refund state, classification snapshots and authorized scope. Existing `budget-totals.ts` currently lacks pending/provisional fields; adapt its dashboard spending path to shared predicates while preserving historical reconciliation semantics explicitly. Index rebuild/restore checks use the same rules and independent expected fixtures. US8 owns calendar presentation/bucketing, not a competing spending definition.

**Rationale:** The accepted refund choice needs an authoritative relationship, not guesses from positive credits or descriptions. Shared rules avoid different refund/transfer/pending results in projections, budget percent-used, charts, reports and offline calculations.

**Alternatives considered:** Treating every credit as a refund mixes ordinary income into expense offsets. Silently copying all split classifications onto every partial refund duplicates money. Independently implementing spending predicates in later graph/report stories risks divergent financial truth.

## 5. Finance/task links and intersection authorization

**Decision:** Generalize FinancialTaskLink to a versioned target union (`budgetItem`, `transaction`, `upcomingExpense`); maintain adapters for legacy links. Use a unique task/target relationship and forward/reverse lookups. All link reads return arrays and check both task access and the underlying Finance access intersection. Batch visible task IDs rather than decrypting every Finance record for each row. Task create/edit gets the same selector; Finance Add Task opens normal task fields with a generic title and selected relationship. Do not copy merchant names, amounts, or dates into ordinary task payloads automatically. Optional Upcoming Expenses column/post-it detail defaults off.

**Evidence:** `packages/domain/src/finance/task-link.ts`, `apps/api/src/finance/task-link-service.ts`, `apps/web/src/features/tasks/FinancialTaskLink.tsx`, `TaskColumnSettings.tsx`, `features/finance/budgets/CreateFinancialTask.tsx`. Existing links are budget-item-only, first-match retrieval loses multiple links, and the existing task shortcut copies protected descriptions.

**Audience decision:** Upcoming expenses tied to a personal account and group budget require group + account + budget authorization. Store canonical scope relationships; distribute sensitive projection events to currently eligible owner audiences, not blanket GROUP feeds. Membership/account reassignment triggers tombstones and recalculation. Link metadata never rides ordinary shared task payloads or export/notification/search projections.

**Alternatives considered:** Shared task fields and group-only link feeds reveal private-account associations. A shared dashboard boolean on a global merchant/category changes everyone's display.

## 6. Receipt storage, checking, and access

**Decision:** Extend the existing attachment lifecycle with an explicit `financeTransaction` parent, a separate receipt file policy (1–10,000,000 bytes; specified eight extensions; no inherited ten-file cap), Finance authorization, and Finance-specific retention. Reuse the existing versioned KMS-encrypted media bucket, GuardDuty scan events, attachment reconciliation, backups, and cleanup. Upload bytes directly using existing signed PUT sessions; complete only against exact checksum, size and S3 version. Use the existing scan Lambda plus a bounded receipt content-policy check. Both malware-clean and policy-clean for the same version are required before available.

**Content checks:** Validate actual PDF/JPEG/PNG signatures/structure and Office OOXML ZIP or legacy OLE structure, not just MIME. Inspect Office package/compound streams for macros, embedded active payloads and encryption; reject unsafe, encrypted/uninspectable, malformed, mismatched, or over-limit expanded content. Cap decompressed inspection at 50 MB, 1,000 ZIP entries, nesting depth 2, and a five-second checker budget; limits fail closed with a clear reason. PDF active actions/scripts/embedded payloads are rejected. Do not render Office documents or execute any document content; offer original download only after checks. Choose a maintained bounded OOXML/CFB inspection library during implementation with license/runtime audit; no custom full Office parser is planned. Clean malware scan alone is not a format or active-content check.

**Transfer decision:** Existing `attachments/download-service.ts` returns a transferable 60-second S3 GET URL. Receipts instead use same-origin authenticated single-Range responses of at most 1 MiB raw bytes, checked per request against current Finance grant, transaction authorization, and clean exact object version. The browser assembles at most 10 MB, checks the original SHA-256, and creates a short-lived Blob for preview/save. Every request pins the same ETag/version and denies redirects/public GET grants. The generic attachment route dispatches Finance parents to the protected handler or denies them; otherwise it would bypass the new path. This fits the buffered Lambda response limit, including base64 overhead. Clear Blob URLs, workers, decrypted metadata and local display state on lock. Offline receipt bytes are optional encrypted local cache and subject to known revocation/freshness limits.

**Evidence:** `apps/api/src/attachments/{file-policy,upload-service,completion-service,download-service,attachment-audience,attachment-authorization,scan-result-handler,retention-service}.ts`, `infra/lib/media-stack.ts`, `infra/lib/api-stack.ts`, `apps/web/src/features/attachments/attachment-client.ts`. Current completion checks HEAD metadata, not actual format; existing parent types are task/listItem and retention follows task completion. Receipts must not inherit that purge rule.

**Alternatives considered:** Bare presigned GETs remain usable after a Finance lock until expiration. A whole 10 MB buffered Lambda response exceeds its supported payload. Adding a streaming function/edge auth service is unnecessary for household files when bounded ranges work. A separate bucket/scanner/Office rendering service duplicates existing infrastructure.

## 7. Bounded reads, exact totals, and progressive reports

**Decision:** Add purpose-specific read repositories and projection rows; do not use request-wide FinanceMemoryRepository hydration for new pages. Query accounts/dates/targets with stable cursors, default 50/max 200 results, and a maximum of 1,000 examined fact rows per request. Add compact expense facts carrying account, transaction identity, posted local-date basis, currency, merchant, normalized search text/check-number/amount fields, and allocation details with historical category paths and validated refund relationship revisions. Reuse the Foundation shared spending predicates for every contribution. Index account/date and inverted budget/category/merchant fact references using existing table key patterns; use account-scoped normalized token/prefix, exact-check and amount postings for transaction search probes. Match server and local Worker text semantics through the same parser; simple punctuation/case normalization must not silently omit accessible candidates. No new GSI or database is necessary initially. Each optional posting index is included in the cost and backfill estimate, with the performance gate deciding whether further selective postings are necessary. Query the narrowest authorized dimension, apply the remaining predicates to the same allocation, and continue with bounded cursors. Deduplicate transaction and receipt identities across selected dimensions. Exact result totals never derive from only the displayed page.

**Write/read model:** Contributions keyed by canonical transaction ID + version reverse prior posted contributions and add current ones, including account/currency/month summaries. Conditional writes update canonical state, affected contribution rows, summaries and feed records atomically where bounded. For larger changes use a checkpointed idempotent projection rebuild, mark `complete=false`, and retain last-known totals labeled stale until its revision catches up. Never publish two revisions as if they were a complete sum. Refund/transfer/pending/provisional state and allocation intersection semantics follow FR-040–FR-042. Each projection read rechecks source account/group authorization; a global merchant identity is not authorization for its facts.

**Cold vs warm:** Warm authorized local records use a memory-only Worker index and exact totals only for complete selected coverage. Cold and warm list/report requests must yield actual matching rows or a definitive full-scope empty state at p95 within two seconds; progress, placeholders and empty intermediate pages do not qualify. Connected transaction lists and Spend reports must finish exact counts/totals at p95 within ten seconds under the same 20-run mobile profile, with progress within one second. Row readiness and aggregate readiness are independent contract states; count/total calculation continues automatically rather than waiting for a user to page through results. Use selective indexed probes/cardinality hints for sparse/empty filters, exact common summaries, and a bounded parallel query coordinator (at most five account/dimension partitions at once, each read step examining at most 1,000 fact rows). Reuse the existing Finance function's bounded asynchronous invocation for longer aggregate steps with idempotent query jobs/checkpoints; do not force 100 network round trips through the browser for a 100k scope. Persist only owner-scoped job cursors/results under short retention and recheck source access/grant before delivering results; background computation has no power to return content to a locked client. Each job pins a version vector/revision for its selected account and refund-source scopes; changed source/permission revisions invalidate the job and prevent false exactness. Never add raw source data or credentials to an async invocation. Benchmark cold unselective, sparse and zero-match cases as well as ordinary populated cases. Either deadline failing blocks Foundation acceptance until the read/index strategy is improved within the cost gate; no progress-only exemption or slower unbounded completion promise remains.

**Evidence:** `apps/api/src/finance/dynamo-repository.ts` currently hydrates catalog/all scope rows in 200-row pages and individually fetches related tasks; pagination of the final HTTP array does not bound storage reads. `repository.ts` defines indexes but does not eliminate that hydration. `apps/web/src/search/finance-index.ts` progressively indexes on the main context today.

**Alternatives considered:** Full scans/hydration per click fail latency/cost goals. Precomputing all filter combinations explodes write/storage volume. SQL/OpenSearch adds fixed operating cost. Limited compact facts plus common summaries is the simpler starting design, with explicit performance release evidence.

## 8. SimpleFIN application setup

**Decision:** No new Admin SimpleFIN Setup page is necessary for the current integration. Keep per-owner/group claims and refresh under Finance. Deployment allowlist/import-function settings remain deployment configuration, not editable global credential fields.

**Evidence:** `apps/api/src/finance/handler.ts` and `connection-service.ts` use per-connection setup tokens; `NAASEH_SIMPLEFIN_ALLOWED_HOSTS` is a deployment allowlist, not a global SimpleFIN registration. No application-wide credential requirement exists in the inspected code.

**Alternatives considered:** Inventing an application-wide secret or requiring ordinary users to become administrators misreads the conditional requirement. Revisit only if the provider integration introduces a real shared setup prerequisite.

## 9. Cost envelope and operational limits

**Decision:** Reuse existing on-demand AWS services, with no provisioned capacity, new database, always-on process, new bucket, or dedicated Office renderer. Add request-driven functions only if existing attachment/auth function isolation cannot satisfy least privilege; the baseline design extends the existing functions. Keep the inherited total Finance envelope at $5/month above the pre-Finance baseline, including feature 015.

Planning workload: five active household users; 50 accounts; 100k retained transactions; 20 active budgets; 1,000 active upcoming expenses; 5,000 receipt metadata rows; **2,000 retained files averaging 0.5 MB = 1 GB originals**, 200 new files/month = 0.1 GB scanned/month; 1,000 receipt views/downloads/month averaging 0.5 MB; 10k page/query actions/month; at most 0.1 GB new application logs/month; quarterly restore tests reported separately. Metadata performance ceiling does not assume every receipt remains at its maximum byte size. Allow 3× original-byte retained storage for versions/backups as a conservative planning input, then measure actual backup policy growth. Never expire referenced originals merely to meet a cost target.

| Planning allocation (not an AWS price quote) | Monthly USD allowance |
| --- | ---: |
| Existing Finance 015 compute, reads/writes, KMS, logs, backup growth | 2.50 |
| Receipt originals/versions/backup allowance | 0.30 |
| Receipt checking, GuardDuty/object request allowance | 0.15 |
| Range transfer/API/Lambda/KMS/egress allowance | 0.25 |
| New fact projections, personal settings, PIN work, logs/alarms allowance | 0.30 |
| 30% contingency on the $3.50 subtotal | 1.05 |
| **Combined planning envelope** | **4.55** |

This is an assumption-based forecast/budget allocation, not measured billing or a claim that existing Finance already costs $2.50. Before implementation foundation is accepted, price all quantities in the deployment region (`us-west-2`) using current AWS rates and the actual existing Finance cost estimate; recompute before release. Include GuardDuty object evaluations plus bytes, separate S3 calls/tags/KMS, storage versions/backups, projection write amplification, alarms, CloudWatch ingestion, and internet transfer; do not subtract free tiers to claim permanent viability. A forecast over $5 requires Steve's explicit approval before proceeding with higher-cost implementation or release. Alarm/dashboard spend visibility must show combined Finance costs. Sustained growth beyond these assumptions triggers reforecast, not automatic data deletion.

**Alternatives considered:** A separate scan platform, third-party Office preview, per-connection secrets subscription, search cluster, or provisioned SQL database adds unnecessary baseline cost. Removing safety checks to save scan cost is rejected.

### Implementation reforecast — 2026-10-31 (T004)

The $4.55 allocation above is superseded by the current Oregon quantity-by-rate
forecast in [finance-experience-cost.md](../../docs/operations/finance-experience-cost.md).
The existing 015 report estimated $3.98 including contingency, rather than $2.50.
Repricing the combined workload and retaining this plan's 30% contingency gives
**$6.05/month**. Even using the earlier smaller observability allowance gives
$5.40. Steve explicitly approved a **$6.50/month combined Finance ceiling** on 2026-10-31 in the implementation conversation. Foundation may proceed; T018 and release must reforecast against that ceiling. The previous $5 threshold below is historical.

## 10. Validation allocation

**Decision:** Preserve the current 15-minute hosted timeout as safety headroom and the ten-minute target. The quick configuration selects 20 Chromium spec files including finance-quick.spec.ts, which is not a test-case count. Before any required-suite expansion, record actual discovered case counts and before/after `/usr/bin/time -p npm run test:e2e:quick`, plus affected required unit/integration command durations and hosted total. Do not run or alter the required suite solely to author this plan. Use high-value journeys for quick coverage and keep exhaustive browser/device/failure/performance cases in full/local release gates. Planning does not claim implementation validation passed.

## 11. Receipt container dependency audit — 2026-10-31 (T005)

Select exact `yauzl@3.4.0` for OOXML ZIP enumeration and `cfb@1.2.2` for legacy
OLE streams. These are container readers, not Office renderers or complete
document safety checkers. Adopt only at the receipt dependency task after the
cost gate permits continuation.

| Package | License | Declared Node support | Resolved runtime dependencies |
| --- | --- | --- | --- |
| yauzl 3.4.0 | MIT | >=12 | pend 1.2.0 (MIT) |
| cfb 1.2.2 | Apache-2.0 | >=0.8 | adler-32 1.3.1, crc-32 1.2.2 (Apache-2.0) |

Reviewed npm metadata, distributed source/README and license fields. A temporary
exact-version install outside the repository used `--ignore-scripts`;
`npm audit --json` reported zero known vulnerabilities. That result is advisory
evidence, not proof of hostile-file safety. Neither package declares an install
lifecycle script. Include applicable notices when distributed. Node 24.18.0
loaded both; a synthetic CFB stream round-trip and ZIP API smoke check passed.
Node 22 Lambda bundling and hostile-file tests remain unverified receipt gates.
No application manifest or project lockfile changed.

Registry integrity values:

```text
yauzl@3.4.0 sha512-jIH9yLR9wqr0wOS0TpBvo/g/2UgZH5qePVbjgRliiF0BYvOZyaBknKsF+x9Iht0O6sqgnB93rCICdOZFecJuDw==
cfb@1.2.2 sha512-KfdUZsSOw19/ObEWasvBP/Ac4reZvAGauZhs6S/gqNhXhI7cKwvlH7ulj+dOEYnca4bm4SGo8C1bTAQvnTjgQA==
```

Required wrapper constraints after source review:

- Use yauzl `lazyEntries`, `validateEntrySizes`, `strictFileNames`; independently
  count streamed expanded bytes/entries. Reject encryption, ambiguous duplicate
  paths, traversal, malformed structures and extension/content mismatches. Check
  OOXML content types/relationships and reject VBA, embedded OLE/package/ActiveX
  and active external relationships. Share the 50 MB, 1,000-entry and depth-two
  limits across nested containers.
- Validate the exact CFB signature before `read({type:'buffer'})`; its ZIP/MHTML
  auto-detection must not become a format bypass. The parser is synchronous and
  allocates streams before enumeration. Use a terminable worker with a five-second
  deadline, bounded input/heap and stream/entry limits. An event-loop timer alone
  cannot interrupt synchronous parsing. Fail closed on worker exit/OOM.
- CFB enumeration alone cannot prove a document safe or unencrypted. Inspect Word
  FIB encryption flags, Excel BIFF FILEPASS, encrypted-package streams, VBA
  storages and embedded/active content using upstream format specifications.
  Reject unsupported variants as uninspectable. Test hostile cases before clean
  publication; do not write a full Office parser.
- Keep PDF/JPEG/PNG signature/structure and active-PDF checks separate. Require
  both format acceptance and GuardDuty exact-version clean status. Never execute
  document contents. Re-audit dependencies at adoption and release.

Alternatives: eager JSZip expansion is less suited to streamed byte limits;
full spreadsheet parsing or LibreOffice rendering expands scope/resources;
hand-written ZIP/CFB parsing adds format risk. Older CFB code requires isolation
and adversarial tests despite the clean advisory report.

Primary APIs/source: [yauzl](https://github.com/thejoshwolfe/yauzl) and
[SheetJS CFB](https://github.com/SheetJS/js-cfb).

## External primary references checked

- [AWS Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html): buffered synchronous request/response payload cap informs bounded receipt chunks.
- [S3 presigned URL semantics](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html): expiry is not a per-request application permission check; receipt reads therefore do not expose signed GETs.
- [GuardDuty Malware Protection for S3](https://docs.aws.amazon.com/guardduty/latest/ug/gdu-malware-protection-s3.html): existing upload/event scanning can be extended without a custom malware service.
- [GuardDuty pricing](https://aws.amazon.com/guardduty/pricing/): object-evaluation and scanned-byte dimensions both matter; published example rates must not be substituted for the deployment-region quote.
- [S3 pricing](https://aws.amazon.com/s3/pricing/): regional storage, request, transfer and related service costs must be repriced at implementation. Automated page retrieval was unavailable during research; no exact regional S3 rate is asserted here.

The accepted clarifications now have explicit budget activity, refund relationship, original offline calendar context and separate 2s-results/10s-exact-totals decisions. All design unknowns are resolved into decisions or explicit measurable implementation/release gates. No product clarification is required to begin task generation.
