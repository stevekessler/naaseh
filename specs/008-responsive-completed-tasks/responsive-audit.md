# Responsive Audit Matrix

Owner: feature 008 implementation. Evidence is recorded in [validation.md](validation.md).

| Area | Required states | Phone 320/375/390 | Tablet 768/1024 | Desktop 1280/1440 | Accessibility evidence | Status |
|---|---|---|---|---|---|---|
| Sign-in and account entry | default, validation, error | geometry + keyboard | geometry | bounded card | axe, focus, zoom | Pending |
| Header and navigation | expanded, collapsed, offline, pending, error | local nav scroll; safe area | wrapping | bounded grid | order, names, 44px | Targeted pass |
| Tasks, details, subtasks, attachments, memos | loading, empty, populated, validation, pending, error | containment + dialogs | grids | bounded content | axe, focus, touch | Pending |
| Search and filters | empty, populated, long values, validation | one-column fields | intentional grid | intentional grid | labels, resize state | Targeted pass |
| Personal Stack | first, middle, last, only, pending, conflict | exact move geometry | bounded controls | bounded controls | order, disabled, focus return | Targeted pass |
| Completed Tasks | local, network, cache, zero, invalid, offline, stale, pending | positive-only + containment | chart/content | chart/content | status and error semantics | Pass |
| Projects, categories, archive | empty, populated, validation, long content | containment | grids | bounded tree/forms | labels, targets | Pending |
| Lists and directory | empty, populated, edit, long amount | containment | grids | bounded actions | semantics, targets | Pending |
| Groups | empty, populated, create/join dialogs, error | dialog reachability | bounded dialog | bounded content | axe, focus return | Pending |
| Google synchronization | disconnected, connected, pending, error | actions reachable | bounded definition list | bounded content | status semantics | Pending |
| Reminders and settings | default, changed, error | wrapping controls | bounded controls | bounded content | labels, keyboard | Pending |
| Administration | users/categories, validation, error | one-column fields | grids | bounded actions | safe names, errors | Pending |
| Global transient UI | update, storage, retry, conflict, native/custom dialogs | safe area/browser chrome | dynamic viewport | bounded dialog | focus, reduced motion | Targeted pass |

## Closure criteria

Every row requires document overflow within one CSS pixel, controls contained by their usable
region, no unintended intersections, 44-by-44 targets for standard interactive controls, visible
focus, logical DOM order, state preservation through reflow, and representative Chromium/WebKit
evidence. Diagnostics must contain geometry only—never protected task or account content.

“Targeted pass” means the feature-specific automated geometry/accessibility evidence passed, but the
row remains open for complete state coverage. The repository-wide browser gate currently fails on
pre-existing feature-007 selectors and offline lazy-loading, so rows still marked Pending and all
Targeted pass rows must be closed before claiming 100% application-wide completion.
