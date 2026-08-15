# UI Contracts

## Task edit dialog

- Every primary editable task representation exposes an Edit action with the same accessible name.
- Activation loads the latest durable local task, opens a native modal dialog through `showModal()`, labels it with task context, moves focus to the first invalid or first editable control, traps background interaction, and restores the trigger's focus after close.
- Save is one versioned task mutation, disabled while submitting, and cannot double-submit. A failed/offline/pending/conflicting save retains input and gives actionable state.
- Escape, backdrop, Cancel, navigation, or task-switch dismissal with dirty input requires confirmation. Confirmed cancel writes nothing.
- Lifecycle, delete, revisions, completion, and attachment actions are separate from the edit save.

## Reference combobox

The shared Downshift-backed `ReferenceCombobox<T>` provides:

- editable search text but a submitted value only after an authorized option is selected;
- standard combobox/listbox roles, expanded/selected/active-descendant state, Arrow/Home/End/Enter/Escape behavior, touch selection, labeled clear, no-results, loading, and offline-incomplete states;
- normalized local filtering within 200 ms for 1,000 cached options and a maximum of 50 rendered results;
- menu containment in the task dialog/iPhone viewport without clipping the primary action;
- no raw search terms in telemetry.

Parent options exclude self, descendants, inactive/archived or unauthorized candidates. Duplicate labels include safe project/category context or a short opaque ID. Group options contain only groups the actor may use, and optional group fields expose an explicit empty choice.

## Memo editor

- Lazy-load the constrained Lexical editor when the memo control becomes relevant.
- Toolbar buttons expose pressed state and accessible labels for bold, italic, strikethrough, ordered list, and unordered list; supported keyboard editing/composition works in Chromium and WebKit.
- Paste strips unsupported structure/attributes and never executes markup. Lists are flat in version 1.
- The editor serializes the versioned document and deterministic plain projection together. Hidden mode encrypts both; locked hidden content never initializes plaintext UI/search.
- Display, copy, search, backup/restore, sync, and authorized export preserve the supported semantics. Unsupported formatting degrades to text, not data loss.

## Due controls

- No date selection renders no date text/node and no `Someday` placeholder.
- The form distinguishes date-only from date+time. Timed choices are `00:00` through `23:55` at five-minute intervals in the current browser zone.
- Editing an existing off-grid time injects that exact selected value; an unrelated save does not round it.
- No time-zone selector appears. A zone change refreshes displayed local values before confirmation without mutating the stored instant. Nonexistent DST local time is rejected with a field error.

## Timer

- Opening a new timer proposes ten minutes; duration is an integer 1..1,440.
- UI always identifies task, configured duration, remaining time, status, repeat state, connectivity, pending sync, and conflict state.
- Start, pause, resume, stop, restart, repeat toggle, and confirmed duration change follow the domain state machine. Starting another task names the active task and requires explicit Switch confirmation.
- Passive ticking is local and remains correct after navigation/reload/suspension from canonical timestamps. Audio/notification is best effort; unavailability is explained without changing task or timer state.
- Timer conflicts offer refresh/context plus Reapply and Discard; neither action silently replaces canonical state.

## Personal stack ranking

- A visible authorized row has a labeled pointer/touch drag handle. Drag feedback names the task, valid destination, prospective/resulting position, and pending/success/failure/conflict state through text/live announcements, not animation alone.
- Only visible occupied positions are valid filtered-drop targets. Self/outside/unauthorized/changed targets do nothing and explain failure where action is needed.
- Existing Move up, Move down, and Move to position controls remain the keyboard/long-distance path and produce the identical domain move.
- Reduced motion disables nonessential animation; scroll/zoom/touch targets remain usable on iPhone/iPad.

## Priority and post-it color

- Active priority choices are Low, Medium, High, Critical. Compact badges use a distinct fixed shape/glyph and `aria-label="Priority: …"`; color is supplementary.
- Post-it color choices are labeled radio swatches for Yellow, Pink, Blue, Green, Purple, and Orange. Checked/text state conveys selection. Cancel/failure/conflict retains durable color.

## Profile, administration, and directory

- `/profile`: authenticated personal reminders, sound, Google setup, password, TFA, and other user-scoped settings; no system/global administration.
- `/admin`: administrator-only users and system configuration; server authorization remains mandatory even when invoked outside UI.
- `/directory`: global reusable-item administration under its established active-user authorization; individual list pages retain linked-item selection/reset but no global CRUD.
- Compatibility links such as `/google` may redirect to `/profile#google` without duplicating state.

The user administration surface is a semantic table with caption, labeled headers, stable row IDs, row headers, busy/error announcements, server pagination (maximum 100), opaque cursor, responsive horizontal scroll/sticky identity column, and accessible version-aware row actions.

## List item initial amount

- Initial add collects name, optional amount, and cost/positive meaning and submits them as one operation.
- Invalid amount is a field error, creates no item, and retains valid name/other input.
- Optimistic/offline success shows one pending item with the correct signed amount; retry remains idempotent.

## Completed report/export

- Filters show no time-zone control and ignore obsolete saved zone preference without changing other preferences.
- The browser derives its current zone at confirmation and sends it silently for boundary calculation.
- Export shows a job state, never a partial Blob. Download becomes available only after server integrity validation.
- All-user export requires an administrator-only, explicit scope confirmation that describes the breadth and creates an audit event.

## Accessibility and responsive verification

Primary journeys must work with pointer, touch, keyboard, screen reader, 200% zoom, reduced motion, current Chromium, current WebKit, and representative iPhone/iPad viewports. No essential control may be clipped, dependent only on color, or inaccessible when drag, audio, notification, or network capability is unavailable.
