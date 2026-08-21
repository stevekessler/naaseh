# Phase 0 Research: Task Security and Experience Modernization

## 1. Session scope and device binding

**Decision**: Keep the existing 256-bit opaque `__Host-naaseh` session cookie, digest-only server storage, CSRF/origin checks, 30-minute idle expiry, eight-hour absolute expiry, and `sessionEpoch` revocation. Introduce no device-binding negotiation, credential, fallback, or browser-specific branch.

**Rationale**: The clarification deliberately defers the exact W3C DBSC protocol until every required Chrome and Safari/WebKit class supports it. Preserving the current session model prevents a partial security boundary.

**Alternatives considered**: Chrome-only DBSC, a proprietary device key, or a partially authenticated JWT would violate the clarification and expand authentication complexity.

## 2. TOTP enrollment and sign-in

**Decision**: Use a maintained TypeScript RFC 6238 library for SHA-1, six-digit, 30-second TOTP with a ±1 step window, at least 160 random seed bits, and an atomically advanced `lastAcceptedCounter`. After primary credentials, issue a five-minute, 256-bit opaque pre-auth transaction cookie whose digest is stored with purpose, epoch, attempt count, and TTL. Return `202` with `tfa_challenge` or `tfa_enrollment`; issue an ordinary application session only after successful factor verification. Cap a transaction at five failed factor attempts.

**Rationale**: This is compatible with common authenticator apps, prevents replay/concurrent reuse, and avoids adding a partially authorized session state to every authorization check.

**Alternatives considered**: Local cryptographic implementation, SMS/email, JWT challenge claims, and browser-side verification add risk or are out of scope.

## 3. TFA secret, recovery codes, and factor changes

**Decision**: Encrypt each enabled TOTP seed with the existing runtime KMS key and an encryption context `{purpose:"naaseh-totp", userId}`; restrict decrypt to the auth Lambda. Generate ten high-entropy recovery codes, show them once, and store only normalized SHA-256 digests with conditional single-use state. Enrollment confirmation requires TOTP. Disablement and recovery-code rotation require recent password re-verification plus the current factor. Ordinary users may disable TFA; administrators may not while they remain administrators. Factor-state changes increment `sessionEpoch` and establish a fresh session where appropriate.

**Rationale**: Application-layer encryption and single-use digests protect factor material without per-user Secrets Manager cost. Step-up and epoch invalidation prevent a stolen old session from replacing or bypassing a factor.

**Alternatives considered**: DynamoDB encryption at rest alone exposes plaintext to the application record, a new KMS key adds fixed cost without a current boundary gain, and storing encrypted recovery-code plaintext is unnecessary.

## 4. Administrator enforcement and recovery

**Decision**: Treat a missing/disabled factor as `enrollment_required` for administrators and reject every administrator session unless authoritative factor state is enabled. Invalidate pre-rollout administrator sessions at the enforcement boundary. Add a low-concurrency IAM-invoked `AdminTfaRecoveryFunction` available only to a separately authorized recovery identity. It accepts a canonical username, reason, and idempotency token; conditionally removes factor material, changes state to `recovery_required`, increments security versions and `sessionEpoch`, invalidates login transactions, writes immutable audit state, and emits safe metrics. It has no KMS decrypt permission. Require retained CloudTrail Lambda data events (or an AWS_IAM endpoint carrying the principal) before enabling enforcement.

**Rationale**: This provides zero password/PIN-only administrator bypass and reuses the repository's operator/provisioning separation. CloudTrail supplies attribution that direct Lambda payloads cannot safely self-assert.

**Alternatives considered**: Application-admin reset, PIN self-recovery, and manual DynamoDB edits violate the clarified authorization/audit boundary.

## 5. PIN-based password reset

**Decision**: Add an online-only, generic-response reset endpoint accepting canonical username, PIN, and matching valid new passwords. Reuse Argon2id, the Secrets Manager pepper, dummy verification, origin checks, and durable account/source rate limiting. On success, atomically replace the password verifier, increment `credentialVersion` and `sessionEpoch`, invalidate login transactions, and retain TFA and all user data. Use five account attempts and twenty source attempts per fifteen minutes as initial bounded controls, plus scoped WAF protection.

**Rationale**: The existing PIN verifier and revocation epoch meet the requirement without introducing email/SMS infrastructure or leaking account existence.

**Alternatives considered**: Reset links are out of scope; offline queuing would persist secrets; PIN as administrator TFA recovery would collapse the second factor.

## 6. Authoritative user lookup

**Decision**: Convert duplicated `USERNAME#...` user rows into lookup pointers to the authoritative `USER#...` row; username lookup performs a consistent second read. Credential, role, status, factor summary, and epoch changes update only authoritative state transactionally.

**Rationale**: Current full duplicate rows can drift because status updates do not update the username copy. Security decisions must not depend on stale identity data.

**Alternatives considered**: Transacting every mutable field into both copies preserves an unnecessary dual-authority invariant and increases future mutation risk.

## 7. Owner-private synchronized timer

**Decision**: Add one deterministic `TaskTimer` aggregate at `PK=USER#{userId}`, `SK=TIMER#CURRENT`, with immutable revisions and mutation receipts. It references an authorized task but is readable and controllable only by its owner, not collaborators or administrators. Add encrypted Dexie `secureTaskTimers` in schema version 11 plus an encrypted feedback checkpoint; write optimistic state and outbox atomically.

**Rationale**: A deterministic per-user key makes the one-timer invariant structural and reuses owner feeds, mutation receipts, encrypted local persistence, and visible conflicts.

**Alternatives considered**: Timer fields on a shared task leak personal focus state; a timer per task introduces a uniqueness race; local-only state cannot synchronize or recover.

## 8. Timer timekeeping, repeat, and sync

**Decision**: Persist UTC anchors/status, never a decrementing counter. Use monotonic elapsed time while the page lives and canonical anchors plus sync-provided server-time offset after reload/device transfer. Derive repeat interval ordinals arithmetically; do not schedule or persist each passive interval. Identify feedback with `{runId, intervalOrdinal}` and produce completion feedback once per active device and interval, without replaying a backlog. This feedback creates no task `CompletionEvent`; a finished timer interval does not mean the task is complete and never mutates task completion state. A duration change starts a new run at full duration. Extend sync to version 5 with `taskTimer` semantic operations (`start`, `switch`, `pause`, `resume`, `stop`, `restart`, `changeDuration`, `setRepeat`), base-version conditions, stable replay results, and visible reapply/discard conflicts. Explicit `switch` is required when another task is active.

**Rationale**: Timestamp projection survives throttling, suspension, offline use, and ordinary clock correction without per-second or per-interval AWS work. Conservative aggregate conflicts prevent silent command reordering.

**Alternatives considered**: `setInterval` state drifts, wall-clock-only state is fragile, last-write-wins loses offline actions, and EventBridge/WebSockets/Step Functions add cost without improving correctness.

## 9. Modal and searchable references

**Decision**: Replace the editable task-detail aside with a reusable native `TaskEditDialog` opened through `showModal()`, preserving URL/selected-task context and trigger focus. Save editable fields in one versioned task mutation; warn on dirty dismissal and keep lifecycle/delete/attachment actions outside the save transaction. Add one typed `ReferenceCombobox` using Downshift for parent and group selectors. It searches bounded authorized cached options, renders at most 50 matches, stores only selected IDs, supports clear, and never accepts arbitrary input. Parent options exclude self, descendants, inaccessible, and inactive tasks and disambiguate equal labels safely.

**Rationale**: Native modal behavior and a maintained ARIA combobox minimize focus/VoiceOver risk while integrating with the current React form and encrypted task outbox.

**Alternatives considered**: Exact Select2 adds jQuery; `<datalist>` accepts untrusted arbitrary text; hand-rolled ARIA comboboxes and route-only editing add avoidable accessibility/context risk.

## 10. Limited rich-text memo

**Decision**: Add a versioned allowlisted document AST containing paragraphs and flat ordered/unordered lists with text runs marked only bold, italic, or strikethrough. Keep `memo` as the <=20,000-character deterministic plain-text projection for search, copy, fallback, and export. Use lazily loaded Lexical packages with only allowed nodes/commands; normalize paste and render React nodes, never stored HTML or `dangerouslySetInnerHTML`. Store document and projection atomically. Legacy plain text reads as an implicit paragraph and upgrades only on edit. Hidden memo encryption moves to a versioned payload containing both document and text while retaining old ciphertext read compatibility.

**Rationale**: A small domain format preserves meaning through sync/backup/export and sharply limits XSS and schema drift. Lexical supplies maintained React/Safari selection and list behavior.

**Alternatives considered**: HTML requires a lasting sanitizer/XSS boundary, Markdown is not WYSIWYG, and custom `contenteditable` is a large browser/accessibility burden.

## 11. Date-only, timed due values, and browser zone

**Decision**: Represent date-only work with `dueDate` (`YYYY-MM-DD`) and timed work with `dueAt` (UTC instant); enforce mutual exclusivity with `dueKind`. Stop accepting new `dueTimeZone` input but preserve legacy metadata/read compatibility where required by Google and existing rows. Offer closed five-minute local choices and inject the current off-grid value when editing a legacy task; never round on unrelated save. Resolve the current browser zone at render/filter confirmation, convert local components with DST round-trip validation, and send it silently as `browserTimeZone` to the report API. Ignore obsolete saved report time-zone preferences. Render no date node/string for undated tasks.

**Rationale**: Calendar dates and instants have distinct meaning. This retains stored instants across browser-zone changes while making date-only work stable and eliminating user-facing zone controls.

**Alternatives considered**: An instant cannot preserve a date-only meaning; wall time plus user-selected zone contradicts the requirement; `datetime-local step` behaves inconsistently across browsers.

## 12. Ranking and priority

**Decision**: Add current dnd-kit React/DOM pointer and touch handles around existing personal stack rows, translating a valid drop into the established `move(work, destinationPosition)` operation. Keep move-up/down/to-position controls as the canonical keyboard and long-distance fallback; commit only on drop and preserve filtered occupied-slot rules and visible sync/conflict feedback. Add `UrgencyBadge` full and compact modes with distinct fixed SVG shape/glyph plus accessible name. Collapse active urgency to `low|medium|high|critical`.

**Rationale**: Existing ranking already enforces owner-only order, filtered permutations, optimistic queues, and conflicts. Pointer/touch enhancement avoids duplicating that logic and native HTML drag's poor iOS behavior.

**Alternatives considered**: Rewriting ranking risks data loss; native drag lacks reliable touch/accessibility; removing existing controls regresses keyboard operation.

## 13. Extra Low removal

**Decision**: Because neither current user has persisted Extra Low content, run a read-only, fail-closed inventory across active Task/List records, completion/report/workload projections, cached encrypted records, pending mutations, stack snapshots, and restore fixtures. Proceed only when every count is zero, then delete `extra_low` from domain/contracts/imports/filters/reports/exports/UI. Reject any future or restored value. A nonzero result blocks deployment for explicit review and performs no rewrite.

**Rationale**: The value occurs broadly in code but not data. Verification plus deletion is simpler and avoids an unnecessary mutation of user records while retaining a safe stop condition if the assumption is wrong.

**Alternatives considered**: A compatibility backfill is unnecessary when the inventory is zero; deleting without a data guard risks stranding an unexpected record; display-only hiding leaves the active value in contracts and exports.

## 14. Profile, administration, users, groups, and lists

**Decision**: Add `/profile` for personal reminders, sound, Google setup, password, and TFA; retain role-gated `/admin` for users/system configuration; add `/directory` for global reusable-item administration under its existing active-user authorization. Remove these global controls from ordinary list/profile pages. Render users as a semantic paged table with opaque server cursor, 100 rows/page, stable IDs, bounded group summaries, responsive overflow, and accessible row actions. Use `ReferenceCombobox` for all user-facing group selection. Extend the initial list-item form to parse the existing signed amount representation and create name+amount atomically through the current list-item mutation.

**Rationale**: This separates presentation and privilege without silently changing current global-directory permissions, avoids loading 10,000 users, and reuses already-supported amount fields and money parsing.

**Alternatives considered**: Putting personal controls inside admin blocks ordinary users; card DOM fails the table requirement; create-then-patch amount risks partial state.

## 15. Completed-task CSV

**Decision**: Create a versioned, snapshot-consistent completion-export job through the existing Lambda/Step Functions/private S3/KMS workflow. Normalize filters with a browser zone and `asOf`, use idempotency, poll job state, and expose download only after header/row-count/checksum validation. Reauthorize every record/field at export time; all-user mode is a separately confirmed audited administrator action. Emit stable UTF-8 RFC 4180 CSV with CRLF, empty optional cells, deterministic compact JSON for repeated structures, and apostrophe neutralization when the first non-whitespace/control character is `=`, `+`, `-`, or `@`. Export every documented safe task/subtask business field, but never hidden plaintext/cipher packages, revision history, deleted data, credentials, keys, attachment bytes, object keys, or signed URLs.

**Rationale**: The current four-column browser CSV is incomplete, and the existing generic transformer can expose encrypted memo data and lacks formula hardening. Server snapshots prevent partial-looking success and centralize authorization.

**Alternatives considered**: Browser Blob generation cannot guarantee completeness/authorization, synchronous 10,000-row responses risk limits, and unscoped admin export is overbroad.

## 16. Post-it color and validation strategy

**Decision**: Add optional `postItColor` enum `yellow|pink|blue|green|purple|orange`, with rendering precedence task override → category color → yellow. The edit dialog uses labeled radio swatches and saves the override in the same atomic task mutation. No data migration is required. Validate this feature with domain/schema/migration tests; API auth/idempotency/conflict/export tests; Dexie upgrade/outbox preservation; component accessibility; and Chromium/WebKit desktop/iPhone/iPad journeys. Lazy-load rich editor/admin/profile modules. Before changing required browser validation, record test count and `/usr/bin/time -p npm run test:e2e:quick` before and after, then confirm the hosted PR check remains at or below ten minutes.

**Rationale**: A fixed semantic palette prevents arbitrary CSS/contrast problems and preserves existing category behavior. Risk-tiered tests satisfy the constitution without making required validation exhaustive.

**Alternatives considered**: Raw hex values expand validation and accessibility risk; category overwrite changes other tasks; placing the full browser matrix in required quick validation breaches the repository's runtime discipline.
