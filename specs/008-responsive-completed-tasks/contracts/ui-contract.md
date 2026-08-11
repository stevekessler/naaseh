# UI Contract: Responsive Completed Tasks Experience

This contract defines user-observable behavior. It does not change the existing HTTP, storage, sync,
or export contracts.

## 1. Canonical terminology and navigation

- The authenticated main navigation exposes a control with accessible name **Completed Tasks**.
- The report page exposes one primary heading named **Completed Tasks**.
- Page-identifying visible and accessible copy uses “Completed Tasks”; operational AWS dashboards and
  historical/internal identifiers are not renamed.
- Activating the control continues to navigate to `/dashboard`.
- Existing `/dashboard` saved links open the renamed page without redirect or data loss.

## 2. Completion chart projection

Given a selected local, network, or encrypted-cache report source:

1. Validate all raw periods without mutating them.
2. If any period is malformed, negative, non-integer, non-finite, or duplicates another key, show the
   safe report calculation error and recovery action.
3. Otherwise, retain periods whose `count > 0` in original chronological order.
4. Render a chart only when at least one retained period exists.
5. When none exists, render one programmatically announced empty state:
   - active Category, Project, or priority filters: no completed tasks match the current filters;
   - no active filter: no completed tasks occurred in the selected range.

The following remain unchanged and visible independently of chart rows:

- aggregate total and priority-at-completion breakdown;
- detail rows, sorting, pagination, and CSV export;
- pending local-change, offline, stale-cache, last-synchronized, conflict, calculation, retry, and
  restart states;
- raw local/server/cache bucket collections and synchronization calculations.

## 3. Standard responsive field contract

- A field unit contains its label, control, help, and validation message and never visually overlaps
  another field unit.
- Standard text, date, number, select, searchable reference, and textarea controls use the full
  available field-unit width with `min-width: 0` behavior.
- At 480 CSS pixels and below, standard labeled field units form one column.
- Compact checkbox/radio/chip controls may share or wrap within a row when every target, label, and
  focus indicator remains usable.
- Above 480 CSS pixels, related fields may form bounded intentional columns; no field stretches across
  unrelated content merely because space exists.
- Reflow does not change field values, active filters, validation state, or focus context.

## 4. Stack move action contract

At phone widths:

```text
+----------------------+----------------------+
| Move up              | Move down            |
+----------------------+----------------------+
| Move to position                            |
+---------------------------------------------+
| Position editor and Apply (when expanded)   |
+---------------------------------------------+
```

- Move up and Move down have equal available width and a visible gap.
- Move to position spans the full action-group width below them.
- The revealed position form spans the group and remains within the stack row.
- DOM/focus order is Move up, Move down, Move to position, position input, Apply position.
- First/last/only-item disabled states remain distinguishable without color alone.
- Existing move semantics, live announcements, touch alternatives, and focus return to the moved row
  remain unchanged.

## 5. General action and control contract

- Every interactive target is at least 44 by 44 CSS pixels.
- Primary, secondary, quiet, selected, disabled, pending, and destructive states have consistent
  visible treatment and do not rely only on color.
- An action group wraps or stacks complete controls with consistent gaps and logical DOM order.
- Button text may wrap but is never clipped or replaced by an unexplained icon solely to fit.
- Focus indicators remain visible and unclipped.

## 6. Containment, overflow, and safe areas

- At required viewport widths, document horizontal overflow is no more than one CSS pixel of rounding
  tolerance.
- Visible controls remain within their usable page, dialog, card, or fieldset container.
- Labeled field/control rectangles and adjacent action rectangles do not intersect unintentionally.
- Long labels, task names, URLs, project names, usernames, amounts, and validation text wrap or expose
  an accessible full value without forcing document overflow.
- The collapsed main navigation may scroll horizontally within its own region; all items remain
  keyboard/touch reachable and the document itself does not scroll horizontally.
- Root, fixed task detail, native/custom dialogs, menus, and bottom actions apply safe-area insets once
  per edge and allow essential controls to scroll above dynamic browser chrome and on-screen keyboards.
- Dialogs remain dismissible and do not exceed the usable dynamic viewport.

## 7. Responsive state and accessibility

- Resize or orientation change preserves entered values, selected filters, pending edits, open
  dialogs, current page, and logical focus context.
- Visual order matches programmatic reading/focus order at every breakpoint.
- The contract remains true at 200% text zoom, with reduced motion, touch, keyboard, and screen-reader
  operation.
- No layout alternative renders content the authenticated actor is not authorized to see.

## 8. Required validation profiles

- Widths: 320, 375, 390, 768, 1024, 1280, and 1440 CSS pixels.
- Browsers: current Chromium and WebKit, including configured iPhone and iPad profiles.
- Mobile: representative portrait and landscape, safe area, browser chrome, and on-screen keyboard.
- States: loading, empty, populated, validation, success, offline, pending, stale, conflict, and error
  where the scoped page supports them.
- Responsive audit inventory: every production area named in FR-009 of [spec.md](../spec.md).
