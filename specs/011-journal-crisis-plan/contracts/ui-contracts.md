# Journal Crisis Plan UI Contracts

## Routes and navigation

| Route | Contract |
|---|---|
| `/journal` | Existing Journal main page; authenticated navigation includes `Journal` |
| `/journal/crisis-plans` | `Crisis Plans` tab with owner plan/create state and online shared-plan section |
| `/journal/crisis-plans/shared/{planId}` | Active-recipient online-only read view; concealed unavailable state otherwise |
| `/journal/new` | Existing entry form, gated by a valid owner plan |
| `/journal/{entryId}` | Existing read/edit form with triggered current-plan region |

Routes lazy-load in the authenticated shell. Journal lock/enrollment from feature 010 remains the outer boundary. Logout, session invalidation, journal lock, tab hiding, or owner change removes decrypted owner content. Recipient route leave/tab hiding/offline additionally destroys the one-use open key and shared content.

## Journal main navigation

- `Journal` is a first-level authenticated navigation item.
- Journal subnavigation includes a tab/link labeled exactly `Crisis Plans`.
- Current-route state is conveyed semantically and not by color alone.
- At supported phone widths, the tab remains reachable without horizontal page overflow and respects safe-area insets.

## Crisis Plans tab

The tab contains two clearly separated regions:

1. **My crisis plan**: create prompt, locked state, editor, save/pending/conflict status, and share manager for the owner.
2. **Shared with me**: online live list of plans shared directly to the user, identified by owner display name and read-only state.

Offline behavior:

- Owner region remains available after journal unlock using encrypted local ciphertext.
- Shared-with-me region removes all summaries/content from memory and shows “Connect to view shared crisis plans.”
- Do not show stale recipient content, an offline preview, or a cached owner name list.

Loading, empty, failure, conflict, pending, rekey-required, and online-required states are distinct and announced without plan content.

## Owner create/edit contract

- Exactly one labeled WYSIWYG field is presented for the crisis plan.
- Toolbar supports bold, italic, underline, strikethrough, bulleted list, numbered list, and HTTPS link using the feature-010 Lexical allowlist.
- Editor is keyboard/touch/assistive-technology usable and retains visible focus through toolbar interaction.
- Empty or formatting-only normalized content cannot save; focus moves to an actionable inline error/summary.
- Unsafe pasted HTML, scripts, event attributes, embedded media, unknown nodes, and unsafe links are removed/rejected; content is never executed.
- Save distinguishes `Saved on this device; sync pending` from `Synced`.
- No delete action exists. A replace-all edit is allowed only when resulting content remains valid.
- Failed save preserves last acknowledged plan and encrypted draft.
- Version conflict shows owner-only local/remote/manual reconciliation after unlock.

## Entry prerequisite contract

- Every new-entry route checks current owner plan state before rendering the entry editor.
- No valid plan: show why it is required and a primary action to create it; retain intended return route.
- Initial valid local offline save permits local entry composition only after the plan/outbox transaction commits; sync UI explains both are pending.
- Server `crisisPlanRequired` rejection preserves entry draft and returns to plan creation/retry.
- Legacy users may open/edit existing entries but see the plan requirement before creating another.

## Triggered display contract

- Observe the current visible `Suicidal behaviors` and `Self-harm behaviors` form values.
- If either is `yes`, immediately render the owner's current plan inline in a prominent region labeled `Your crisis plan`.
- Keep it visible while either remains `yes`; hide the triggered region when both are `no`/unanswered.
- Reopening a saved entry with either `yes` displays the current plan, not a historical snapshot.
- Do not auto-save, clear/move form values, steal focus, announce plan text through a live region, open a modal, send a notification, alter sharing, or imply clinical monitoring.
- If the owner plan cannot decrypt/load, keep the entry draft and show prominent `Retry` and `Open Crisis Plans` actions with no plaintext in the error.

## Owner share manager

- Available only when the owner plan is synced/current and journal is unlocked online.
- The shareable-user combobox uses Select2 through a React lifecycle adapter, searches active users after a trimmed query, returns at most 20 minimal identity rows, supports keyboard/touch/assistive technology, cleans up Select2 handlers and DOM state on unmount, and excludes owner/inactive users.
- Choosing a user and confirming creates active access immediately; confirmation copy states that no recipient acceptance is required.
- Successful sharing adds an active row to owner management and causes the plan to appear on the recipient's next live `Crisis Plans` refresh.
- Active row shows recipient identity, active state, and `Revoke` action. Historical revoked/recipient-removed rows may be shown without plan content.
- Re-share is explicit and creates current-generation access.
- More than 90 active recipients is blocked with a clear capacity message; it does not modify existing shares.

## Revocation contract

- Revocation requires confirmation explaining that application access ends after online rekey succeeds but external screenshots/copies cannot be retracted.
- Online/unlocked flow displays progress while preparing/committing a new key generation. Success is announced only after atomic receipt.
- Offline revocation is saved as encrypted pending intent and prominently says the recipient may still have access.
- Conflict/failure keeps target visibly active or pending, preserves intent, and offers retry/refetch; it never falsely claims completion.
- On success target disappears from recipient live list and is shown as revoked to owner; no other recipient changes.
- If a recipient account is deleted, deactivated, or loses application access, shared-list/open/broker authorization denies immediately; the relationship may remain visible to the owner for audit until explicitly revoked.

## Recipient shared-plan contract

- Direct share appears in `Shared with me` without invitation/acceptance controls.
- Recipient must be online; selecting a summary starts a fresh broker open with an in-memory one-use key.
- While opening, show a generic loading state without stale content.
- Success renders normalized content read-only with owner identity and `Remove from my Crisis Plans` action.
- No edit, reshare, sharing settings, export, print-specific export, download, or offline-save control is supplied by this feature.
- Browser-level screenshots/copying cannot be prevented; revocation/removal messaging is honest about this limitation.
- Offline, revoked, removed, inactive, unknown, decryption failure, or generation mismatch yields a concealed unavailable/online-required state without sensitive metadata.
- `Remove` requires confirmation, acts online, removes only this recipient's access, and returns to the live shared list.

## Recipient teardown contract

On `offline`, `visibilitychange` to hidden, route leave, logout, session invalidation, owner/account switch, or unmount:

1. remove shared plan nodes from React/component state and DOM;
2. drop references to CPK and one-use private key;
3. abort in-flight fetch/decrypt work;
4. clear response/blob/object URLs if any (none should normally exist); and
5. render only a locked/online-required state if route remains.

No recipient response may be written to IndexedDB, local/session storage, Cache Storage, service worker, search index, analytics, error report, clipboard automatically, or prefetch cache.

## Accessibility and responsive behavior

- All controls are keyboard/touch operable with visible focus and 44×44 CSS-pixel targets where practical.
- Toolbar buttons expose pressed state and accessible names; editor has label/instructions/error association.
- Status live regions announce only state such as saved/pending/synced/conflict/online-required, never plan text, recipient names, or trigger answers.
- Shared-list and owner-share states have text equivalents; no color-only meaning.
- Reflow at 320, 375, and 390 CSS pixels, 200% zoom, iPhone safe-area/onscreen keyboard, iPad split/orientation, Safari selection behavior, and toolbar wrapping preserve content/focus/actions.
- Automated axe coverage includes create/edit, gate, trigger, share combobox, revoke confirmation, shared list, read-only view, offline, and conflict states.

## Performance presentation

- Local editor/trigger changes visibly respond within 100 ms.
- Owner locally available plan renders without waiting for network after unlock.
- Online views target usable state within 2 seconds ordinarily and 5 seconds on degraded mobile or show accurate bounded loading/pending state.
- Never keep plaintext pre-rendered offscreen to meet performance targets.
- Large plan bodies lazy-load only when owner/shared plan is opened; Journal navigation and shared summaries do not contain plaintext previews.

## Clinical-scope language

- UI describes the content as the user's own crisis plan/personal-wellness information.
- Do not state or imply monitoring, diagnosis, clinical review, emergency dispatch, HIPAA-regulated care, guaranteed availability, or notification of shared users.
- Trigger display is neutral and does not label an answer/value as a risk score.
