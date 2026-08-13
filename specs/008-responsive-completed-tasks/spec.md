# Feature Specification: Responsive Completed Tasks Experience

**Feature Branch**: `current working branch`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Change Dashboard to Completed Tasks, do not show zero-item days while syncing, and review all designs so buttons and fields fit well together on mobile and desktop, using the attached screenshots as examples."

## Clarifications

### Session 2026-08-10

- Q: Which reporting periods and synchronization states should omit zero-count entries? → A: Hide zero-count days, weeks, and months in every synchronization state.
- Q: How should the three stack move actions be arranged on mobile? → A: Show Move up and Move down side by side, with Move to position full width below and consistent gaps.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Focus the Completed Tasks Report on Meaningful Activity (Priority: P1)

A user opening the completion report sees it consistently identified as "Completed Tasks" and sees only days, weeks, or months that contain at least one completed item. Synchronization status remains visible without filling the report with zero-count periods.

**Why this priority**: The current report is dominated by rows that communicate no activity, especially while local changes are pending, making useful completion information hard to find.

**Independent Test**: Open the report with a mixture of positive and zero completion periods while synchronized, pending synchronization, offline, and showing cached results; verify that only positive periods appear and that the report and navigation use the new name.

**Acceptance Scenarios**:

1. **Given** the main navigation is visible, **When** the user looks for completion reporting, **Then** the navigation item is labeled "Completed Tasks" rather than "Dashboard."
2. **Given** the user opens completion reporting, **When** the page is displayed, **Then** its primary heading is "Completed Tasks" and related visible and accessible labels use the same terminology.
3. **Given** a selected reporting range contains periods with positive and zero completion counts, **When** the chart is displayed, **Then** only periods with one or more completed items appear and positive totals remain unchanged.
4. **Given** local changes are pending synchronization, **When** completion results are displayed, **Then** the synchronization message remains visible and zero-count periods remain omitted.
5. **Given** every period in the selected range has a zero count, **When** the report is displayed, **Then** the user sees a concise empty-state message instead of zero-count rows or a blank unexplained chart.
6. **Given** filters change which periods contain completions, **When** the result updates, **Then** newly zero periods disappear, positive periods remain in chronological order, and the total and detailed rows stay consistent with the visible result.

---

### User Story 2 - Use Every Existing Workflow on a Phone (Priority: P1)

A user can operate every current page and state on a supported phone-sized viewport without labels colliding, fields overlapping, buttons being clipped, controls extending beyond the page, or essential actions being obscured by browser chrome.

**Why this priority**: The supplied screenshots show active workflows becoming difficult or impossible to use because controls overlap or form uneven button blocks on mobile.

**Independent Test**: Complete the primary journey and inspect loading, empty, populated, validation, offline, pending-sync, conflict, and error states for each current application area at the minimum supported width and representative iPhone widths in both portrait and landscape.

**Acceptance Scenarios**:

1. **Given** a phone-sized viewport, **When** a form or filter contains several fields, **Then** each label remains visually associated with one field, controls do not overlap, and the fields form a readable single-column or intentionally grouped layout.
2. **Given** a phone-sized viewport, **When** stack reordering controls appear, **Then** "Move up" and "Move down" occupy an equal two-button row and "Move to position" spans the row below, with consistent gaps, readable text, distinct boundaries, and no horizontal clipping.
3. **Given** a user scrolls to an action near the bottom of a mobile page, **When** browser toolbars or device safe areas are present, **Then** the action can be scrolled fully into view and activated without being permanently covered.
4. **Given** text is zoomed to 200 percent or the user has longer translated or user-provided content, **When** controls reflow, **Then** essential text remains readable and interactive controls remain operable without two-dimensional page scrolling.
5. **Given** an action is unavailable, selected, pending, destructive, or primary, **When** it appears on mobile, **Then** its state remains visually distinguishable without relying on color alone.
6. **Given** the viewport rotates or changes size, **When** the layout reflows, **Then** entered data, selected filters, focus context, open dialogs, and pending work are preserved.

---

### User Story 3 - Use Cohesive, Efficient Layouts on Desktop and Tablet (Priority: P2)

A user on tablet or desktop sees forms, filters, content, and action groups arranged into coherent columns with consistent sizing and spacing. Controls use available space without becoming excessively wide, leaving unexplained gaps, or appearing disconnected from the content they affect.

**Why this priority**: Responsive quality requires deliberate wide-screen composition as well as fixing narrow screens; simply stretching mobile controls does not produce an efficient desktop workflow.

**Independent Test**: Review every current application area at representative tablet and desktop widths and verify consistent alignment, bounded content width, meaningful grouping, and preservation of each workflow.

**Acceptance Scenarios**:

1. **Given** a wide viewport, **When** related fields can fit side by side, **Then** they align to a consistent grid with compatible heights and widths while labels remain clear.
2. **Given** a group contains primary and secondary actions, **When** there is ample width, **Then** the actions appear together in a predictable order with consistent sizing and do not stretch across unrelated content.
3. **Given** a page contains long-form content, reports, lists, or dialogs, **When** it is displayed on desktop, **Then** readable content width is bounded and intentional space separates distinct sections.
4. **Given** the same workflow is used on tablet and desktop, **When** the viewport crosses a layout boundary, **Then** no control vanishes unless an equivalent accessible control remains available.

---

### User Story 4 - Navigate and Operate Responsive Controls Accessibly (Priority: P2)

A keyboard, touch, screen-reader, or switch-control user can understand and operate the revised layouts in a logical order with adequate targets and visible focus, regardless of viewport size.

**Why this priority**: Layout fixes can accidentally change visual order without fixing focus order, shrink targets, or detach labels, so accessibility must be part of the responsive contract.

**Independent Test**: Traverse every revised navigation, form, filter, dialog, list action, and report using keyboard and screen-reader semantics, then repeat primary actions with touch at mobile sizes.

**Acceptance Scenarios**:

1. **Given** controls have visually reflowed, **When** the user traverses them sequentially, **Then** focus follows a logical reading and action order matching the visual layout.
2. **Given** a user operates by touch, **When** selecting adjacent controls, **Then** each target is at least 44 by 44 CSS pixels and has enough separation to avoid accidental activation.
3. **Given** a control receives keyboard focus, **When** it is visible, **Then** a clear focus indicator is not clipped or hidden by surrounding elements.
4. **Given** a field has an error, help text, or status, **When** assistive technology reaches it, **Then** the field retains its programmatic label and the related message is announced in context.

### Edge Cases

- A completion period changes from zero to positive or positive to zero after synchronization; the chart updates without duplicate periods, incorrect totals, or loss of the synchronization message.
- Cached and network completion reports disagree temporarily; whichever source is explicitly presented follows the same zero-period display rule, while staleness and conflict status remain visible.
- No completed tasks match the selected filters, but completed tasks exist outside them; the empty state explains that the current filters have no results rather than implying all history is empty.
- A report period has a negative or malformed count because of corrupt or invalid data; it is not displayed as valid activity, and the report surfaces a safe calculation error rather than silently falsifying totals.
- Navigation text "Completed Tasks" is longer than "Dashboard" on the narrow header; it remains fully readable, reachable in horizontal navigation, and has an accurate accessible name.
- Stack move controls are disabled because an item is first, last, or the only item; the disabled state is visually distinct and the remaining action layout does not collapse awkwardly.
- A form includes a long label, validation message, searchable dropdown, date input, or browser-native control with intrinsic minimum width; it shrinks or stacks without overlapping neighboring controls.
- A dialog, dropdown, or menu opens close to a screen edge, on-screen keyboard, browser toolbar, or device notch; it remains dismissible and its essential actions can be brought into view.
- Dynamic content appears after load, including sync banners, conflicts, validation errors, attachment progress, or update prompts; it reflows content rather than covering controls or causing unrecoverable layout shift.
- Very long task names, project names, usernames, amounts, URLs, or localized button labels wrap or truncate with an accessible full value and never force page-level horizontal overflow.
- Offline navigation and cached pages retain the same layout, and reconnecting does not reset field values or move focus unexpectedly.
- Printing and native application-install presentation are outside this feature; ordinary browser display in supported viewport sizes remains in scope.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The main navigation entry currently labeled "Dashboard" MUST be renamed to "Completed Tasks."
- **FR-002**: The completion report's primary page heading MUST be "Completed Tasks," and user-visible or assistive labels that identify the page MUST use consistent completed-task terminology.
- **FR-003**: Existing routes, saved links, authorization behavior, completion data, export behavior, and report-filter meaning MUST remain unchanged by the rename.
- **FR-004**: Completion charts MUST omit every day, week, or month whose count is zero or less after the active range and filters are applied.
- **FR-005**: Omitting zero-count periods MUST NOT change positive counts, report totals, urgency breakdowns, detail rows, chronological ordering, export contents, or synchronization calculations.
- **FR-006**: The zero-period display rule MUST apply equally to local, network, cached, offline, stale, and pending-synchronization report presentations.
- **FR-007**: When no positive-count period remains, the report MUST replace the chart with an accessible empty state that distinguishes an empty filtered result from unavailable or failed data.
- **FR-008**: Pending synchronization, offline, stale-data, conflict, retry, and calculation-error status MUST remain independently visible whether or not the chart contains periods.
- **FR-009**: The responsive review MUST cover every current user-facing application area: sign-in; global header and navigation; tasks in list and post-it views; task details, subtasks, attachments, and hidden memos; search and filters; personal stack; Google synchronization; Completed Tasks; projects and categories; archive and deletion; lists and global directory; groups; reminders and settings; administration; dialogs; and global sync, update, storage, conflict, loading, empty, validation, offline, pending, success, and error states.
- **FR-010**: At widths from 320 CSS pixels through wide desktop, pages MUST NOT have unintended page-level horizontal scrolling, overlapping content, clipped labels, clipped focus indicators, or interactive controls rendered outside their usable container.
- **FR-011**: Form fields MUST keep their label, control, help text, and validation message together as one layout unit and MUST stack before the unit overlaps or becomes unusably narrow.
- **FR-012**: Fields displayed in the same intentional row MUST use compatible control heights, spacing, and alignment; different control types MUST not overlap or visually merge.
- **FR-013**: Button and link-action groups MUST preserve a documented primary-to-secondary order, consistent gaps, readable labels, and distinct boundaries at every supported width.
- **FR-014**: Action groups MUST wrap or stack as complete controls when space is insufficient; a button MUST NOT be split, clipped, reduced below its minimum target, or placed partly outside its container.
- **FR-015**: Mobile stack move actions MUST show move-up and move-down as equal-width controls in one row and the direct-position control at full group width below, with consistent gaps, while preserving disabled-state and focus-return behavior.
- **FR-016**: Filters on tasks, archives, personal stacks, reports, projects, and other current pages MUST reflow without label/control collisions and MUST preserve values when the viewport changes.
- **FR-017**: Main content, dialogs, menus, and bottom-of-page action areas MUST account for browser chrome and device safe areas so every essential control can be scrolled fully into view.
- **FR-018**: Controls that are primary, secondary, selected, disabled, pending, or destructive MUST have consistent and distinguishable states across application areas without relying only on color.
- **FR-019**: All interactive touch targets MUST be at least 44 by 44 CSS pixels, including icon-only, checkbox, disclosure, pagination, navigation, and row-action controls.
- **FR-020**: Responsive reflow MUST preserve field values, filters, pending edits, dialog state, and logical focus context across viewport resize or orientation change.
- **FR-021**: Content widths, field widths, and action widths on desktop MUST be bounded according to their content and grouping so controls do not stretch unnecessarily across unrelated space.
- **FR-022**: User-provided text and translated interface text MUST wrap, truncate, or expand within its component without obscuring required information or causing page-level overflow; truncated content MUST remain available accessibly.
- **FR-023**: The visual reading order and programmatic focus order MUST remain logical and equivalent after responsive reflow.
- **FR-024**: Responsive fixes MUST preserve all existing authorization boundaries and MUST NOT reveal protected task, list, group, archive, attachment, memo, or account content through layout, labels, status text, or inaccessible off-screen rendering.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: This feature reads completion totals, existing page content, control state, and synchronization state already authorized for the signed-in user; it adds no sharing or mutation rights. Responsive layouts must render only data already permitted for the current actor, must not expose hidden content in clipped/off-screen alternatives or accessible names, and must preserve administrator-only and collaboration boundaries.
- **NFR-002 Data Durability & Recovery**: Renaming and display filtering are presentation changes and must not rewrite completion events, report buckets, task state, saved filters, pending changes, or synchronization records. Responsive reflow must not submit, discard, duplicate, or reset in-progress user input. Existing retry, conflict, cache, backup, and recovery behavior remains authoritative.
- **NFR-003 Offline Support**: Completed Tasks naming, zero-period omission, and responsive layouts must work from the installed application and warmed local cache without a connection. Offline, pending, stale, and reconnecting states must remain visible and usable. Reconnection may refresh data but must not silently reset layout state, filters, or pending edits.
- **NFR-004 Browser & Responsive Support**: All scoped journeys must work in current stable Chrome and Safari/WebKit at 320, 375, 390, 768, 1024, 1280, and 1440 CSS-pixel viewport widths, with representative portrait and landscape mobile orientations and an iPhone/iPad safe-area environment. They must remain usable with touch, keyboard, screen readers, 200 percent text zoom, reduced motion, and on-screen keyboards where relevant.
- **NFR-005 Errors & Observability**: Existing report and synchronization failures must retain actionable, non-sensitive messages after layout changes. Layout defects do not require new production logging. Existing reporting and synchronization logs, metrics, alarms, correlation, and protected-content redaction remain unchanged; client-side diagnostics must not capture screenshots, field values, task content, or other protected data.
- **NFR-006 Performance**: Each scoped page must present usable above-the-fold controls within two seconds under the existing representative mobile and degraded-network profile. Viewport changes and ordinary interaction-state reflow must settle within 200 milliseconds, and hiding zero-count periods must not delay visible report results by more than 100 milliseconds for a 366-period range.
- **NFR-007 AWS Architecture & Cost Impact**: The feature is limited to terminology, presentation filtering, and responsive client layouts. It must reuse existing AWS reporting, synchronization, storage, and observability architecture, add no always-on compute or new managed service, and produce no material increase in ongoing AWS cost.

### Key Entities

- **Completion Period**: A day, week, or month in the active report range with a chronological key and completed-item count. Only periods with a positive displayed count appear in the chart; omission does not delete or mutate the underlying report result.
- **Completion Report State**: The visible source and freshness context for the report, including local, network, cached, offline, stale, pending-synchronization, empty, or error state. This state remains visible independently of chart rows.
- **Responsive Layout Unit**: A related group such as a labeled field, action group, navigation group, content card, dialog, or status block that must reflow as a coherent unit without overlap or loss of meaning.
- **Viewport Profile**: A supported width, height, orientation, browser class, safe-area condition, input mode, and zoom setting used to verify each scoped journey.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: "Dashboard" appears zero times as the user-facing name of completion reporting, while "Completed Tasks" identifies the navigation entry and page in 100% of supported viewport and assistive-technology checks.
- **SC-002**: For local, network, cached, offline, stale, and pending-sync reports, 100% of displayed chart periods have counts greater than zero and the sum of displayed period counts equals the applicable report total.
- **SC-003**: When no positive period exists, 100% of tested empty and filtered-empty cases show the correct empty explanation while preserving applicable sync, offline, stale, or error status.
- **SC-004**: At every required viewport profile, automated layout checks find zero unintended page-level horizontal overflow, overlapping controls, clipped interactive text, inaccessible off-screen actions, or clipped focus indicators across the scoped primary journeys and states.
- **SC-005**: At 320, 375, and 390 CSS-pixel widths, users can operate all scoped field and action groups—including the supplied stack and filter examples—without horizontal panning and with 100% of targets meeting the 44-by-44-pixel minimum.
- **SC-006**: At 768, 1024, 1280, and 1440 CSS-pixel widths, 100% of reviewed forms and action groups align to intentional responsive grids and no individual field or action occupies unrelated available width without a documented reason.
- **SC-007**: In moderated testing, at least 90% of participants can complete the task-filter, stack-reorder, and completion-report journeys on both phone and desktop on the first attempt without reporting that controls overlap, feel disconnected, or are difficult to activate.
- **SC-008**: Keyboard and screen-reader testing completes every revised primary journey with zero focus-order mismatches, focus traps, missing programmatic labels, or state changes communicated only by color.
- **SC-009**: Resizing or rotating during an in-progress form, filtered view, or open dialog preserves entered values and task context in 100% of covered regression tests.
- **SC-010**: Report filtering and responsive reflow meet the 100-millisecond and 200-millisecond presentation targets respectively on the representative mobile performance profile.

## Assumptions

- "Dashboard" refers specifically to the completion-report navigation item and page, not to internal route names, code symbols, unrelated administrative summaries, or historical specification text.
- "Completed Tasks" is the exact user-facing replacement, including capitalization.
- "Zero item days" refers to any displayed daily, weekly, or monthly reporting period with a count of zero; all such periods are omitted in every synchronization state, not only while synchronization is pending.
- The pending-sync message in the first screenshot remains visible; hiding zero periods must not hide synchronization progress or imply that pending work is already counted remotely.
- If all periods are omitted, a purposeful empty state is preferable to an empty chart container.
- "Review all designs" covers all current production user-facing pages, dialogs, navigation, forms, filters, reports, and meaningful dynamic states listed in FR-009. Developer-only test harnesses, print layouts, future unbuilt pages, and operating-system/browser-owned interfaces are outside scope.
- The supplied screenshots are representative defects, not the complete review inventory: the stack actions and filter layout must be fixed, and the same standards must be applied consistently elsewhere.
- The minimum supported application width is 320 CSS pixels. Desktop review extends through 1440 CSS pixels; larger viewports should retain the bounded desktop composition.
- Existing visual identity, colors, typography, routes, data behavior, and authorization semantics remain unless a change is required to satisfy fit, consistency, accessibility, or the explicit naming requirements.
- Responsive behavior may change the number of columns and action wrapping, but it must not remove capabilities or replace visible text with unexplained icons solely to make controls fit.
- No new user data or server-side persistence is introduced. Existing completion and synchronization records remain unchanged.
