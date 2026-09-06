# Private Journal UI Contracts

## Routes and navigation

| Route | Contract |
|---|---|
| `/journal` | Owner-only newest-first date list, inclusive start/end filters, no content search |
| `/journal/new` | One-page add form; defaults to current owner-local date |
| `/journal/{entryId}` | One-page read/edit view; concealed not-found for foreign/unknown IDs |
| `/journal/settings` | Two owner-only toggles, both enabled by default |
| `/journal/dashboard` | Seven-day default range, metric-card grid, trend comparison, detail dialog |

All routes lazy-load inside the authenticated application shell. A locked journal route renders only the unlock/enrollment/recovery UI and never a plaintext preview. Logout/session lock clears route-held decrypted state.

## Entry form

- Date is the only required field. A valid empty entry saves.
- A date already represented by the derived date token opens/conflicts with the existing entry instead of creating another.
- Every slider question renders a native `range` and native `number` input bound to one nullable state value, one label, one min/max/step validator, and synchronized accessible value text.
- Empty numeric input means unanswered. Invalid, out-of-range, or off-step input cannot save and receives an inline field error plus summary focus.
- Yes/no questions expose an explicit unanswered state; they never default silently to “no.”
- Suicidal/self-harm and DBT groups are visible only when enabled. Disabling preserves historical ciphertext and hides it on add/read/edit/dashboard.
- Saving sensitive answers performs no risk interpretation, resource display, notification, or sharing.

## Rich text

- Both editors expose labeled buttons for bold, italic, underline, strikethrough, bullets, numbered list, and link.
- Link creation accepts an absolute HTTPS URL only and reports invalid protocols inline.
- Pasted input is normalized to the allowed structural AST; unknown styling, scripts, event attributes, embedded media, and raw HTML are discarded/rejected.
- The editor has no product character counter/limit. If encrypted body size exceeds the safe server envelope, preserve the local encrypted draft, mark it unsynced, and explain that it is too large to synchronize; never truncate.

## Task reflection

- The Downshift combobox receives only the owner's locally authorized open tasks and tasks completed in the prior seven local calendar dates.
- Selection reveals the task-reflection editor. No task is required.
- Clearing a task with non-empty notes requires confirmation; cancel preserves both.
- If the task later becomes inaccessible, show “Task unavailable” without a historical label and keep the encrypted reflection.
- Task association never grants navigation/access beyond the current task authorization check.

## List and filters

- Decrypt projections only after unlock, sort dates descending, and apply inclusive local-date filters in memory.
- Invalid start-after-end keeps the last valid result and focuses an actionable error.
- Empty range shows a clear empty state and clear/change-filter actions.
- Each date is a link to the dedicated entry route with separate read/edit wording as appropriate; there is no keyword/content search control.

## Dashboard

- Default period is the current seven local calendar dates. Native accessible date controls select an inclusive range.
- Cards form a labeled responsive grid/list. Each card is a `<button>` containing metric name, value kind (average/count/days), formatted value or “No data,” and textual trend.
- Color and arrow are supplementary. `up`, `down`, `unchanged`, and `not comparable` have text equivalents and no positive/negative clinical interpretation.
- Sensitive four cards are absent when their group is disabled.
- Activating a card uses `dialog.showModal()`, labels the dialog, lists exactly contributing entry dates as links, closes with Escape/button, and restores focus to the invoking card.
- No prior data yields `not comparable`; no current answered data yields `No data`, never zero.

## Offline, pending, conflicts, and lock

- Local atomic save shows `Saved on this device; sync pending` while offline and `Synced` only after receipt.
- Storage-near-limit failure leaves the prior durable value intact and offers a recovery action.
- Version/date conflicts preserve both ciphertexts and show an owner-only dialog after unlock: keep local, keep remote, or reconcile manually.
- Unsupported schema/key version locks the affected record and preserves ciphertext for upgrade/recovery.
- Tab hiding, unlock timeout, logout, or session revocation removes decrypted form/dashboard/dialog data from the DOM and memory.

## Accessibility and responsive behavior

- All actions are keyboard and touch operable with visible focus, 44×44 CSS-pixel touch targets where practical, zoom-safe layouts, and no color-only meaning.
- Native number/date/range/dialog behavior is verified in current Chrome and Safari/WebKit, including iPhone and iPad viewports, safe-area insets, onscreen keyboard, and orientation changes.
- Live regions announce local saved/pending/synced/conflict states without announcing journal values.
- Metric grid, editors, modal, combobox, validation summary, and unlock flow receive automated axe coverage.
