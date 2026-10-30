# Research: Finance and Budget Management

## Decision 1: Reuse the existing DynamoDB and encrypted Dexie architecture

**Decision**: Store canonical finance state in the existing KMS-encrypted, on-demand DynamoDB table and authorized offline projections in the existing encrypted Dexie database. Use account/date, budget/item, global-catalog, and audience-feed key patterns; do not add MySQL, Aurora, OpenSearch, or another database.

**Rationale**: The required scale is modest, access is naturally partitioned by account, budget, and authorization audience, and current infrastructure already provides conditional transactions, PITR, backup, restore testing, sync feeds, and offline storage. Local authorized aggregation and MiniSearch cover budget totals and search without a server-side analytics store. This adds no fixed database cost, preserves the existing operational model, and is the lowest-risk path to the $5 incremental monthly operating-cost target.

**Alternatives considered**:

- Aurora Serverless v2/MySQL: rejected because it adds a new datastore, connection management, migrations, backup operations, and a minimum ongoing cost without a demonstrated query need.
- Provisioned RDS MySQL/free tier: rejected because free-tier eligibility is temporary and always-on infrastructure conflicts with the cost and simplicity constraints.
- OpenSearch: rejected because household-scale search works locally and a search cluster would materially increase cost and disclosure risk.
- Separate DynamoDB table: rejected because the existing table, backup plan, restore workflow, and GSIs can support the bounded access patterns.

## Decision 2: Use SimpleFIN protocol v2 through a server-side Bridge adapter

**Decision**: Claim and read SimpleFIN Bridge connections only from an isolated server-side adapter. Request `/accounts?version=2`, parse structured `errlist` responses, use one all-account request per connection refresh, keep each requested date range at 90 days or less, and overlap successful refresh cursors by five days. Enforce at most one refresh per connection per hour, honor provider throttling, and never retry authentication or compromised-token failures automatically.

**Rationale**: The current official protocol identifies v2 as a draft supporting connection objects and structured errors. The Bridge developer guide expects no more than 24 requests per day, limits date windows to 90 days, and recommends a five-day overlap. A one-hour cooldown satisfies the published daily ceiling while retaining a user-triggered refresh. Exact source identity plus an overlap makes refreshes retry-safe.

**Alternatives considered**:

- Protocol v1: rejected because v2 provides structured errors and connection identity needed for safe partial-failure reporting.
- Browser-to-Bridge requests: rejected because Access URL credentials would be exposed to browser code, storage, extensions, and network diagnostics.
- Frequent polling: rejected because it conflicts with the Bridge's daily-update purpose and request quota.
- Scheduled refresh in v1: deferred because explicit refresh satisfies the specification with less infrastructure; a future schedule can invoke the same idempotent job.

**Primary sources**:

- SimpleFIN Protocol 2.0 draft: https://www.simplefin.org/protocol.html
- SimpleFIN Bridge developer limits: https://beta-bridge.simplefin.org/info/developers

## Decision 3: Encrypt Access URLs with the existing runtime-secrets KMS key

**Decision**: Validate the one-time setup token and returned Access URL, encrypt the Access URL directly with the existing runtime-secrets customer-managed KMS key and a connection-specific encryption context, and store only ciphertext plus non-secret connection metadata in DynamoDB. Grant decrypt only to the finance import function and encrypt only to the connection handler. Never synchronize, return, or log token or URL material.

**Rationale**: An Access URL contains Basic Auth credentials and must be protected as a secret. Direct KMS encryption keeps plaintext out of shared storage and prevents other table-reading Lambdas from using it. The URL is well below the KMS direct-encryption size limit, cannot be automatically rotated by Na'aseh, and is read infrequently. Reusing the retained runtime-secrets key avoids a new fixed-cost key or per-connection secret.

**Alternatives considered**:

- Secrets Manager per connection: secure but rejected for v1 because it adds $0.40 per secret-month plus calls and offers no automatic rotation benefit for a provider-issued Access URL. Pricing source: https://aws.amazon.com/secrets-manager/pricing/
- Plain DynamoDB attribute protected only by table encryption: rejected because every Lambda with table read access could obtain the credential.
- Browser encryption: rejected because the import Lambda still needs unattended decrypt access and the browser must never receive the Access URL after claim.

## Decision 4: Restrict connection claims to the SimpleFIN Bridge host

**Decision**: Decode setup tokens with strict size limits, require HTTPS on port 443, allow only configured official Bridge hostnames, reject IP literals and user-supplied alternate hosts, disable redirects or revalidate every redirect, apply short connect/read timeouts and response-size limits, and sanitize all provider errors.

**Rationale**: A setup token is a Base64-encoded claim URL. Fetching an arbitrary decoded URL would create a server-side request forgery path into AWS metadata or private networks. The requested integration is specifically SimpleFIN Bridge, so an allowlist is both safer and narrower than attempting to support every possible SimpleFIN server.

**Alternatives considered**:

- Supporting arbitrary SimpleFIN servers: deferred until a separate threat model defines DNS, redirect, and private-network defenses.
- URL syntax validation without host allowlisting: rejected because syntactically valid HTTPS URLs can still target attacker-controlled or private infrastructure.

## Decision 5: Execute refreshes as durable, idempotent asynchronous jobs

**Decision**: The finance API creates an `ImportJob`, acquires a connection-scoped lease, and invokes the finance import Lambda asynchronously. The worker decrypts the Access URL, fetches one bounded provider response, validates it, and writes account, balance, transaction, source-identity, revision, and audience-feed changes in idempotent DynamoDB transactions. It checkpoints counts and partial errors in the job record. Lambda asynchronous failure delivery uses the existing alert topic; users can retry safely after a terminal state.

**Rationale**: Provider latency and a large initial import should not hold an API Gateway request open. A durable job gives immediate progress, supports retry and partial-result visibility, and avoids a new queue or state machine for a single bounded provider call. Conditional source-identity locks and mutation receipts prevent duplicate transactions across retries.

**Alternatives considered**:

- Synchronous API import: rejected because provider latency and import volume can exceed an interactive request budget.
- New SQS queue: rejected for v1 because Lambda async invocation plus a durable job/lease is sufficient at household volume.
- New Step Functions workflow: rejected for routine imports because there is only one bounded external call and one checkpointed write phase; existing Step Functions remain appropriate for large destructive cascades.

## Decision 6: Separate provider-owned fields from user-owned finance state

**Decision**: Treat provider account identity, provider balance snapshots, and provider transaction snapshots as provider-owned. Preserve manual/CSV entry fields in an immutable entry snapshot. Treat friendly names, ownership assignment, merchants, allocations, transfer links, matches, budgets, and task links as user-owned. Refresh may update the provider snapshot but cannot overwrite the entry snapshot or user-owned fields. API effective transaction fields project from the provider snapshot when attached and otherwise from the entry snapshot. When a pending transaction changes identity and cannot be proven equivalent, preserve both and create a review issue instead of merging heuristically.

**Rationale**: This boundary prevents a refresh from erasing classifications or audit history and makes retries deterministic. SimpleFIN guarantees transaction IDs only within an account, so the canonical import identity is connection plus account plus source transaction ID. Ambiguous identity is safer as visible review than automatic data loss.

**Alternatives considered**:

- Whole-record provider replacement: rejected because it destroys user edits.
- Heuristic pending/posting merge by amount and description: allowed only as a review suggestion; automatic merging risks conflating distinct transactions.

## Decision 7: Store money as exact minor units with an explicit currency exponent

**Decision**: Convert supported ISO 4217 numeric strings into safe integer minor units using an explicit exponent stored with the account currency. Require every related balance, transaction, allocation, budget item, and match to use the account/budget currency. Keep different currencies in separate totals. Preserve unsupported custom-currency source metadata but exclude it from budgeting until an explicit conversion/precision design exists.

**Rationale**: Binary floating point is unsuitable for allocation equality and reconciliation. Existing Na'aseh money helpers already use safe integer minor units, and extending them to currency exponents preserves exact arithmetic. The specification explicitly excludes currency conversion.

**Alternatives considered**:

- JavaScript numbers in major units: rejected because rounding can break allocation and reconciliation invariants.
- Decimal library: not needed for the specified ISO-currency scope and would add a dependency.
- Universal fixed two-decimal storage: rejected because ISO currencies do not all use two fraction digits.

## Decision 8: Keep transaction search and budget aggregation local to the authorized cache

**Decision**: Cursor-load account/date pages into encrypted IndexedDB, progressively decrypt visible pages, and build a memory-only MiniSearch index for descriptions, payees, memos, and merchant names. Compute budget/category totals from authorized allocations locally, with optional server validation during reconciliation. Use pagination/virtualized presentation so first content does not wait for all 100,000 records.

**Rationale**: The client already owns offline search and has only authorized audience data. Local computation preserves offline use, avoids a new search/analytics service, and naturally omits inaccessible private-account activity from another group member's totals.

**Alternatives considered**:

- DynamoDB scans for search: rejected for latency, cost, and authorization complexity.
- Persisted plaintext browser index: rejected because copied browser storage could expose protected descriptions.
- Server search cluster: rejected as disproportionate for household scale.

## Decision 9: Reconciliation is allowed only from a complete authorized view

**Decision**: Before reconciling, the server verifies that the actor can access every active account link and transaction allocation contributing to the budget. If any linked account is inaccessible, reconciliation is rejected with an incomplete-view problem. A successful reconciliation writes an immutable snapshot hash, totals by currency/category, actor, timestamp, and source versions; later total-affecting changes mark the budget changed without altering history.

**Rationale**: A group member must not certify totals they cannot see. This preserves the spec's incomplete-total warning and makes reconciliation history meaningful.

**Alternatives considered**:

- Reconcile only the actor's visible subset: rejected because a group-wide reconciled status would be misleading.
- Reveal private account totals to permit reconciliation: rejected because it violates the account boundary.

## Decision 10: Extend audience sync rather than creating a finance-only synchronization system

**Decision**: Add finance entity types to sync contract version 7. Use `OWNER#{userId}` for individual finance, `GROUP#{groupId}` for shared finance, and authenticated `PUBLIC` for global merchant/category identities. Keep `FinancialTaskLink` exclusively on a finance audience. Apply access-control and finance tombstones before upserts on reconnect.

**Rationale**: The existing feed/outbox/conflict machinery already implements offline durability, audience transitions, and revocation. Extending it minimizes divergent behavior and infrastructure.

**Alternatives considered**:

- Finance-specific WebSocket or sync API: rejected as duplicate complexity.
- Embedding finance links in broadly shared task payloads: rejected because task access can exceed finance access.

## Decision 11: Extend current backup, restore, and deletion controls

**Decision**: Include finance rows automatically in the existing table PITR and locked daily backups, add finance invariants to quarterly isolated restore validation, and never contact SimpleFIN from a restore-test environment. Every destructive command begins with an authorization-filtered impact preview. Archive referenced records or replace them with durable audit tombstones; permanently delete only an unreferenced draft or mistake. Reuse the existing resumable deletion workflow for archival/tombstone cascades that exceed one DynamoDB transaction, retaining reconciliation/audit evidence required to explain history.

**Rationale**: Financial classifications and reconciliation cannot be reconstructed solely from a provider. Existing recovery and deletion infrastructure already supplies checkpoints, retries, alarms, and evidence without another service.

**Alternatives considered**:

- Provider re-import as the only recovery mechanism: rejected because it cannot restore user allocations, categories, budgets, matches, or reconciliation history.
- Immediate cascading delete in one request: rejected because account history may exceed transaction and timeout limits.
- Permanent deletion of referenced records: rejected because it can break financial history, reconciliation evidence, task links, and audit meaning.

## Decision 12: Limit required browser validation to one representative journey

**Decision**: Add at most one high-value Chromium journey to `test:e2e:quick`, covering a manual account, split transaction, budget variance, and offline queued edit. Keep SimpleFIN failures, role matrices, 100k performance, and Chromium/WebKit/iPhone/iPad variants in full suites and `validate:pre-aws:browsers`.

**Rationale**: This preserves the repository's ten-minute required-check target while retaining exhaustive release gates. Before and after any required-suite edit, list tests and measure `/usr/bin/time -p npm run test:e2e:quick`; confirm the hosted PR check remains within ten minutes.

**Alternatives considered**:

- Put every finance browser scenario in the quick suite: rejected because it would create avoidable PR latency.
- No required browser coverage: rejected because Finance introduces a new primary navigation and offline workflow.

## Decision 13: Parse CSV locally, preview before commit, and deduplicate by immutable receipts

**Decision**: Support account-specific UTF-8 comma-separated files for manually maintained accounts. A bounded Web Worker uses a small RFC 4180-compatible parser in the finance domain, rejects files over 10 MB or 50,000 data rows, and never sends or retains raw file bytes. The user maps required date and description columns; may map payee and memo; selects one of `YYYY-MM-DD`, `MM/DD/YYYY`, or `M/D/YYYY`; and chooses either one signed amount column or separate nonnegative debit/credit columns. Split-column rows require exactly one nonzero value, with debit converted to a negative amount and credit to positive. Every suspected duplicate is presented sequentially and must be explicitly included or excluded before commit. Accepted rows are submitted in encrypted outbox chunks of at most 100. A SHA-256 digest of normalized file bytes plus account ID identifies an exact file replay, while each committed row has a receipt keyed by batch ID and row ordinal. Value-similar rows from different files are warnings that require user judgment, not automatic deletion.

**Rationale**: Local parsing protects financial files, supports offline preview, and avoids API upload limits. File and row receipts make retries deterministic without collapsing legitimate same-day, same-amount transactions. A blocking duplicate walkthrough and canonical decision digest make every risky row intentional without persisting excluded financial content. The server rechecks against authoritative state at commit and returns newly discovered suspects to review. A preview step makes column and sign errors visible before durable writes. Bounded worker execution prevents large or malformed files from freezing the interface.

**Alternatives considered**:

- Upload and parse raw files in Lambda: rejected because it needlessly transmits and temporarily handles more protected content, complicates offline use, and introduces payload/storage concerns.
- Add a general CSV package: rejected for this bounded format because a focused parser with exhaustive quoted-field, newline, encoding, and malformed-input fixtures avoids another runtime dependency; revisit if the supported dialect expands.
- Deduplicate solely by date, amount, and description: rejected because two legitimate transactions can share those visible values.
- Import every parseable row without preview: rejected because a wrong sign, date format, or column mapping could corrupt a large account history.

## Decision 14: Reconcile provisional transactions conservatively into one canonical record

**Decision**: A manual transaction created on a SimpleFIN-managed account has immutable origin `manual` and reconciliation state `provisional`. During refresh, the import worker may attach a provider identity to that same transaction only when exactly one provisional record and exactly one incoming provider record share account, currency, and signed amount. Compare the manual `transactedAt` UTC calendar date with provider `transactedAt`, falling back to `postedAt`; the dates must be within three days inclusive. Corresponding non-empty payee values or corresponding non-empty description values must be exactly equal after Unicode NFC normalization, Unicode-aware case folding, punctuation-to-space conversion, whitespace collapse, and trim. Cross-field, empty, substring, and fuzzy similarity do not qualify. The existing Na'aseh transaction ID, immutable entry snapshot, and all user-owned fields remain canonical; provider fields are attached as a separate snapshot, the source identity lock points to the existing record, and the state becomes `reconciled`. Missing, multiple, fuzzy-only, or incompatible candidates remain separate and create a review issue with accept, reject, or keep-separate decisions.

If an imported candidate was already inserted, explicit reconcile uses one conditional DynamoDB transaction to validate the provisional, candidate, review, authorization, and identity-lock versions; transfer the provider lock and snapshot to the provisional canonical record; tombstone/alias the candidate; resolve the review; and emit both feed updates. A candidate with its own user-owned allocations or links must enter conflict review rather than merge. Keep-separate persists the exact provisional/provider-identity pair so replay does not recreate the same review.

**Rationale**: Users can record expected activity immediately without later duplication, while uniqueness and text/date checks prevent an amount-only merge from conflating two common purchases. Preserving the existing canonical ID also preserves allocations, transfer links, budget matches, and audit history.

**Alternatives considered**:

- Always insert the SimpleFIN transaction and let users delete the manual record: rejected because it creates duplicate totals and risks losing classifications.
- Merge on amount and date alone: rejected because repeated purchases, subscriptions, and transfers commonly collide.
- Require manual confirmation for every exact match: safe but rejected as unnecessary friction for a unique candidate satisfying all predicates; every automatic reconciliation remains visible and reviewable.
- Change immutable origin from manual to SimpleFIN: rejected because provenance should describe how the canonical record entered Na'aseh, while provider attachment is modeled separately.

## Decision 15: Derive manual account balances from the latest dated snapshot

**Decision**: Treat each accepted manual balance snapshot as authoritative at its effective instant. The displayed current balance is the latest snapshot amount plus accepted transaction amounts whose effective timestamps are strictly later than that snapshot. A transaction at the same instant is already represented by the snapshot and is not added. Accepting a later snapshot moves the baseline without deleting or rewriting older transactions. The server calculates and returns the authoritative balance; clients may calculate an optimistic projection from the same ordered data while offline.

**Rationale**: Recomputing from the original opening balance would double-count historical CSV rows imported after a statement balance was entered. Keeping balances entirely independent of transactions would make routine manual entry misleading. A dated baseline supports statement updates, historical imports, deterministic offline projections, and auditable history.

**Alternatives considered**:

- Recompute from the opening balance and every transaction: rejected because later statement snapshots and backfilled history would double-count activity.
- Never let transactions affect a manual balance: rejected because the displayed balance would immediately become stale after a user records activity.
- Let users choose a balance mode per account: deferred because it adds state and migration complexity without a current requirement.

## Decision 16: Use deterministic performance and two-user acceptance gates

**Decision**: Validate the Finance landing page, merchant view, budget view, and filtered transaction search with 20 measured Chromium iterations using a mid-range mobile profile, 4x CPU slowdown, 10 Mbps bandwidth, and 100 ms latency. Each journey must show useful content within two seconds at p95, and long refreshes must show progress within one second. Separately, two representative users cover individual-owner and group-owner/manager workflows; both must complete the timed account, budget, and CSV journeys and rate freshness, budget status, match state, and reconciliation history as clear.

**Rationale**: A fixed browser profile makes the performance threshold repeatable, while two-user moderated acceptance is proportionate to the household audience and exposes comprehension failures that automation cannot measure.

**Alternatives considered**:

- Component benchmarks only: rejected because they do not prove user-visible latency under browser, CPU, and network constraints.
- Unspecified percentage-based usability sampling: rejected because the v1 audience is too small for meaningful percentages without a fixed participant count.
- Physical-device timing only: rejected as the sole gate because it is difficult to reproduce; physical Chrome/WebKit journeys remain functional release evidence.

## Decision 17: Enforce the cost gate and exclude exports

**Decision**: Target no more than $5 per month in incremental AWS operating cost above Na'aseh's existing baseline at the reference household scale. Estimate development, migration, restore-test, and unusual one-time costs separately. If the normal forecast exceeds $5, flag the cost drivers and lower-cost alternatives and obtain Steve's explicit approval before implementation or release. Do not expose any Finance export API, UI, or sync operation in v1.

**Rationale**: Reusing on-demand infrastructure keeps routine cost bounded and avoids creating a new high-risk financial-data egress surface. An explicit approval gate permits a justified exception without silently weakening security, durability, or recovery.

**Alternatives considered**:

- A higher unreviewed monthly ceiling: rejected because it does not match the approved household-use target.
- Relying on temporary free tiers: rejected because they are not a durable architecture or cost guarantee.
- Adding CSV or generic Finance exports in v1: deferred to a separate specification with its own authorization, privacy, audit, and retention analysis.

## Decision 18: Require complete account identity before creation

**Decision**: Require a non-empty organization name and source account name before any manual or SimpleFIN account is created. Default the friendly name to `organization - source account`; friendly names need not be unique and remain editable. If SimpleFIN omits either required name, pause creation and transaction import for that account until the user supplies the missing information.

**Rationale**: Requiring both human-recognizable values avoids ambiguous or misleading account labels while preserving an editable deterministic default. Explicit user completion is safer than inventing provider data.

**Alternatives considered**:

- Use a masked provider/account identifier: rejected because identifiers can create unnecessary disclosure and are not meaningful account names.
- Generate a type-based or single-field fallback: rejected because the approved requirement does not permit creating an account without both organization and account names.
- Add numeric suffixes automatically: rejected because uniqueness is not required and silent renaming is confusing.
