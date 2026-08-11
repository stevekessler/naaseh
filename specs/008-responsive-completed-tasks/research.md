# Research: Responsive Completed Tasks Experience

## 1. Zero-count period boundary

**Decision**: Preserve zero-filled local and server report aggregates and filter nonpositive periods
only in a presentation selector after `CompletionDashboard` chooses its local, network, or encrypted
cache source.

**Rationale**: One display boundary applies the accepted rule to every freshness/sync state while
leaving totals, urgency breakdowns, details, exports, cache recovery, and synchronization unchanged.
The server and local bucketing functions intentionally initialize complete period ranges, and existing
contracts and integration tests depend on that raw shape.

**Alternatives considered**: Removing zero initialization from local and server bucketing would alter
the established aggregate contract and create source/version compatibility work. Filtering before
caching would make cached and live representations differ. Changing export would violate the explicit
scope.

## 2. Presentation validation and empty-state precedence

**Decision**: Use a pure selector that distinguishes `ready`, `empty`, and `invalid` display outcomes.
Zero is valid but hidden; positive integer counts are visible in original chronological order;
negative, non-integer, non-finite, duplicate, or malformed periods produce the existing safe report
calculation-error treatment. Empty copy distinguishes active-filter emptiness from no activity in the
selected range. Sync/offline/stale/error status remains outside and independent of the chart branch.

**Rationale**: Silently filtering corrupt negative values would make a malformed report look valid.
An explicit empty outcome avoids an unexplained blank chart, and orthogonal status preserves the
constitution's observable-failure and offline requirements.

**Alternatives considered**: Rendering zero-width bars reproduces the reported problem. Treating every
all-zero result as an error confuses valid inactivity with failure. Adding a new schema dependency to
the browser is unnecessary for the small presentation invariant.

## 3. Terminology and route compatibility

**Decision**: Rename the user-facing main-navigation entry, page heading, page-identifying accessible
name, and user documentation to **Completed Tasks**. Keep the internal `dashboard` section and
`/dashboard` route unchanged.

**Rationale**: Stable routes preserve saved links and avoid migration/redirect work. Users receive
consistent terminology without conflating the product page with operational CloudWatch dashboards or
historical code/specification identifiers.

**Alternatives considered**: Renaming the route adds no user value and breaks saved links. Replacing
every technical use of “dashboard” would incorrectly rename unrelated operational concepts.

## 4. Responsive layout architecture

**Decision**: Extend the existing CSS with additive, component-scoped responsive primitives rather
than JavaScript viewport state or a third-party UI library. Normalize control sizing, `max-width`,
`min-width: 0`, overflow wrapping, focus, disabled states, field grids, action groups, and bounded
content. At 480 CSS pixels and below, standard labeled fields use one column; compact controls such as
checkboxes or priority chips may intentionally share or wrap within a row.

**Rationale**: The current 120-pixel flex basis permits the observed field collisions. CSS responds to
container/viewport changes without duplicating layout state in React and naturally preserves input,
dialog, and focus state. The single-column mobile default is predictable; explicit compact exceptions
retain useful density.

**Alternatives considered**: Page-specific breakpoint logic duplicates fixes and drifts. A new design
system or UI dependency is disproportionate. Allowing every field to auto-fit at 160 pixels still
produces cramped browser-native controls and long labels at phone widths.

## 5. Stack action geometry

**Decision**: Style the existing `StackMoveControls` DOM as a two-column mobile grid: Move up and Move
down have equal width in the first row, Move to position spans both columns below, and the revealed
position editor also spans the group. Preserve DOM order, focus return, native disabled behavior, and
the 44-pixel target minimum. Wider layouts may use a bounded compact row when all labels fit.

**Rationale**: This exactly records the accepted clarification, keeps paired directional actions
together, and prevents the uneven border-touching block shown in the screenshot without changing
reorder behavior.

**Alternatives considered**: Three full-width rows waste space; three narrow buttons in one phone row
clip text; icons reduce clarity and are unnecessary.

## 6. Safe areas, dialogs, and dynamic browser chrome

**Decision**: Reuse the existing safe-area tokens once per edge and extend them to scroll padding,
fixed task details, native/custom dialogs, and bottom action reachability. Use dynamic viewport units,
bounded block sizes, internal overflow, and sufficient trailing content padding so browser toolbars and
on-screen keyboards cannot permanently cover essential controls.

**Rationale**: Safe-area variables and `viewport-fit=cover` already exist, but only root padding uses
them. Centralized edge handling avoids both uncovered controls and double padding across iPhone/iPad
orientations.

**Alternatives considered**: Fixed pixel insets fail across devices and browser chrome states.
JavaScript visual-viewport listeners add timing/state complexity before CSS capabilities are exhausted.

## 7. Responsive audit and automated evidence

**Decision**: Create a page/state inventory tied to FR-009 and a focused table-driven Playwright suite
for 320, 375, 390, 768, 1024, 1280, and 1440 widths. Share geometry assertions for document overflow,
container containment, control intersections, target size, safe-area reachability, and focus clipping.
Combine them with semantic keyboard/touch journeys, axe scans, resize/orientation state checks, long
content, reduced motion, and targeted screenshots only as diagnostic evidence.

**Rationale**: Existing tests check page overflow and a few targets but do not audit every named area
or detect field/button intersections. Geometry plus semantics is more stable and informative than
global pixel snapshots, while a bounded responsive suite avoids multiplying the entire E2E suite by
every width.

**Alternatives considered**: Manual-only review is not repeatable. Screenshot-only regression is
brittle and weak on focus, semantics, and hidden actions. Running every application test at seven
widths would make the release gate unnecessarily slow.

## 8. Performance measurement

**Decision**: Add a deterministic 366-period selector benchmark for the 100 ms target and measure
viewport reflow across animation frames for the 200 ms target. Retain the existing degraded-network
browser profile for the two-second above-the-fold goal and existing server completion-report
performance tests unchanged.

**Rationale**: Pure selector timing isolates report presentation cost; browser timing is required for
layout settling. Keeping server benchmarks unchanged proves the feature does not shift work to AWS.

**Alternatives considered**: Developer-observed timings are not reproducible. Unit timing cannot prove
render/reflow behavior, and browser timing alone makes selector regressions harder to diagnose.

## 9. Data, interfaces, infrastructure, and observability

**Decision**: Add no persisted entity, HTTP contract, sync message, external integration, AWS resource,
CloudWatch metric, or production logging. Document the changed behavior in a UI contract and update
user documentation. Retain all existing API/contract/security/restore tests as regression gates.

**Rationale**: This is a deterministic client presentation and layout feature. Server-side changes
would add compatibility, cost, privacy, and operational surface without improving the outcome.

**Alternatives considered**: A new server response excluding zeros would break older clients and raw
zero-filled contract expectations. Layout telemetry or captured screenshots would create privacy and
cardinality risk without a clear operational action.
